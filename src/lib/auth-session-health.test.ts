import { describe, expect, it } from "vitest";
import { isDefinitiveAuthSessionFailure } from "./auth-session-health";

describe("auth session health", () => {
  it.each([
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_not_found",
    "session_expired",
    "user_not_found",
    "user_banned",
    "bad_jwt",
  ])("treats %s as terminal", (code) => {
    expect(isDefinitiveAuthSessionFailure({ code, status: 400 })).toBe(true);
  });

  it.each([
    "request_timeout",
    "over_request_rate_limit",
    "unexpected_failure",
  ])("keeps %s retry-only", (code) => {
    expect(isDefinitiveAuthSessionFailure({ code, status: 503 })).toBe(false);
  });

  it("recognizes the canonical invalid-refresh-token message when code is missing", () => {
    expect(isDefinitiveAuthSessionFailure({
      message: "Invalid Refresh Token: Refresh Token Not Found",
    })).toBe(true);
  });

  it("does not classify generic network errors as terminal", () => {
    expect(isDefinitiveAuthSessionFailure(new Error("fetch failed"))).toBe(false);
  });
});
