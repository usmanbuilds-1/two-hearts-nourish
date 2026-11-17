import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Meal } from "./nutrition";

const componentSchema = z.object({
  label: z.string().trim().min(1).max(160),
  grams: z.number().finite().min(0).max(10000).nullable().optional(),
  calories: z.number().finite().min(0).max(20000),
  protein: z.number().finite().min(0).max(2000),
  carbs: z.number().finite().min(0).max(2000),
  fat: z.number().finite().min(0).max(2000),
  source_name: z.string().trim().max(80).nullable().optional(),
  source_ref: z.string().trim().max(200).nullable().optional(),
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
});

const saveSchema = z.object({
  scanId: z.string().uuid(),
  mealDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["breakfast","lunch","snack","dinner"]),
  foodName: z.string().trim().min(1).max(200),
  servingDescription: z.string().trim().max(300).optional().default(""),
  calories: z.number().int().min(0).max(20000),
  protein: z.number().finite().min(0).max(2000),
  carbs: z.number().finite().min(0).max(2000),
  fat: z.number().finite().min(0).max(2000),
  confidence: z.enum(["low","medium","high"]).nullable(),
  photoUrl: z.string().trim().max(1000).nullable().optional(),
  components: z.array(componentSchema).min(1).max(20),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function currentMember(context: { userId: string; supabase: SupabaseClient<Database> }) {
  const { data: device, error } = await context.supabase
    .from("member_devices").select("member_id").eq("auth_user_id", context.userId).maybeSingle();
  if (error || !device) return null;
  const { data: member, error: memberError } = await context.supabase
    .from("members").select("id,room_id").eq("id", device.member_id).maybeSingle();
  if (memberError || !member) return null;
  return member as { id: string; room_id: string };
}

function relativePhotoPath(stored: string | null | undefined, roomId: string): string | null {
  if (!stored) return null;
  let path = stored;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      const marker = "/storage/v1/object/public/meal-photos/";
      const at = url.pathname.indexOf(marker);
      if (at < 0) return null;
      path = decodeURIComponent(url.pathname.slice(at + marker.length));
    } catch {
      return null;
    }
  }
  if (!path.startsWith(roomId + "/")) return null;
  const file = path.slice(roomId.length + 1);
  return /^[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(file) ? path : null;
}

export const saveScannedMealV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveSchema>) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; meal: Meal } | { ok: false; error: string }> => {
    const member = await currentMember(context);
    if (!member) return { ok: false, error: "NOT_MEMBER" };
    const photoPath = data.photoUrl ? relativePhotoPath(data.photoUrl, member.room_id) : null;
    if (data.photoUrl && !photoPath) return { ok: false, error: "INVALID_PHOTO_PATH" };

    const db = await admin();
    const components = data.components.map((component) => ({
      label: component.label,
      grams: component.grams ?? null,
      calories: component.calories,
      protein: component.protein,
      carbs: component.carbs,
      fat: component.fat,
      source_name: component.source_name ?? null,
      source_ref: component.source_ref ?? null,
      confidence: component.confidence ?? null,
    }));
    const { data: mealId, error } = await db.rpc("save_scanned_meal_v2", {
      p_member_id: member.id,
      p_room_id: member.room_id,
      p_meal_date: data.mealDate,
      p_meal_type: data.mealType,
      p_food_name: data.foodName,
      p_serving_description: data.servingDescription,
      p_calories: data.calories,
      p_protein: data.protein,
      p_carbs: data.carbs,
      p_fat: data.fat,
      p_ai_confidence: data.confidence,
      p_photo_url: photoPath,
      p_components: components,
      p_scan_id: data.scanId,
    });
    if (error || !mealId) return { ok: false, error: "SAVE_FAILED" };
    const { data: meal, error: mealError } = await db.from("meals")
      .select("*").eq("id", mealId).eq("member_id", member.id).single();
    if (mealError || !meal) return { ok: false, error: "SAVE_FAILED" };

    // Cache only the final, user-confirmed result. Raw model output is never cached.
    const { data: scanEvent } = await db.from("scan_events")
      .select("image_fingerprint,context_fingerprint,scanner_version")
      .eq("id", data.scanId).eq("member_id", member.id).maybeSingle();
    if (scanEvent?.image_fingerprint && /^[a-f0-9]{16}$/.test(scanEvent.image_fingerprint)) {
      const confidenceScore = components.length
        ? Math.round((components.reduce((sum, item) => sum + Number(item.confidence ?? 0.5), 0) / components.length) * 100) / 100
        : 0.5;
      const finalEstimate = {
        food_name: data.foodName,
        serving_description: data.servingDescription,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        confidence: data.confidence ?? "medium",
        confidence_score: confidenceScore,
        components: components.map((item) => ({
          label: item.label,
          serving_description: item.grams ? String(item.grams) + " g" : "",
          grams_estimate: item.grams,
          grams_min: item.grams,
          grams_max: item.grams,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          confidence: item.confidence ?? 0.5,
          hidden_fat_risk: "low",
          source_name: item.source_name ?? "manual",
          source_ref: item.source_ref ?? null,
          packaged_food: null,
        })),
        questions: [],
        escalated: false,
        cache_hit: true,
        packaged_food: null,
      };
      await db.from("member_scan_cache").upsert({
        member_id: member.id,
        image_fingerprint: scanEvent.image_fingerprint,
        context_fingerprint: scanEvent.context_fingerprint ?? "",
        scanner_version: scanEvent.scanner_version,
        final_estimate: finalEstimate,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "member_id,image_fingerprint,context_fingerprint,scanner_version" });
    }

    return { ok: true, meal: meal as Meal };
  });

