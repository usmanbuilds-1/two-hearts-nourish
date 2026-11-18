export const DATA_EXPORT_SCHEMA_VERSION = 1;

export const DATA_EXPORT_EXCLUDED = [
  "authentication/session tokens",
  "recovery keys and token hashes",
  "room invite/rejoin secrets",
  "device authentication identifiers",
  "AI/security quota internals",
  "scanner telemetry/cache internals",
  "private storage object paths",
  "partner-private member records",
] as const;

export type SafeProfileExport = {
  display_name: string;
  created_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  sex: string | null;
  activity_level: string | null;
  body_goal: string | null;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  daily_food_budget: number | null;
  currency: string | null;
  locality: string | null;
  adaptive_targets_enabled: boolean;
  adaptive_target_configured_at: string | null;
  physical_activity_level: number | null;
  target_rate_pct_per_week: number | null;
};

export type SafeRoomExport = {
  shared_goal: string | null;
  couple_message: string | null;
  together_since: string | null;
  created_at: string;
};

export type SafeMealExport = {
  id: string;
  meal_date: string;
  meal_type: string;
  food_name: string;
  serving_description: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_planned: boolean;
  portion_percentage: number;
  nominal_calories: number | null;
  nominal_protein: number | null;
  nominal_carbs: number | null;
  nominal_fat: number | null;
  ai_confidence: string | null;
  has_private_photo: boolean;
  created_at: string;
  updated_at: string;
};

export type DataExportBundle = {
  manifest: {
    schema: "two-hearts-nourish-personal-export";
    schema_version: number;
    generated_at: string;
    scope: "authenticated-member-only";
    format: "json";
    excluded_for_security: readonly string[];
    counts: Record<string, number>;
  };
  profile: SafeProfileExport;
  shared_space: SafeRoomExport | null;
  meals: SafeMealExport[];
  meal_components: unknown[];
  weight_history: unknown[];
  recipes: unknown[];
  meal_plans: unknown[];
  meal_templates: unknown[];
  favourites: unknown[];
  progress_notes: unknown[];
  adaptive_target_history: unknown[];
  confirmed_complete_days: unknown[];
};

const FORBIDDEN_SERIALIZED_KEYS = [
  "participant_token_hash",
  "link_code_hash",
  "invite_token_hash",
  "token_hash",
  "auth_user_id",
  "room_code",
  "photo_url",
  "object_path",
  "service_role",
  "recovery_key",
] as const;

export function safeMealForExport(row: {
  id: string;
  meal_date: string;
  meal_type: string;
  food_name: string;
  serving_description: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_planned: boolean;
  photo_url: string | null;
  portion_percentage: number;
  nominal_calories: number | null;
  nominal_protein: number | null;
  nominal_carbs: number | null;
  nominal_fat: number | null;
  ai_confidence: string | null;
  created_at: string;
  updated_at: string;
}): SafeMealExport {
  return {
    id: row.id,
    meal_date: row.meal_date,
    meal_type: row.meal_type,
    food_name: row.food_name,
    serving_description: row.serving_description,
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    is_planned: Boolean(row.is_planned),
    portion_percentage: Number(row.portion_percentage),
    nominal_calories: row.nominal_calories == null ? null : Number(row.nominal_calories),
    nominal_protein: row.nominal_protein == null ? null : Number(row.nominal_protein),
    nominal_carbs: row.nominal_carbs == null ? null : Number(row.nominal_carbs),
    nominal_fat: row.nominal_fat == null ? null : Number(row.nominal_fat),
    ai_confidence: row.ai_confidence,
    has_private_photo: Boolean(row.photo_url),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function assertNoSecretFields(value: unknown): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const normalized = key.toLowerCase();
      if (FORBIDDEN_SERIALIZED_KEYS.includes(normalized as (typeof FORBIDDEN_SERIALIZED_KEYS)[number])) {
        throw new Error("EXPORT_SECRET_FIELD");
      }
      visit(child);
    }
  };

  visit(value);
}

export function assertExportSize(json: string, maxBytes: number): void {
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > maxBytes) throw new Error("EXPORT_TOO_LARGE");
}

export function serializeDataExport(bundle: DataExportBundle): string {
  assertNoSecretFields(bundle);
  return JSON.stringify(bundle, null, 2);
}
