import { describe, expect, it } from "vitest";
import {
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from "./public-config";

describe("public Supabase configuration", () => {
  it("ships a valid HTTPS project URL fallback", () => {
    expect(PUBLIC_SUPABASE_URL).toBe("https://dvudxkpfiiiviongkhcc.supabase.co");
    expect(new URL(PUBLIC_SUPABASE_URL).protocol).toBe("https:");
  });

  it("ships only the public Supabase browser key", () => {
    expect(PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")).toBe(true);
    expect(PUBLIC_SUPABASE_PUBLISHABLE_KEY).not.toContain("service_role");
    expect(PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")).toBe(false);
  });
});
