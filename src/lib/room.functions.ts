import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { recoveryBinding } from "@/lib/device-recovery-policy";

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
const deviceLabelSchema = z.string().trim().min(2).max(40).optional();
const codeSchema = z.string().max(20);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof admin>>;

async function deviceMemberId(db: Db, uid: string) {
  const { data, error } = await db.from("member_devices").select("member_id").eq("auth_user_id", uid).maybeSingle();
  if (error) throw new Error("SERVER_ERROR");
  return data?.member_id ?? null;
}

async function addDevice(db: Db, memberId: string, uid: string, deviceLabel?: string) {
  const { error } = await db.from("member_devices").insert({
    member_id: memberId, auth_user_id: uid,
    device_label: deviceLabel ?? null, last_seen_at: new Date().toISOString()
  });
  if (error) throw new Error("SERVER_ERROR");
}

/** Creates a high-entropy, one-use recovery link for SELF or the other room member. 
 * This does not expose, rotate, or impersonate anyone's permanent recovery key. */
export const createRejoinLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { forMember: "self" | "partner" }) => ({
    forMember: z.enum(["self", "partner"]).parse(i.forMember),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const myId = await deviceMemberId(db, context.userId);
    if (!myId) throw new Error("NOT_MEMBER");
    const { data: me, error: meError } = await db.from("members")
      .select("id, room_id").eq("id", myId).single();
    if (meError || !me) throw new Error("NOT_MEMBER");
    let recipientId = myId;
    if (data.forMember === "partner") {
      const { data: partner, error: partnerError } = await db.from("members")
        .select("id").eq("room_id", me.room_id).neq("id", myId).maybeSingle();
      if (partnerError) throw new Error("SERVER_ERROR");
      if (!partner) throw new Error("NO_PARTNER");
      recipientId = partner.id;
    }
    const { data: room, error: roomError } = await db.from("rooms")
      .select("room_code").eq("id", me.room_id).single();
    if (roomError || !room) throw new Error("SERVER_ERROR");
    const token = randomToken(); // 256 bits; far safer than 6-digit codes
    const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
    const { data: updated, error } = await db.from("members").update({
      link_code_hash: await sha256(`${recipientId}:${token}`),
      link_code_expires_at: expiresAt,
    }).eq("id", recipientId).select("id").maybeSingle();
    if (error || !updated) throw new Error("SERVER_ERROR");
    return { roomCode: room.room_code, token, expiresAt };
  });

export const linkDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; linkCode: string; deviceLabel?: string }) => ({
    code: codeSchema.parse(i.code),
    linkCode: z.string().trim().regex(/^[a-f0-9]{64}$/i).parse(i.linkCode).toLowerCase(),
    deviceLabel: deviceLabelSchema.parse(i.deviceLabel),
  }))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (!code) throw new Error("INVALID_CODE");
    const db = await admin();
    const { data: room } = await db.from("rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const { data: members } = await db.from("members").select("id, link_code_hash, link_code_expires_at").eq("room_id", room.id);
    let match: string | null = null;
    const now = new Date().toISOString();
    for (const m of members ?? []) {
      if (m.link_code_hash && m.link_code_expires_at && m.link_code_expires_at > now &&
          m.link_code_hash === (await sha256(`${m.id}:${data.linkCode}`))) {
        match = m.id;
        break;
      }
    }
    if (!match) throw new Error("INVALID_LINK");
    const current = await deviceMemberId(db, context.userId);
    if (current && current !== match) throw new Error("ALREADY_IN_SPACE");

    // Conditional consume: concurrent attempts cannot both redeem a link.
    const claimHash = await sha256(`${match}:${data.linkCode}`);
    const { data: claimed, error: claimError } = await db.from("members")
      .update({ link_code_hash: null, link_code_expires_at: null })
      .eq("id", match)
      .eq("link_code_hash", claimHash)
      .gt("link_code_expires_at", now)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) throw new Error(claimError ? "SERVER_ERROR" : "INVALID_LINK");
    // Attach each newly generated recovery key to the exact phone mapping.
    let deviceId: string;
    if (current) {
      const { data: device, error } = await db.from("member_devices")
        .select("id").eq("auth_user_id", context.userId).single();
      if (error || !device) throw new Error("SERVER_ERROR");
      deviceId = device.id;
    } else {
      const { data: device, error } = await db.from("member_devices")
        .insert({ member_id: match, auth_user_id: context.userId,
          device_label: data.deviceLabel ?? null, last_seen_at: new Date().toISOString() })
        .select("id").single();
      if (error || !device) throw new Error("SERVER_ERROR");
      deviceId = device.id;
    }
    const newKey = randomToken();
    const { error: keyError } = await db.from("member_recovery_keys")
      .insert({ member_id: match, device_id: deviceId, token_hash: await sha256(newKey) });
    if (keyError) throw new Error("RECOVERY_STORAGE_UNAVAILABLE");
    return { roomCode: code, memberId: match, key: newKey };
  });

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
  .inputValidator((i: { name: string; deviceLabel?: string }) => ({
    name: nameSchema.parse(i.name), deviceLabel: deviceLabelSchema.parse(i.deviceLabel)
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const existingId = await deviceMemberId(db, context.userId);
    // Never destroy an existing single-member room when a returning user
    // loses the local room marker and mistakenly taps Create.
    if (existingId) throw new Error("ALREADY_IN_SPACE");

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
    await addDevice(db, member.id, context.userId, data.deviceLabel);
    return { roomCode: room.room_code, memberId: member.id, key: token };
  });

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; name: string; deviceLabel?: string }) => ({
    code: codeSchema.parse(i.code),
    name: nameSchema.parse(i.name),
    deviceLabel: deviceLabelSchema.parse(i.deviceLabel),
  }))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (!code) throw new Error("INVALID_CODE");
    const db = await admin();
    const { data: room } = await db.from("rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) throw new Error("ROOM_NOT_FOUND");

    const existingId = await deviceMemberId(db, context.userId);
    if (existingId) {
      const { data: existingMember } = await db.from("members").select("id, room_id").eq("id", existingId).maybeSingle();
      if (existingMember) {
        if (existingMember.room_id === room.id) {
          return { roomCode: code, memberId: existingMember.id };
        }
        throw new Error("ALREADY_IN_SPACE");
      }
      throw new Error("ALREADY_IN_SPACE");
    }

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
    await addDevice(db, member.id, context.userId, data.deviceLabel);
    return { roomCode: code, memberId: member.id, key: token };
  });

