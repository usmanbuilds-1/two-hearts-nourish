/** Each device-specific recovery key restores its own membership slot, not a new
 * phantom "device". Legacy unbound keys can still add one new device.
 */
export function recoveryBinding(
  currentMemberId:string|null,
  matchedMemberId:string,
  linkedDeviceId:string|null
):"existing"|"rebind"|"register" {
  if(currentMemberId&&currentMemberId!==matchedMemberId)
    throw new Error("ALREADY_IN_SPACE");
  if(currentMemberId)return "existing";
  return linkedDeviceId?"rebind":"register";
}
