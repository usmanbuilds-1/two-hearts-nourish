import { z } from "zod";

/** An authenticated device can issue a login capability only for its owner.
 * A room member must never mint a credential for their partner's identity.
 * Any self-issued link still requires the 256-bit token and expires after
 * 20 minutes (the existing one-time redemption flow).
 */
export const selfRecoveryRequestSchema = z.object({
  forMember: z.literal("self"),
});
