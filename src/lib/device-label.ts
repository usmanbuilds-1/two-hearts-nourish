/** Display-only label; avoid storing raw User-Agent strings as identity or secrets. */
export function friendlyDeviceLabel(ua: string): string {
  const device = /iphone/i.test(ua) ? "iPhone"
    : /ipad/i.test(ua) ? "iPad"
    : /android/i.test(ua) ? "Android"
    : /macintosh/i.test(ua) ? "Mac"
    : /windows/i.test(ua) ? "Windows PC"
    : "Browser";
  const browser = /edg\//i.test(ua) ? "Edge"
    : /firefox\//i.test(ua) ? "Firefox"
    : /crios\//i.test(ua) ? "Chrome"
    : /chrome\//i.test(ua) ? "Chrome"
    : /safari\//i.test(ua) ? "Safari"
    : "";
  return [device,browser].filter(Boolean).join(" · ").slice(0,40);
}
