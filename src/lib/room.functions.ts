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
const capabilitySchema = z.string().trim().regex(/^[a-f0-9]{64}$/i);

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

function throwRpcError(error: { message?: string } | null, fallback = "SERVER_ERROR"): never {
  const message = error?.message ?? "";
  for (const code of ["ALREADY_IN_SPACE","ROOM_FULL","ROOM_NOT_FOUND","INVALID_INVITE","INVALID_ROOM_CREATE"]) {
    if (message.includes(code)) throw new Error(code);
  }
  throw new Error(fallback);
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
  .inputValidator((i: { code: string; inviteToken?: string; rejoinToken?: string }) => ({
    code: codeSchema.parse(i.code),
    inviteToken: capabilitySchema.optional().parse(i.inviteToken),
    rejoinToken: capabilitySchema.optional().parse(i.rejoinToken),
  }))
  .handler(async ({ data }) => {
    const code = normalizeCode(data.code);
    if (!code) return { status: "invalid" as const };
    const db = await admin();
    const { data: room, error: roomError } = await db.from("rooms")
      .select("id,invite_token_hash,invite_expires_at").eq("room_code", code).maybeSingle();
    if (roomError) throw new Error("SERVER_ERROR");
    if (!room) return { status: "not_found" as const };

    const now = new Date().toISOString();
    let authorized = false;
    let mode: "invite"|"rejoin"|null = null;
    if (
      data.inviteToken && room.invite_token_hash && room.invite_expires_at &&
      room.invite_expires_at > now &&
      room.invite_token_hash === await sha256(data.inviteToken.toLowerCase())
    ) {
      authorized = true;
      mode = "invite";
    }

    const { data: members, error: memberError } = await db
      .from("members")
      .select("id,display_name,seat,link_code_hash,link_code_expires_at")
      .eq("room_id", room.id)
      .order("seat");
    if (memberError) throw new Error("SERVER_ERROR");

    if (!authorized && data.rejoinToken) {
      for (const member of members ?? []) {
        if (
          member.link_code_hash && member.link_code_expires_at &&
          member.link_code_expires_at > now &&
          member.link_code_hash === await sha256(member.id + ":" + data.rejoinToken.toLowerCase())
        ) {
          authorized = true;
          mode = "rejoin";
          break;
        }
      }
    }

    if (!authorized) return { status: "private" as const, code };
    const inviter = mode === "invite"
      ? members?.find((member) => member.seat === 1)?.display_name ?? null
      : null;
    return {
      status: (members?.length ?? 0) >= 2 ? ("full" as const) : ("open" as const),
      code,
      inviterName: inviter,
      access: mode,
    };
  });

export const createPartnerInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { data: member, error: memberError } = await db.from("members")
      .select("room_id").eq("id", memberId).single();
    if (memberError || !member) throw new Error("NOT_MEMBER");
    const { count, error: countError } = await db.from("members")
      .select("id", { count: "exact", head: true }).eq("room_id", member.room_id);
    if (countError) throw new Error("SERVER_ERROR");
    if ((count ?? 0) >= 2) throw new Error("ROOM_FULL");
    const { data: room, error: roomError } = await db.from("rooms")
      .select("room_code").eq("id", member.room_id).single();
    if (roomError || !room) throw new Error("SERVER_ERROR");

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const { error: updateError } = await db.from("rooms").update({
      invite_token_hash: await sha256(token),
      invite_expires_at: expiresAt,
    }).eq("id", member.room_id);
    if (updateError) throw new Error("SERVER_ERROR");
    return { roomCode: room.room_code, token, expiresAt };
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; deviceLabel?: string }) => ({
    name: nameSchema.parse(i.name),
    deviceLabel: deviceLabelSchema.parse(i.deviceLabel),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    if (await deviceMemberId(db, context.userId)) throw new Error("ALREADY_IN_SPACE");

    const recoveryToken = randomToken();
    const inviteToken = randomToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = randomCode();
      const { data: created, error } = await db.rpc("create_room_with_owner", {
        p_room_code: roomCode,
        p_auth_user_id: context.userId,
        p_display_name: data.name,
        p_device_label: data.deviceLabel ?? "",
        p_participant_hash: await sha256(recoveryToken),
        p_invite_hash: await sha256(inviteToken),
        p_invite_expires_at: expiresAt,
      });
      if (!error && created && typeof created === "object") {
        const memberId = String((created as { member_id?: unknown }).member_id ?? "");
        if (!memberId) throw new Error("SERVER_ERROR");
        return { roomCode, memberId, key: recoveryToken, inviteToken, inviteExpiresAt: expiresAt };
      }
      if (error?.message?.includes("rooms_room_code_key")) continue;
      throwRpcError(error);
    }
    throw new Error("SERVER_ERROR");
  });

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; inviteToken: string; name: string; deviceLabel?: string }) => ({
    code: codeSchema.parse(i.code),
    inviteToken: capabilitySchema.parse(i.inviteToken).toLowerCase(),
    name: nameSchema.parse(i.name),
    deviceLabel: deviceLabelSchema.parse(i.deviceLabel),
  }))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (!code) throw new Error("INVALID_CODE");
    const db = await admin();
    if (await deviceMemberId(db, context.userId)) throw new Error("ALREADY_IN_SPACE");

    const recoveryToken = randomToken();
    const { data: memberId, error } = await db.rpc("join_room_with_invite", {
      p_room_code: code,
      p_auth_user_id: context.userId,
      p_display_name: data.name,
      p_device_label: data.deviceLabel ?? "",
      p_participant_hash: await sha256(recoveryToken),
      p_invite_hash: await sha256(data.inviteToken),
    });
    if (error || !memberId) throwRpcError(error);
    return { roomCode: code, memberId, key: recoveryToken };
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
      .select("id,auth_user_id")
      .eq("room_id", room.id)
      .eq("participant_token_hash", tokenHash)
      .maybeSingle();
    if (legacyError) throw new Error("SERVER_ERROR");
    let memberId = legacy?.id ?? null;
    let linkedDeviceId: string | null = null;
    if(memberId && legacy?.auth_user_id){
      // The original personal key is also tied to the founding/joining
      // browser via the member's primary auth pointer.
      const {data:original,error:originalError}=await db.from("member_devices")
        .select("id").eq("member_id",memberId)
        .eq("auth_user_id",legacy.auth_user_id).maybeSingle();
      if(originalError)throw new Error("SERVER_ERROR");
      linkedDeviceId=original?.id??null;
    }
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
        const {data:rebound,error:rebindError}=await db.rpc("rebind_member_device",{
          p_member_id:memberId,
          p_device_id:linkedDeviceId,
          p_new_auth_user_id:context.userId,
          p_update_primary:Boolean(legacy)
        });
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
