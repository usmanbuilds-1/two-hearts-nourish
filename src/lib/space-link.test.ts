import { describe, expect, it } from "vitest";
import { parseSpaceLink, spaceLinkToPath } from "./space-link";

const origin = "https://two-hearts.example";
const secret = "a".repeat(64);
const invite = "b".repeat(64);

describe("private entry link parsing", () => {
  it("accepts a room identifier with or without dash but gives it no capability", () => {
    expect(parseSpaceLink("ABCD-2345", origin)).toEqual({ code: "ABCD-2345", token: null, kind: null });
    expect(parseSpaceLink("abcd2345", origin)).toEqual({ code: "ABCD-2345", token: null, kind: null });
  });

  it("accepts only same-origin private rejoin links", () => {
    const parsed = parseSpaceLink(origin + "/r/ABCD-2345#rejoin=" + secret, origin);
    expect(parsed).toEqual({ code: "ABCD-2345", token: secret, kind: "rejoin" });
    expect(spaceLinkToPath(parsed!)).toBe("/r/ABCD-2345#rejoin=" + secret);
  });

  it("accepts a same-origin private partner invitation capability", () => {
    const parsed = parseSpaceLink(origin + "/r/ABCD-2345#invite=" + invite, origin);
    expect(parsed).toEqual({ code: "ABCD-2345", token: invite, kind: "invite" });
    expect(spaceLinkToPath(parsed!)).toBe("/r/ABCD-2345#invite=" + invite);
  });

  it("rejects external, ambiguous and malformed sign-in links", () => {
    expect(parseSpaceLink("https://evil.example/r/ABCD-2345#rejoin=" + secret, origin)).toBeNull();
    expect(parseSpaceLink(origin + "/r/ABCD-2345?rejoin=" + secret, origin)).toBeNull();
    expect(parseSpaceLink(origin + "/r/ABCD-2345#rejoin=123456", origin)).toBeNull();
    expect(parseSpaceLink(origin + "/r/ABCD-2345#invite=" + invite + "&rejoin=" + secret, origin)).toBeNull();
    expect(parseSpaceLink("javascript:alert(1)", origin)).toBeNull();
    expect(parseSpaceLink(origin + "/fake/r/ABCD-2345", origin)).toBeNull();
  });
});
