import { describe, expect, it } from "vitest";
import { decodeMealJpeg } from "./meal-photo-payload";

const sample = "data:image/jpeg;base64," +
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x20, 0xff, 0xd9]).toString("base64");

describe("authenticated meal photo payload", () => {
  it("accepts only bounded JPEG data and returns exact bytes", () => {
    expect(Array.from(decodeMealJpeg(sample) ?? [])).toEqual([0xff,0xd8,0xff,0xe0,0x10,0x20,0xff,0xd9]);
  });
  it("rejects misleading content types and non-JPEG bytes", () => {
    expect(decodeMealJpeg(sample.replace("image/jpeg", "image/png"))).toBeNull();
    expect(decodeMealJpeg("data:image/jpeg;base64,QUJDRA==")).toBeNull();
  });
  it("rejects empty, malformed and oversized payloads", () => {
    expect(decodeMealJpeg("data:image/jpeg;base64,")).toBeNull();
    expect(decodeMealJpeg("data:image/jpeg;base64,@@@=")).toBeNull();
    expect(decodeMealJpeg("data:image/jpeg;base64," + "A".repeat(3_000_000))).toBeNull();
  });
});
