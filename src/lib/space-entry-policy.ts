/** Pure policy for opening an existing couple space. No credential erasure. */
export type StoredSpaceSession = {
  roomCode: string;
  memberId: string;
  key?: string;
};

export type SpaceEntry<T> =
  | { kind: "ready"; space: T }
  | { kind: "retry"; roomCode: string }
  | { kind: "recover"; roomCode: string }
  | { kind: "new" };

export type SpaceEntryDependencies<T> = {
  readSavedSession: () => StoredSpaceSession | null;
  hasAuthSession: () => Promise<boolean>;
  getUserId: () => Promise<string | null>;
  loadSpace: (userId: string) => Promise<T | null>;
  restoreMember: (saved: StoredSpaceSession) => Promise<T>;
};

/** A six-digit link cannot reproduce the original personal key stored as a hash. */
export function mergeLinkedSession(next: StoredSpaceSession, prior: StoredSpaceSession | null): StoredSpaceSession {
  if (next.key) return next;
  const sameMember = prior?.memberId === next.memberId;
  const sameRoom = prior?.roomCode.toUpperCase() === next.roomCode.toUpperCase();
  return sameMember && sameRoom && prior?.key ? { ...next, key: prior.key } : next;
}

export function hasRecoveryKey(saved: StoredSpaceSession): boolean {
  return typeof saved.key === "string" && /^[a-f0-9]{64}$/i.test(saved.key);
}

/** Unlike timeout, offline or 5xx failures, these deny the saved recovery data. */
export function isDefinitiveRecoveryFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(INVALID_KEY|INVALID_CODE|ROOM_NOT_FOUND|ALREADY_IN_SPACE|RECOVERY_MISMATCH)\b/.test(message);
}

/** Deliberately never signs out, clears storage or redirects on request failure. */
export async function resolveSpaceEntry<T>(deps: SpaceEntryDependencies<T>): Promise<SpaceEntry<T>> {
  const saved = deps.readSavedSession();
  if (!saved) return { kind: "new" };
  const retry = (): SpaceEntry<T> => ({ kind: "retry", roomCode: saved.roomCode });
  const recover = (): SpaceEntry<T> => ({ kind: "recover", roomCode: saved.roomCode });

  const restore = async (): Promise<SpaceEntry<T>> => {
    if (!hasRecoveryKey(saved)) return recover();
    try {
      return { kind: "ready", space: await deps.restoreMember(saved) };
    } catch (error) {
      return isDefinitiveRecoveryFailure(error) ? recover() : retry();
    }
  };

  let hasAuth: boolean;
  try {
    hasAuth = await deps.hasAuthSession();
  } catch {
    return retry();
  }
  if (!hasAuth) return restore();

  let userId: string | null;
  try {
    userId = await deps.getUserId();
  } catch {
    // Don't create another anonymous identity while an auth session exists.
    return retry();
  }
  if (!userId) return recover();

  try {
    const space = await deps.loadSpace(userId);
    if (space) return { kind: "ready", space };
  } catch {
    return retry();
  }

  // An authenticated identity without a device mapping may rebind securely
  // with a previously saved personal key, never just a room code.
  return restore();
}
