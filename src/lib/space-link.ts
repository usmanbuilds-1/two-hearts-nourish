import { readInviteToken, readRejoinToken } from "./rejoin-links";

export type SpaceLink = {
  code: string;
  token: string | null;
  kind: "invite" | "rejoin" | null;
};

/** Accept a room identifier or same-origin private invite/recovery URL. */
export function parseSpaceLink(raw: string, currentOrigin: string): SpaceLink | null {
  const input = raw.trim();
  const plain = input.toUpperCase().replace(/[\s-]/g, "");
  if (/^[A-Z2-9]{8}$/.test(plain)) {
    return { code: plain.slice(0,4) + "-" + plain.slice(4), token: null, kind: null };
  }
  try {
    const origin = new URL(currentOrigin).origin;
    const url = new URL(input, origin);
    if (url.origin !== origin || url.username || url.password || url.search) return null;
    const match = /^\/r\/([A-Z2-9]{4}-?[A-Z2-9]{4})\/?$/i.exec(url.pathname);
    if (!match) return null;
    const value = match[1]!.toUpperCase().replace("-", "");
    const invite = readInviteToken(url.hash);
    const rejoin = readRejoinToken("", url.hash);
    if (invite && rejoin) return null;
    if (url.hash && !invite && !rejoin) return null;
    return {
      code: value.slice(0,4) + "-" + value.slice(4),
      token: invite ?? rejoin,
      kind: invite ? "invite" : rejoin ? "rejoin" : null,
    };
  } catch {
    return null;
  }
}

export function spaceLinkToPath(result: SpaceLink): string {
  const secret = result.token && result.kind ? "#" + result.kind + "=" + result.token : "";
  return "/r/" + encodeURIComponent(result.code) + secret;
}
