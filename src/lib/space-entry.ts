import { supabase } from "@/integrations/supabase/client";
import { rejoinRoom } from "@/lib/room.functions";
import { ensureIdentity, readSession, replaceDeadIdentity, writeSession } from "@/lib/session";
import { loadSpace } from "@/lib/space";
import { resolveSpaceEntry, type SpaceEntry, type StoredSpaceSession } from "./space-entry-policy";
import { isDefinitiveAuthSessionFailure } from "./auth-session-health";

type Space = NonNullable<Awaited<ReturnType<typeof loadSpace>>>;

// Deduplicate overlapping loader invalidations while a guest is being rebound.
let recoveryInFlight: Promise<Space> | null = null;

const TRANSIENT_READ_RETRY_MS = [150, 500] as const;

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Entry reads are safe to retry. This absorbs short Safari/network/deploy
 * blips without turning them into a login-like screen. Terminal auth errors
 * escape immediately so the secure recovery-key rebind can run instead.
 */
async function retryTransientRead<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_READ_RETRY_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (
        isDefinitiveAuthSessionFailure(error) ||
        browserIsOffline() ||
        attempt === TRANSIENT_READ_RETRY_MS.length
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_READ_RETRY_MS[attempt] ?? 500));
    }
  }
  throw lastError;
}

async function restoreMember(saved: StoredSpaceSession): Promise<Space> {
  if (recoveryInFlight) return recoveryInFlight;
  recoveryInFlight = (async () => {
    const userId = await ensureIdentity();
    const result = await rejoinRoom({ data: { code: saved.roomCode, key: saved.key! } });
    if (result.memberId !== saved.memberId) throw new Error("RECOVERY_MISMATCH");
    writeSession(result);
    const space = await loadSpace(userId);
    if (!space) throw new Error("RECOVERY_NOT_READY");
    return space;
  })();
  try {
    return await recoveryInFlight;
  } finally {
    recoveryInFlight = null;
  }
}

export function loadSpaceEntry(): Promise<SpaceEntry<Space>> {
  return resolveSpaceEntry<Space>({
    readSavedSession: readSession,
    hasAuthSession: () => retryTransientRead(async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return Boolean(data.session);
    }),
    getUserId: () => retryTransientRead(async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    }),
    loadSpace: (userId) => retryTransientRead(() => loadSpace(userId)),
    restoreMember,
    isDefinitiveAuthFailure: isDefinitiveAuthSessionFailure,
    replaceInvalidAuthSession: async () => {
      await replaceDeadIdentity();
    },
  });
}
