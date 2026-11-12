import { supabase } from "@/integrations/supabase/client";
import { rejoinRoom } from "@/lib/room.functions";
import { ensureIdentity, readSession, writeSession } from "@/lib/session";
import { loadSpace } from "@/lib/space";
import { resolveSpaceEntry, type SpaceEntry, type StoredSpaceSession } from "./space-entry-policy";

type Space = NonNullable<Awaited<ReturnType<typeof loadSpace>>>;

// Deduplicate overlapping loader invalidations while a guest is being rebound.
let recoveryInFlight: Promise<Space> | null = null;

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
    hasAuthSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return Boolean(data.session);
    },
    getUserId: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    loadSpace,
    restoreMember,
  });
}
