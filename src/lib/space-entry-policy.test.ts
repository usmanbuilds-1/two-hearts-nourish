import { describe, expect, it } from "vitest";
import {
  hasRecoveryKey, mergeLinkedSession, resolveSpaceEntry,
  type SpaceEntryDependencies,
} from "./space-entry-policy";

const saved = { roomCode: "7KQ4-M2PX", memberId: "member-1", key: "a".repeat(64) };
type Space = { id: string };

function deps(override: Partial<SpaceEntryDependencies<Space>> = {}): SpaceEntryDependencies<Space> {
  return {
    readSavedSession: () => saved,
    hasAuthSession: async () => true,
    getUserId: async () => "user-1",
    loadSpace: async () => ({ id: "room-1" }),
    restoreMember: async () => ({ id: "restored" }),
    isDefinitiveAuthFailure: (error) =>
      typeof error === "object" && error !== null &&
      "code" in error && (error as { code?: unknown }).code === "session_not_found",
    replaceInvalidAuthSession: async () => {},
    ...override,
  };
}

describe("persistent private space policy", () => {
  it("never treats a database or network error as logout", async () => {
    expect(await resolveSpaceEntry(deps({ loadSpace: async () => { throw new Error("offline"); } })))
      .toEqual({ kind: "retry", roomCode: saved.roomCode });
  });
  it("does not replace an identity after transient getUser failures", async () => {
    let restored = false;
    const state = await resolveSpaceEntry(deps({
      getUserId: async () => { throw new Error("network"); },
      restoreMember: async () => { restored = true; return { id: "wrong" }; },
    }));
    expect(state.kind).toBe("retry");
    expect(restored).toBe(false);
  });
  it("replaces a definitively dead auth session and rebinds with the saved key", async () => {
    let replaced = 0;
    const state = await resolveSpaceEntry(deps({
      getUserId: async () => { throw { code: "session_not_found" }; },
      replaceInvalidAuthSession: async () => { replaced += 1; },
    }));
    expect(replaced).toBe(1);
    expect(state).toEqual({ kind: "ready", space: { id: "restored" } });
  });

  it("recovers when getSession itself reports a dead refresh token", async () => {
    let replaced = 0;
    const state = await resolveSpaceEntry(deps({
      hasAuthSession: async () => { throw { code: "session_not_found" }; },
      replaceInvalidAuthSession: async () => { replaced += 1; },
    }));
    expect(replaced).toBe(1);
    expect(state).toEqual({ kind: "ready", space: { id: "restored" } });
  });

  it("does not replace auth for a transient timeout", async () => {
    let replaced = 0;
    const state = await resolveSpaceEntry(deps({
      hasAuthSession: async () => { throw { code: "request_timeout" }; },
      replaceInvalidAuthSession: async () => { replaced += 1; },
    }));
    expect(replaced).toBe(0);
    expect(state).toEqual({ kind: "retry", roomCode: saved.roomCode });
  });

  it("requires manual recovery if auth is dead but no saved recovery key exists", async () => {
    let replaced = 0;
    const state = await resolveSpaceEntry(deps({
      readSavedSession: () => ({ roomCode: saved.roomCode, memberId: saved.memberId }),
      getUserId: async () => { throw { code: "session_not_found" }; },
      replaceInvalidAuthSession: async () => { replaced += 1; },
    }));
    expect(replaced).toBe(0);
    expect(state).toEqual({ kind: "recover", roomCode: saved.roomCode });
  });

  it("rebinds a missing guest session with a saved personal key", async () => {
    expect(await resolveSpaceEntry(deps({ hasAuthSession: async () => false })))
      .toEqual({ kind: "ready", space: { id: "restored" } });
  });
  it("asks for manual recovery without a personal key", async () => {
    expect((await resolveSpaceEntry(deps({
      readSavedSession: () => ({ roomCode: saved.roomCode, memberId: saved.memberId }),
      hasAuthSession: async () => false,
    }))).kind).toBe("recover");
  });
  it("distinguishes invalid keys from temporary outages", async () => {
    const base = { hasAuthSession: async () => false };
    expect((await resolveSpaceEntry(deps({
      ...base, restoreMember: async () => { throw new Error("INVALID_KEY"); },
    }))).kind).toBe("recover");
    expect((await resolveSpaceEntry(deps({
      ...base, restoreMember: async () => { throw new Error("fetch failed"); },
    }))).kind).toBe("retry");
  });
  it("keeps a key only for the exact same room and member", () => {
    expect(hasRecoveryKey(saved)).toBe(true);
    expect(mergeLinkedSession({ roomCode: saved.roomCode, memberId: saved.memberId }, saved).key).toBe(saved.key);
    expect(mergeLinkedSession({ roomCode: "OTHER-ROOM", memberId: saved.memberId }, saved).key).toBeUndefined();
    expect(mergeLinkedSession({ roomCode: saved.roomCode, memberId: "other" }, saved).key).toBeUndefined();
  });
});
