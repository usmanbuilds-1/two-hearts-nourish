export type PackagedFood = {
  code: string;
  name: string;
  brand: string;
  packageQuantity?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingDescription: string;
  source: "Open Food Facts";
};

/** Sanitize community-contributed nutrition data. All values are per 100 g/ml. */
export function normalizeOffProduct(value: unknown): PackagedFood | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string,unknown>;
  const nutrition = p["nutriments"];
  if (!nutrition || typeof nutrition !== "object") return null;
  const n = nutrition as Record<string,unknown>;
  const num = (key: string, max: number) => {
    const raw = n[key];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > max) return null;
    return raw;
  };
  const kcal = num("energy-kcal_100g", 1000);
  const kj = num("energy-kj_100g", 5000);
  const energy = kcal ?? (kj === null ? null : kj / 4.184);
  const protein = num("proteins_100g", 100);
  const carbs = num("carbohydrates_100g", 100);
  const fat = num("fat_100g", 100);
  const name = typeof p["product_name"] === "string" ? p["product_name"].trim() : "";
  const code = String(p["code"] ?? "").trim();
  if (!name || !/^\d{8,14}$/.test(code) || energy === null ||
      protein === null || carbs === null || fat === null) return null;
  const brand = typeof p["brands"] === "string" ? p["brands"].trim().slice(0,80) : "";
  return {
    code,name:name.slice(0,120),brand,
    packageQuantity: typeof p["quantity"] === "string" ? p["quantity"].trim().slice(0,40) : "",
    calories:Math.round(energy),
    protein:Math.round(protein*10)/10,
    carbs:Math.round(carbs*10)/10,
    fat:Math.round(fat*10)/10,
    servingDescription:"Per 100 g or 100 ml · verify package label",
    source:"Open Food Facts"
  };
}
