import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth },
}));

import { clearSession, ensureIdentity, sessionCanRecoverRoom } from "./session";

describe("ensureIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a validated existing anonymous identity", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "existing-user" } } },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: { user: { id: "existing-user" } },
      error: null,
    });

    await expect(ensureIdentity()).resolves.toBe("existing-user");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates an anonymous identity when there is no session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signInAnonymously.mockResolvedValue({
      data: { user: { id: "new-user" } },
      error: null,
    });

    await expect(ensureIdentity()).resolves.toBe("new-user");
  });

  it("replaces a definitively dead locally cached session", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "stale-user" } } },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: "session_not_found", message: "Auth session missing" },
    });
    auth.signInAnonymously.mockResolvedValue({
      data: { user: { id: "replacement-user" } },
      error: null,
    });

    await expect(ensureIdentity()).resolves.toBe("replacement-user");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("replaces a session when getSession reports a terminal refresh-token error", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token" },
    });
    auth.signInAnonymously.mockResolvedValue({
      data: { user: { id: "replacement-user" } },
      error: null,
    });

    await expect(ensureIdentity()).resolves.toBe("replacement-user");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not replace identity on a transient network failure", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { code: "request_timeout", message: "request timed out" },
    });

    await expect(ensureIdentity()).rejects.toThrow("OFFLINE_OR_UNAVAILABLE");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
});


describe("clearSession", () => {
  it("signs out only this browser/device", async () => {
    localStorage.setItem("us.session.v1", JSON.stringify({
      roomCode: "ABCD-2345",
      memberId: "member-1",
      key: "a".repeat(64),
    }));
    auth.signOut.mockResolvedValue({ error: null });

    await clearSession();

    expect(localStorage.getItem("us.session.v1")).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("sessionCanRecoverRoom", () => {
  const key = "a".repeat(64);

  it("accepts the saved recovery key only for the same canonical room", () => {
    expect(sessionCanRecoverRoom(
      { roomCode: "ABCD-2345", memberId: "member-1", key },
      "abcd2345",
    )).toBe(true);
  });

  it("rejects a saved key belonging to a different room", () => {
    expect(sessionCanRecoverRoom(
      { roomCode: "ABCD-2345", memberId: "member-1", key },
      "WXYZ-6789",
    )).toBe(false);
  });

  it("rejects missing or malformed recovery keys", () => {
    expect(sessionCanRecoverRoom(
      { roomCode: "ABCD-2345", memberId: "member-1" },
      "ABCD-2345",
    )).toBe(false);
    expect(sessionCanRecoverRoom(
      { roomCode: "ABCD-2345", memberId: "member-1", key: "short" },
      "ABCD-2345",
    )).toBe(false);
  });
});
