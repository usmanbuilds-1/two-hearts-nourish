function validToken(token: string) {
  return /^[a-f0-9]{64}$/i.test(token);
}

/** Keep one-time secrets out of HTTP request paths and query strings. */
export function buildRejoinUrl(origin: string, roomCode: string, token: string) {
  if (!validToken(token)) throw new Error("INVALID_LINK");
  return origin.replace(/\/$/, "") + "/r/" + encodeURIComponent(roomCode) + "#rejoin=" + token.toLowerCase();
}

export function buildInviteUrl(origin: string, roomCode: string, token: string) {
  if (!validToken(token)) throw new Error("INVALID_INVITE");
  return origin.replace(/\/$/, "") + "/r/" + encodeURIComponent(roomCode) + "#invite=" + token.toLowerCase();
}

/** Reject legacy short secrets to prevent online guessing. */
export function readRejoinToken(_search: string, hash: string): string | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, "")).get("rejoin");
  return fragment !== null && validToken(fragment) ? fragment.toLowerCase() : null;
}

export function readInviteToken(hash: string): string | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, "")).get("invite");
  return fragment !== null && validToken(fragment) ? fragment.toLowerCase() : null;
}