export const attachMyMealPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mealId: string; photoPath: string }) => ({
    mealId: z.string().uuid().parse(input.mealId),
    photoPath: z.string().trim().max(1000).parse(input.photoPath),
  }))
  .handler(async ({ data, context }) => {
    const member = await currentMember(context);
    if (!member) return { ok: false, error: "NOT_MEMBER" };
    const path = relativePhotoPath(data.photoPath, member.room_id);
    if (!path) return { ok: false, error: "INVALID_PHOTO_PATH" };
    const db = await admin();
    const { data: meal, error: mealError } = await db.from("meals")
      .select("id").eq("id", data.mealId).eq("member_id", member.id).maybeSingle();
    if (mealError || !meal) {
      await db.storage.from("meal-photos").remove([path]);
      return { ok: false, error: "MEAL_NOT_FOUND" };
    }
    const { error: updateError } = await db.from("meals")
      .update({ photo_url: path }).eq("id", data.mealId).eq("member_id", member.id);
    if (updateError) {
      await db.storage.from("meal-photos").remove([path]);
      return { ok: false, error: "PHOTO_ATTACH_FAILED" };
    }
    return { ok: true, photoPath: path };
  });

async function cleanQueuedPhoto(
  db: Awaited<ReturnType<typeof admin>>,
  row: { id: string; object_path: string; room_id: string; attempts: number },
): Promise<boolean> {
  const path = relativePhotoPath(row.object_path, row.room_id);
  if (!path) {
    await db.from("storage_cleanup_queue").update({
      attempts: row.attempts + 1,
      last_error: "INVALID_STORED_PATH",
    }).eq("id", row.id);
    return false;
  }
  const { error } = await db.storage.from("meal-photos").remove([path]);
  if (error) {
    await db.from("storage_cleanup_queue").update({
      attempts: row.attempts + 1,
      last_error: "STORAGE_REMOVE_FAILED",
    }).eq("id", row.id);
    return false;
  }
  await db.from("storage_cleanup_queue").update({
    attempts: row.attempts + 1,
    last_error: null,
    cleaned_at: new Date().toISOString(),
  }).eq("id", row.id);
  return true;
}

export const cleanupMyPendingMealPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await currentMember(context);
    if (!member) return { ok: false, cleaned: 0 };
    const db = await admin();
    const { data: rows, error } = await db.from("storage_cleanup_queue")
      .select("id,object_path,room_id,attempts")
      .eq("member_id", member.id)
      .is("cleaned_at", null)
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) return { ok: false, cleaned: 0 };
    let cleaned = 0;
    for (const row of rows ?? []) if (await cleanQueuedPhoto(db, row)) cleaned++;
    return { ok: true, cleaned };
  });

export const deleteMyMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mealId: string }) => ({
    mealId: z.string().uuid().parse(input.mealId),
  }))
  .handler(async ({ data, context }) => {
    const member = await currentMember(context);
    if (!member) return { ok: false, error: "NOT_MEMBER" };
    const db = await admin();
    const { data: meal, error: readError } = await db.from("meals")
      .select("id,member_id").eq("id", data.mealId).eq("member_id", member.id).maybeSingle();
    if (readError) return { ok: false, error: "SERVER_ERROR" };
    if (!meal) return { ok: false, error: "MEAL_NOT_FOUND" };

    const { error: deleteError } = await db.from("meals")
      .delete().eq("id", data.mealId).eq("member_id", member.id);
    if (deleteError) return { ok: false, error: "DELETE_FAILED" };

    const { data: queued } = await db.from("storage_cleanup_queue")
      .select("id,object_path,room_id,attempts")
      .eq("member_id", member.id)
      .is("cleaned_at", null)
      .order("created_at", { ascending: true })
      .limit(10);
    let pending = 0;
    for (const row of queued ?? []) if (!(await cleanQueuedPhoto(db, row))) pending++;
    return { ok: true, photoCleanupPending: pending > 0 };
  });
