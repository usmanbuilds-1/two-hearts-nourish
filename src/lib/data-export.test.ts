import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_EXCLUDED,
  DATA_EXPORT_SCHEMA_VERSION,
  assertExportSize,
  assertNoSecretFields,
  safeMealForExport,
  serializeDataExport,
  type DataExportBundle,
} from "./data-export";

const meal = {
  id: "meal-1",
  meal_date: "2026-11-18",
  meal_type: "breakfast",
  food_name: "Oats",
  serving_description: "1 bowl",
  calories: 420,
  protein: 22,
  carbs: 58,
  fat: 11,
  is_planned: false,
  photo_url: "private-room-id/sensitive-object.jpg",
  portion_percentage: 100,
  nominal_calories: 420,
  nominal_protein: 22,
  nominal_carbs: 58,
  nominal_fat: 11,
  ai_confidence: "high",
  created_at: "2026-11-18T00:00:00Z",
  updated_at: "2026-11-18T00:00:00Z",
};

function bundle(): DataExportBundle {
  return {
    manifest: {
      schema: "two-hearts-nourish-personal-export",
      schema_version: DATA_EXPORT_SCHEMA_VERSION,
      generated_at: "2026-11-18T00:00:00.000Z",
      scope: "authenticated-member-only",
      format: "json",
      excluded_for_security: DATA_EXPORT_EXCLUDED,
      counts: {
        meals: 1,
        meal_components: 0,
        weight_history: 1,
        recipes: 0,
        meal_plans: 0,
        meal_templates: 0,
        favourites: 0,
        progress_notes: 0,
        adaptive_target_history: 0,
        confirmed_complete_days: 0,
      },
    },
    profile: {
      display_name: "User",
      created_at: "2026-01-01T00:00:00Z",
      height_cm: 180,
      weight_kg: 70,
      age: 30,
      sex: "male",
      activity_level: "moderate",
      body_goal: "maintain",
      daily_calorie_target: 2500,
      daily_protein_target: 130,
      daily_carbs_target: 300,
      daily_fat_target: 80,
      daily_food_budget: null,
      currency: "PKR",
      locality: "Karachi",
      adaptive_targets_enabled: true,
      adaptive_target_configured_at: "2026-11-01T00:00:00Z",
      physical_activity_level: 1.6,
      target_rate_pct_per_week: 0,
    },
    shared_space: {
      shared_goal: "Eat well",
      couple_message: null,
      together_since: "2026-01-01",
      created_at: "2026-01-01T00:00:00Z",
    },
    meals: [safeMealForExport(meal)],
    meal_components: [],
    weight_history: [{ logged_date: "2026-11-18", weight_kg: 70 }],
    recipes: [],
    meal_plans: [],
    meal_templates: [],
    favourites: [],
    progress_notes: [],
    adaptive_target_history: [],
    confirmed_complete_days: [],
  };
}

describe("secure full data export", () => {
  it("replaces a private photo path with a boolean only", () => {
    const safe = safeMealForExport(meal);
    expect(safe.has_private_photo).toBe(true);
    expect(safe).not.toHaveProperty("photo_url");
    expect(JSON.stringify(safe)).not.toContain("sensitive-object.jpg");
  });

  it("rejects secret-bearing fields even if a future change accidentally inserts one", () => {
    expect(() => assertNoSecretFields({
      ...bundle(),
      accidental: { participant_token_hash: "secret" },
    })).toThrow("EXPORT_SECRET_FIELD");
  });

  it("does not reject user-written text that happens to contain a forbidden field name", () => {
    const value = bundle();
    value.progress_notes = [{ text: "I wrote room_code in my own note." }];
    expect(() => assertNoSecretFields(value)).not.toThrow();
  });

  it("serializes a stable versioned personal export structure", () => {
    const parsed = JSON.parse(serializeDataExport(bundle()));
    expect(parsed.manifest.schema).toBe("two-hearts-nourish-personal-export");
    expect(parsed.manifest.schema_version).toBe(1);
    expect(parsed.manifest.scope).toBe("authenticated-member-only");
    expect(parsed.meals).toHaveLength(1);
    expect(parsed.weight_history).toHaveLength(1);
    expect(parsed).not.toHaveProperty("partner");
  });

  it("fails closed instead of silently truncating an oversized export", () => {
    expect(() => assertExportSize("x".repeat(101), 100)).toThrow("EXPORT_TOO_LARGE");
  });
});
