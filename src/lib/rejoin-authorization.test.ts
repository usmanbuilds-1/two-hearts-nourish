import { describe, expect, it } from "vitest";
import { selfRecoveryRequestSchema } from "./rejoin-authorization";

describe("one-time device recovery issuer authorization", () => {
  it("allows the authenticated profile to issue a link for themselves", () => {
    expect(selfRecoveryRequestSchema.parse({ forMember: "self" })).toEqual({ forMember: "self" });
  });
  it("rejects partner account takeover requests even if the caller is a room member", () => {
    expect(selfRecoveryRequestSchema.safeParse({ forMember: "partner" }).success).toBe(false);
  });
  it("rejects arbitrary member IDs supplied by clients", () => {
    expect(selfRecoveryRequestSchema.safeParse({ forMember: "self", memberId: "foreign-member" }).data)
      .toEqual({ forMember: "self" });
    expect(selfRecoveryRequestSchema.safeParse({ forMember: "other" }).success).toBe(false);
  });
});
