import { describe, expect, it } from "vitest";
import { photoStoragePath } from "./private-photo";
const room = "a8615d2b-e36a-4d09-8dc0-2351b935d8dd";
describe("private photo path normalization", () => {
  it("accepts an existing Supabase public URL for the matching room", () => {
    expect(photoStoragePath("https://project.supabase.co/storage/v1/object/public/meal-photos/"+room+"/old.jpg",room))
      .toBe(room+"/old.jpg");
  });
  it("accepts modern relative paths", () => {
    expect(photoStoragePath(room+"/new.jpg",room)).toBe(room+"/new.jpg");
  });
  it("rejects cross-room files and traversal", () => {
    expect(photoStoragePath("a0000000-e36a-4d09-8dc0-2351b935d8dd/x.jpg",room)).toBeNull();
    expect(photoStoragePath(room+"/../x.jpg",room)).toBeNull();
    expect(photoStoragePath("https://example.com/x.jpg",room)).toBeNull();
  });
});
