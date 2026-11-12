/** Keep a one-time secret out of HTTP request paths and query strings. */
export function buildRejoinUrl(origin: string, roomCode: string, token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("INVALID_LINK");
  return `${origin.replace(/\/$/, "")}/r/${encodeURIComponent(roomCode)}#rejoin=${token.toLowerCase()}`;
}

/** Reject legacy short codes to prevent online guessing. */
export function readRejoinToken(_search: string, hash: string): string | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, "")).get("rejoin");
  if (fragment !== null) return /^[a-f0-9]{64}$/i.test(fragment) ? fragment.toLowerCase() : null;
  return null;
}
