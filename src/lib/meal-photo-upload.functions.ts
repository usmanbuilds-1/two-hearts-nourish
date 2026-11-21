import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { decodeMealJpeg } from "./meal-photo-payload";

type PhotoResult =
  | { ok: true; photoPath: string }
  | { ok: false; error: "NOT_MEMBER" | "MEAL_NOT_FOUND" | "INVALID_IMAGE" | "UPLOAD_FAILED" | "ATTACH_FAILED" };

/**
 * Authenticated server fallback for platforms where browser-to-Storage upload
 * fails. It is NOT an arbitrary-object upload API: callers can only attach a
 * single, verified JPEG to an existing meal belonging to their own member ID.
 * The server generates the path; no caller-provided room, path or owner is used.
 * Photos stay in the existing private bucket. No migration or new RLS policy.
 */
export const uploadAndAttachMyMealPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mealId: string; image: string }) => ({
    mealId: z.string().uuid().parse(input.mealId),
    image: z.string().min(32).max(3_000_000).parse(input.image),
  }))
  .handler(async ({ data, context }): Promise<PhotoResult> => {
    const image = decodeMealJpeg(data.image);
    if (!image) return { ok: false, error: "INVALID_IMAGE" };

    // Load the service credential only in the server handler, after auth.
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: device, error: deviceError } = await db.from("member_devices")
      .select("member_id").eq("auth_user_id", context.userId).maybeSingle();
    if (deviceError || !device) return { ok: false, error: "NOT_MEMBER" };

    const { data: member, error: memberError } = await db.from("members")
      .select("room_id").eq("id", device.member_id).maybeSingle();
    if (memberError || !member) return { ok: false, error: "NOT_MEMBER" };

    const { data: meal, error: readError } = await db.from("meals")
      .select("id,room_id,photo_url")
      .eq("id", data.mealId)
      .eq("member_id", device.member_id)
      .eq("room_id", member.room_id)
      .maybeSingle();
    if (readError || !meal) return { ok: false, error: "MEAL_NOT_FOUND" };

    // Idempotent retry: a successful previous request must never create an
    // extra file, or attach another photo to the same meal.
    if (meal.photo_url) return { ok: true, photoPath: meal.photo_url };

    const path = `${member.room_id}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await db.storage.from("meal-photos").upload(path, image, {
      contentType: "image/jpeg",
      cacheControl: "60",
      upsert: false,
    });
    if (uploadError) {
      // Error category only: never log an image, user data, object name or token.
      console.error("meal_photo_server_upload_failed", uploadError.statusCode ?? "provider");
      return { ok: false, error: "UPLOAD_FAILED" };
    }

    const { data: updated, error: attachError } = await db.from("meals")
      .update({ photo_url: path })
      .eq("id", meal.id)
      .eq("member_id", device.member_id)
      .eq("room_id", member.room_id)
      .is("photo_url", null)
      .select("photo_url")
      .maybeSingle();

    if (!attachError && updated?.photo_url === path)
      return { ok: true, photoPath: path };

    // Another concurrent attempt can win the attach race. Only return the
    // existing path after checking this member's own meal again.
    const { data: after } = await db.from("meals")
      .select("photo_url")
      .eq("id", meal.id)
      .eq("member_id", device.member_id)
      .eq("room_id", member.room_id)
      .maybeSingle();
    const { error: cleanupError } = await db.storage.from("meal-photos").remove([path]);
    if (cleanupError) console.error("meal_photo_server_cleanup_failed");
    if (after?.photo_url) return { ok: true, photoPath: after.photo_url };
    return { ok: false, error: "ATTACH_FAILED" };
  });
