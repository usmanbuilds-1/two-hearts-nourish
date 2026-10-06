import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars → unbiased mod

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % 32];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeCode(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

const nameSchema = z.string().trim().min(1).max(40);
const codeSchema = z.string().max(20);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getRoomPreview = createServerFn({ method: "POST" })
  .inputValidator((i: { code: string }) => ({ code: codeSchema.parse(i.code) }))
  .handler(async ({ data }) => {
    const code = normalizeCode(data.code);
    if (!code) return { status: "invalid" as const };
    const db = await admin();
    const { data: room } = await db.from("rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) return { status: "not_found" as const };
    const { data: members } = await db
      .from("members")
      .select("display_name, seat")
      .eq("room_id", room.id)
      .order("seat");
    const inviter = members?.find((m) => m.seat === 1)?.display_name ?? null;
    return {
      status: (members?.length ?? 0) >= 2 ? ("full" as const) : ("open" as const),
      code,
      inviterName: inviter,
    };
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string }) => ({ name: nameSchema.parse(i.name) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: existing } = await db
      .from("members")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("ALREADY_IN_SPACE");

    let room: { id: string; room_code: string } | null = null;
    for (let i = 0; i < 5 && !room; i++) {
      const { data: r, error } = await db
        .from("rooms")
        .insert({ room_code: randomCode() })
        .select("id, room_code")
        .single();
      if (!error) room = r;
    }
    if (!room) throw new Error("SERVER_ERROR");

    const token = randomToken();
    const { data: member, error } = await db
      .from("members")
      .insert({
        room_id: room.id,
        seat: 1,
        display_name: data.name,
        auth_user_id: context.userId,
        participant_token_hash: await sha256(token),
      })
      .select("id")
      .single();
    if (error || !member) {
      await db.from("rooms").delete().eq("id", room.id);
      throw new Error("SERVER_ERROR");
    }
    return { roomCode: room.room_code, memberId: member.id, key: token };
  });

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; name: string }) => ({
    code: codeSchema.parse(i.code),
    name: nameSchema.parse(i.name),
  }))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (!code) throw new Error("INVALID_CODE");
    const db = await admin();
    const { data: room } = await db.from("rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) throw new Error("ROOM_NOT_FOUND");

    const { data: existing } = await db
      .from("members")
      .select("id, room_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("ALREADY_IN_SPACE");

    const { count } = await db
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);
    if ((count ?? 0) >= 2) throw new Error("ROOM_FULL");

    const token = randomToken();
    const { data: member, error } = await db
      .from("members")
      .insert({
        room_id: room.id,
        seat: 2,
        display_name: data.name,
        auth_user_id: context.userId,
        participant_token_hash: await sha256(token),
      })
      .select("id")
      .single();
    // unique(room_id, seat) guards against two people racing for seat 2
    if (error || !member) throw new Error("ROOM_FULL");
    return { roomCode: code, memberId: member.id, key: token };
  });

export const rejoinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; key: string }) => ({
    code: codeSchema.parse(i.code),
    key: z.string().trim().regex(/^[a-f0-9]{64}$/i).parse(i.key),
  }))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (!code) throw new Error("INVALID_CODE");
    const db = await admin();
    const { data: room } = await db.from("rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const { data: member } = await db
      .from("members")
      .select("id, auth_user_id")
      .eq("room_id", room.id)
      .eq("participant_token_hash", await sha256(data.key.toLowerCase()))
      .maybeSingle();
    if (!member) throw new Error("INVALID_KEY");
    if (member.auth_user_id !== context.userId) {
      const { data: other } = await db
        .from("members")
        .select("id")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (other) throw new Error("ALREADY_IN_SPACE");
      const { error } = await db
        .from("members")
        .update({ auth_user_id: context.userId })
        .eq("id", member.id);
      if (error) throw new Error("SERVER_ERROR");
    }
    return { roomCode: code, memberId: member.id, key: data.key.toLowerCase() };
  });

export const leaveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: me } = await db
      .from("members")
      .select("id, room_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me) return { ok: true };
    await db.from("members").delete().eq("id", me.id);
    const { count } = await db
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("room_id", me.room_id);
    if ((count ?? 0) === 0) await db.from("rooms").delete().eq("id", me.room_id);
    return { ok: true };
  });
