import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  addedFatNutrition,
  contextualQuestions,
  normalizeFoodAlias,
  parseDeterministicContext,
} from "./scan-v2";
import { scaleUsda, searchUsdaFood } from "./usda-food.server";
import type { ScannerV2Component, ScannerV2Estimate } from "./scan-v2.functions";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function confidenceLabel(score: number): "low"|"medium"|"high" {
  return score >= 0.78 ? "high" : score >= 0.55 ? "medium" : "low";
}

function totals(components: ScannerV2Component[]) {
  return components.reduce((sum, item) => ({
    calories: sum.calories + item.calories,
    protein: sum.protein + item.protein,
    carbs: sum.carbs + item.carbs,
    fat: sum.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

export const applyScanContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scanId: string; context: string }) => ({
    scanId: z.string().uuid().parse(input.scanId),
    context: z.string().trim().min(2).max(300).parse(input.context),
  }))
  .handler(async ({ data, context }): Promise<
    | { ok: true; applied: true; needsVision: false; estimate: ScannerV2Estimate }
    | { ok: true; applied: false; needsVision: true }
    | { ok: false; error: string }
  > => {
    const { data: device, error: deviceError } = await context.supabase
      .from("member_devices").select("member_id").eq("auth_user_id", context.userId).maybeSingle();
    if (deviceError || !device) return { ok: false, error: "NOT_MEMBER" };
    const memberId = device.member_id;
    const db = await admin();
    const { data: event, error: eventError } = await db.from("scan_events")
      .select("id").eq("id", data.scanId).eq("member_id", memberId).maybeSingle();
    if (eventError || !event) return { ok: false, error: "SCAN_NOT_FOUND" };
    const { data: rows, error: rowError } = await db.from("scan_items")
      .select("*").eq("scan_id", data.scanId).eq("member_id", memberId).order("item_index");
    if (rowError || !rows?.length) return { ok: false, error: "SCAN_NOT_FOUND" };

    const parsed = parseDeterministicContext(data.context);
    const hasDeterministic = Boolean(
      parsed.identityOverride || parsed.totalGrams || parsed.addedFat ||
      parsed.packCount || parsed.gramsPerPack,
    );
    if (!hasDeterministic) return { ok: true, applied: false, needsVision: true };

    const components: ScannerV2Component[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      serving_description: row.grams_estimate == null ? "" : String(row.grams_estimate) + " g estimate",
      grams_estimate: row.grams_estimate == null ? null : Number(row.grams_estimate),
      grams_min: row.grams_min == null ? null : Number(row.grams_min),
      grams_max: row.grams_max == null ? null : Number(row.grams_max),
      calories: Number(row.calories ?? 0),
      protein: Number(row.protein ?? 0),
      carbs: Number(row.carbs ?? 0),
      fat: Number(row.fat ?? 0),
      confidence: Number(row.confidence ?? 0.5),
      hidden_fat_risk: (row.hidden_fat_risk === "high" || row.hidden_fat_risk === "medium") ? row.hidden_fat_risk : "low",
      source_name: row.source_name === "USDA" ? "USDA" : row.source_name === "user-context" ? "user-context" : "model-fallback",
      source_ref: row.source_ref ?? null,
      packaged_food: null,
    }));

    const first = components[0]!;
    const before = { ...first };
    const targetGrams = parsed.totalGrams ?? (
      parsed.packCount && parsed.gramsPerPack ? parsed.packCount * parsed.gramsPerPack : undefined
    );

    if (parsed.identityOverride) {
      const label = normalizeFoodAlias(parsed.identityOverride);
      const match = await searchUsdaFood(label);
      const grams = targetGrams ?? first.grams_estimate;
      if (!match || !grams) {
        // Changing identity without enough deterministic nutrition evidence needs
        // visual/database re-analysis; never preserve the old food's macros silently.
        return { ok: true, applied: false, needsVision: true };
      }
      const nutrition = scaleUsda(match, grams);
      Object.assign(first, {
        label,
        grams_estimate: grams,
        grams_min: grams,
        grams_max: grams,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        confidence: Math.max(first.confidence, match.score * 0.9),
        source_name: "USDA" as const,
        source_ref: "fdc:" + match.fdcId,
      });
    } else if (targetGrams && first.grams_estimate && first.grams_estimate > 0) {
      const ratio = targetGrams / first.grams_estimate;
      Object.assign(first, {
        grams_estimate: targetGrams,
        grams_min: targetGrams,
        grams_max: targetGrams,
        calories: Math.round(first.calories * ratio),
        protein: Math.round(first.protein * ratio * 10) / 10,
        carbs: Math.round(first.carbs * ratio * 10) / 10,
        fat: Math.round(first.fat * ratio * 10) / 10,
        confidence: Math.max(first.confidence, 0.8),
      });
    } else if (targetGrams) {
      const match = await searchUsdaFood(first.label);
      if (!match) return { ok: true, applied: false, needsVision: true };
      const nutrition = scaleUsda(match, targetGrams);
      Object.assign(first, {
        grams_estimate: targetGrams,
        grams_min: targetGrams,
        grams_max: targetGrams,
        ...nutrition,
        confidence: Math.max(first.confidence, match.score * 0.9),
        source_name: "USDA" as const,
        source_ref: "fdc:" + match.fdcId,
      });
    }

    const fatNutrition = addedFatNutrition(parsed);
    if (fatNutrition && parsed.addedFat) {
      components.push({
        label: "Added " + parsed.addedFat.kind,
        serving_description: String(parsed.addedFat.grams) + " g supplied by user",
        grams_estimate: parsed.addedFat.grams,
        grams_min: parsed.addedFat.grams,
        grams_max: parsed.addedFat.grams,
        ...fatNutrition,
        confidence: 1,
        hidden_fat_risk: "low",
        source_name: "user-context",
        source_ref: null,
        packaged_food: null,
      });
    }

    const corrected = { ...first };
    const structuredContext = {
      ...(parsed.identityOverride ? { identityOverride: parsed.identityOverride } : {}),
      ...(targetGrams ? { totalGrams: targetGrams } : {}),
      ...(parsed.packCount ? { packCount: parsed.packCount } : {}),
      ...(parsed.gramsPerPack ? { gramsPerPack: parsed.gramsPerPack } : {}),
      ...(parsed.addedFat ? {
        addedFatKind: parsed.addedFat.kind,
        addedFatGrams: parsed.addedFat.grams,
      } : {}),
    };
    const { error: correctionError } = await db.from("scan_corrections").insert({
      scan_id: data.scanId,
      scan_item_id: first.id ?? null,
      member_id: memberId,
      correction_type: parsed.addedFat ? "hidden_fat" : parsed.identityOverride ? "identity" : "portion",
      original: before,
      corrected,
      structured_context: structuredContext,
    });
    if (correctionError) return { ok: false, error: "CORRECTION_SAVE_FAILED" };

    const sum = totals(components);
    const confidenceScore = Math.round(
      (components.reduce((value, item) => value + item.confidence, 0) / components.length) * 100,
    ) / 100;
    const questions = components.flatMap((item) => contextualQuestions({
      hiddenFatRisk: item.hidden_fat_risk,
      confidence: item.confidence,
      gramsEstimate: item.grams_estimate,
      gramsMin: item.grams_min,
      gramsMax: item.grams_max,
    })).filter((question, index, all) => all.indexOf(question) === index).slice(0, 2);

    return {
      ok: true,
      applied: true,
      needsVision: false,
      estimate: {
        scan_id: data.scanId,
        food_name: components.map((item) => item.label).join(" + ").slice(0, 200),
        serving_description: components.map((item) => item.serving_description).filter(Boolean).join(" · ").slice(0, 300),
        calories: Math.round(sum.calories),
        protein: Math.round(sum.protein * 10) / 10,
        carbs: Math.round(sum.carbs * 10) / 10,
        fat: Math.round(sum.fat * 10) / 10,
        confidence: confidenceLabel(confidenceScore),
        confidence_score: confidenceScore,
        components,
        questions,
        escalated: false,
        packaged_food: null,
      },
    };
  });
