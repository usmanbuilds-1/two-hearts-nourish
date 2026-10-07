import { supabase } from "@/integrations/supabase/client";

const KEY = "us.session.v1";

export type LocalSession = { roomCode: string; memberId: string; key?: string };

export function readSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalSession;
    return s.roomCode && s.memberId ? s : null;
  } catch {
    return null;
  }
}

export function writeSession(s: LocalSession) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearSession() {
  localStorage.removeItem(KEY);
  await supabase.auth.signOut().catch(() => {});
}

/** Ensures this browser has its own invisible guest identity. */
export async function ensureIdentity() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.user) throw new Error("OFFLINE_OR_UNAVAILABLE");
  return anon.user.id;
}

export function inviteUrl(code: string) {
  return `${window.location.origin}/r/${code}`;
}

const MESSAGES: Record<string, string> = {
  ROOM_FULL: "This space already belongs to two people ❤️",
  ROOM_NOT_FOUND: "We couldn't find a space with that code.",
  INVALID_CODE: "That code doesn't look right. It should look like 7KQ4-M2PX.",
  INVALID_KEY: "That personal key doesn't match anyone in this space.",
  ALREADY_IN_SPACE: "This phone is already part of a space. Reset it in Settings first.",
  OFFLINE_OR_UNAVAILABLE: "We can't reach the server right now. Check your connection and try again.",
  INVALID_LINK: "That device code is wrong or expired. Make a new one in Settings on your other phone.",
  NOT_MEMBER: "Your session has expired. Please rejoin with your invite link.",
};

export function friendlyError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  for (const k of Object.keys(MESSAGES)) if (msg.includes(k)) return MESSAGES[k] as string;
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You're offline. We'll reconnect when you're back.";
  return "Something went wrong. Please try again.";
}
