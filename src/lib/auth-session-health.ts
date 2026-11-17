const TERMINAL_AUTH_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "user_banned",
  "bad_jwt",
]);

/**
 * Only classify errors that mean the stored Supabase auth session cannot become
 * valid by retrying. Network failures, timeouts, 429s and 5xx remain retry-only.
 */
export function isDefinitiveAuthSessionFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code.toLowerCase() : "";
  if (TERMINAL_AUTH_CODES.has(code)) return true;

  // Older/wrapped auth-js versions may omit code while preserving the canonical
  // refresh-token message. Keep this deliberately narrow.
  const message = typeof value.message === "string" ? value.message.toLowerCase() : "";
  return (
    message.includes("invalid refresh token: refresh token not found") ||
    message.includes("invalid refresh token: already used") ||
    message.includes("auth session missing") ||
    message.includes("session not found")
  );
}