export const rejoinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; key: string; deviceLabel?: string }) => ({
    code: codeSchema.parse(i.code),
    key: z.string().trim().regex(/^[a-f0-9]{64}$/i).parse(i.key),
    deviceLabel: deviceLabelSchema.parse(i.deviceLabel),
  }))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (!code) throw new Error("INVALID_CODE");
    const db = await admin();
    const { data: room } = await db.from("rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const tokenHash = await sha256(data.key.toLowerCase());
    const { data: legacy, error: legacyError } = await db
      .from("members")
      .select("id")
      .eq("room_id", room.id)
      .eq("participant_token_hash", tokenHash)
      .maybeSingle();
    if (legacyError) throw new Error("SERVER_ERROR");
    let memberId = legacy?.id ?? null;
    let linkedDeviceId: string | null = null;
    if (!memberId) {
      // New device-specific recovery keys are separate from original member keys.
      const { data: record, error: keyError } = await db.from("member_recovery_keys")
        .select("member_id,device_id").eq("token_hash", tokenHash).maybeSingle();
      if (keyError) throw new Error("RECOVERY_STORAGE_UNAVAILABLE");
      if (record) {
        const { data: member, error: memberError } = await db.from("members")
          .select("id").eq("id", record.member_id).eq("room_id", room.id).maybeSingle();
        if (memberError) throw new Error("SERVER_ERROR");
        memberId = member?.id ?? null;
        if (memberId) linkedDeviceId = record.device_id;
      }
    }
    if (!memberId) throw new Error("INVALID_KEY");
    const current = await deviceMemberId(db, context.userId);
    const binding=recoveryBinding(current,memberId,linkedDeviceId);
    if (binding !== "existing") {
      if (binding === "rebind" && linkedDeviceId) {
        // Recover the SAME device slot after an anonymous auth token was lost.
        // Merely inserting a new row here produced many stale "devices".
        const {data:rebound,error:rebindError}=await db.from("member_devices")
          .update({auth_user_id:context.userId,last_seen_at:new Date().toISOString()})
          .eq("id",linkedDeviceId).eq("member_id",memberId)
          .select("id").maybeSingle();
        if(rebindError||!rebound)throw new Error("RECOVERY_STORAGE_UNAVAILABLE");
      } else {
        // Original legacy member keys were not tied to any one device.
        await addDevice(db,memberId,context.userId,data.deviceLabel);
      }
    }
    return { roomCode: code, memberId, key: data.key.toLowerCase() };
  });

export const leaveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const myId = await deviceMemberId(db, context.userId);
    if (!myId) return { ok: true };
    const { data: me } = await db.from("members").select("id, room_id").eq("id", myId).single();
    if (!me) return { ok: true };
    await db.from("members").delete().eq("id", me.id);
    const { count } = await db
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("room_id", me.room_id);
    if ((count ?? 0) === 0) await db.from("rooms").delete().eq("id", me.room_id);
    return { ok: true };
  });
