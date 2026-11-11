import { describe, expect, it } from "vitest";
import { buildRejoinUrl, readRejoinToken } from "./rejoin-links";

describe("scoped recovery link", () => {
  const token = "A".repeat(64);
  it("does not send a secret in the HTTP path or query", () => {
    const url = new URL(buildRejoinUrl("https://us.example/", "7KQ4-M2PX", token));
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/r/7KQ4-M2PX");
    expect(url.hash).toBe("#rejoin=" + token.toLowerCase());
  });
  it("recognizes 256-bit recovery links", () => {
    expect(readRejoinToken("", "#rejoin=" + token)).toBe(token.toLowerCase());
  });
  it("keeps old 6-digit rejoin links functional", () => {
    expect(readRejoinToken("?lc=123456", "")).toBe("123456");
  });
  it("rejects malformed fragment without using query fallback", () => {
    expect(readRejoinToken("?lc=123456", "#rejoin=bad")).toBeNull();
    expect(readRejoinToken("?lc=1", "")).toBeNull();
    expect(() => buildRejoinUrl("https://us.example", "7KQ4-M2PX", "123456")).toThrow();
  });
});
