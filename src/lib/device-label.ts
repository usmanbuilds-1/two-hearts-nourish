/** Human-readable browser label. UA is cosmetic and can be spoofed; never authenticate with it.
 * Android model names are only included when the browser discloses them.
 */
export function friendlyDeviceLabel(ua:string):string {
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
  let model:string|null=null;
  if(device==="Android"){
    // Most Android Chrome UAs expose this field; reduced UAs do not.
    const modelMatch=/Android\s+[\d.]+;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/|[;)])/i.exec(ua);
    const candidate=modelMatch?.[1]?.trim()??"";
    if(candidate.length>=3&&candidate.length<=32&&
      /^[a-z0-9][a-z0-9 ._-]+$/i.test(candidate)&&
      !/^(k|wv|mobile|linux|en-us|chrome|android)$/i.test(candidate)){
      model=candidate.replace(/\s+/g," ");
    }
  }
  return [model??device,browser].filter(Boolean).join(" · ").slice(0,40);
}

/** Older default labels may be upgraded to actual available model names.
 * User-chosen labels must never be silently overwritten.
 */
export function shouldUpgradeDeviceLabel(previous:string|null,next:string|undefined):boolean {
  if(!next)return false;
  if(!previous)return true;
  const generic=/^(Android|iPhone|iPad|Mac|Windows PC|Browser)( · (Chrome|Safari|Firefox|Edge))?$/;
  return generic.test(previous)&&!generic.test(next);
}
