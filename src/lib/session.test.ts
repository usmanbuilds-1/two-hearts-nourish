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

import { ensureIdentity } from "./session";

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
