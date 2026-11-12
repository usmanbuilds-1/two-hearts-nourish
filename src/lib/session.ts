import { supabase } from "@/integrations/supabase/client";
import { mergeLinkedSession } from "@/lib/space-entry-policy";

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

/** Keep an existing recovery key only when this is exactly the same room and member. */
export function writeSession(s: LocalSession) {
  localStorage.setItem(KEY, JSON.stringify(mergeLinkedSession(s, readSession())));
}

/** Only call from explicit Leave or Forget actions. */
export async function clearSession() {
  localStorage.removeItem(KEY);
  await supabase.auth.signOut().catch(() => {});
}

/** Ensures this browser has its own invisible guest identity. */
export async function ensureIdentity() {
  const { data, error: sessionError } = await supabase.auth.getSession();
  // A failed refresh or network request is not permission to replace an identity.
  if (sessionError) throw new Error("OFFLINE_OR_UNAVAILABLE");
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
  ALREADY_IN_SPACE: "This browser is already connected to a space. Open Today instead; we never erase your existing space to create a new one.",
  OFFLINE_OR_UNAVAILABLE: "We can't reach the server right now. Check your connection and try again.",
  INVALID_LINK: "That recovery link is invalid or already used. Ask for a fresh link in Settings.",
  NO_PARTNER: "Your partner has not joined this space yet.",
  RECOVERY_STORAGE_UNAVAILABLE: "Recovery needs a database update. Please contact the app owner.",
  NOT_MEMBER: "Your session has expired. Please rejoin with your invite link.",
};

export function friendlyError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  for (const k of Object.keys(MESSAGES)) if (msg.includes(k)) return MESSAGES[k] as string;
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You're offline. We'll reconnect when you're back.";
  return "Something went wrong. Please try again.";
}
