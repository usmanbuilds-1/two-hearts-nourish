const TERMINAL_AUTH_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "user_banned",
  "bad_jwt",
]);

// PostgREST can be the first surface to reveal that a cached access token is
// no longer usable. PGRST301 means the JWT is invalid. PGRST303 is broader, so
// only its explicitly expired-token form is terminal; e.g. clock-skew errors
// must remain retry-only.
const TERMINAL_DATA_API_CODES = new Set(["pgrst301"]);

/**
 * Only classify errors that mean the stored Supabase auth session cannot become
 * valid by retrying. Network failures, timeouts, 429s and 5xx remain retry-only.
 */
export function isDefinitiveAuthSessionFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: unknown;
    errorCode?: unknown;
    status?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const rawCode = typeof value.code === "string"
    ? value.code
    : typeof value.errorCode === "string" ? value.errorCode : "";
  const code = rawCode.toLowerCase();
  if (TERMINAL_AUTH_CODES.has(code) || TERMINAL_DATA_API_CODES.has(code)) return true;

  // Older/wrapped clients may omit the auth code while preserving the
  // canonical message. Include PostgREST's expired-JWT form, but do not treat
  // all 401/403 responses as terminal because RLS and temporary gateway errors
  // must never mint a replacement identity.
  const message = [value.message, value.details]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  if (code === "pgrst303" && (message.includes("jwt expired") || message.includes("token has expired"))) {
    return true;
  }

  return (
    message.includes("invalid refresh token: refresh token not found") ||
    message.includes("invalid refresh token: already used") ||
    message.includes("auth session missing") ||
    message.includes("session not found") ||
    message.includes("jwt expired") ||
    message.includes("token has expired")
  );
}
