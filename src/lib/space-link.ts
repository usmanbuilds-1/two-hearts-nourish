import { readRejoinToken } from "./rejoin-links";

/** Accept room codes or this application's own invitation/recovery URLs. */
export function parseSpaceLink(raw: string, currentOrigin: string): { code: string; token: string | null } | null {
  const input = raw.trim();
  const plain = input.toUpperCase().replace(/[\s-]/g, "");
  if (/^[A-Z2-9]{8}$/.test(plain)) {
    return {code: plain.slice(0,4) + "-" + plain.slice(4),token:null};
  }
  try {
    const origin = new URL(currentOrigin).origin;
    const url = new URL(input, origin);
    if (url.origin !== origin || url.username || url.password || url.search) return null;
    const match = /^\/r\/([A-Z2-9]{4}-?[A-Z2-9]{4})\/?$/i.exec(url.pathname);
    if (!match) return null;
    const value = match[1]!.toUpperCase().replace("-","");
    const token = url.hash ? readRejoinToken("", url.hash) : null;
    if (url.hash && token === null) return null;
    return {code:value.slice(0,4)+"-"+value.slice(4),token};
  } catch {
    return null;
  }
}

export function spaceLinkToPath(result: {code:string;token:string|null}): string {
  return "/r/" + encodeURIComponent(result.code) + (result.token ? "#rejoin=" + result.token : "");
}
