import type { PackagedFood } from "./off-food";

export type DetectedPackage = {
  brand: string;
  product: string;
  pack_count: number | null;
  grams_per_pack: number | null;
};

/** Never infer an invisible portion size or accept a nonsensical quantity. */
export function detectedTotalGrams(value: DetectedPackage | null): number | null {
  if (!value) return null;
  const count = value.pack_count;
  const grams = value.grams_per_pack;
  if (count === null || !Number.isInteger(count) || count < 1 || count > 20 ||
      grams === null || !Number.isFinite(grams) || grams <= 0 || grams > 2000) return null;
  const total = count * grams;
  return total > 0 && total <= 2000 ? Math.round(total * 10) / 10 : null;
}

export function scalePackagedLabel(food: PackagedFood, grams: number) {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 2000) {
    throw new RangeError("Enter a valid amount between 0 and 2000 g.");
  }
  const factor = grams / 100;
  const oneDecimal = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    calories: Math.round(food.calories * factor),
    protein: oneDecimal(food.protein),
    carbs: oneDecimal(food.carbs),
    fat: oneDecimal(food.fat),
  };
}

function normalizedTokens(value: string): string {
  return value.toLowerCase()
    .replace(/\bflavour\b/g, "flavor")
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|grams|kg|ml)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 0 && token !== "the" && token !== "of")
    .sort().join(" ");
}

export function packageSearchQuery(value: DetectedPackage): string {
  // Broader search tolerates regional spelling differences such as flavor/flavour.
  const product = value.product.trim().replace(/\bflavo(?:u)?r\b/gi, " ").replace(/\s+/g, " ").trim();
  return [value.brand.trim(), product].filter(Boolean).join(" ").slice(0, 80);
}

/** No silent substitution of a different flavour, brand, or packet size. */
export function strictPackageMatch(value: DetectedPackage, candidates: PackagedFood[]): PackagedFood | null {
  if (!value.brand.trim() || !value.product.trim() || detectedTotalGrams(value) === null) return null;
  const wantedBrand = normalizedTokens(value.brand);
  const p = value.product.trim();
  const productWithoutBrand = p.toLowerCase().startsWith(value.brand.trim().toLowerCase() + " ")
    ? p.slice(value.brand.trim().length + 1)
    : p;
  const wantedProduct = normalizedTokens(productWithoutBrand);
  if (!wantedBrand || !wantedProduct) return null;
  const matches = candidates.filter(food => {
    const brandMatches = food.brand.split(",").some(brand => normalizedTokens(brand) === wantedBrand);
    if (!brandMatches || normalizedTokens(food.name) !== wantedProduct) return false;
    if (food.packageQuantity && value.grams_per_pack !== null) {
      const size = food.packageQuantity.trim().match(/^(\d+(?:\.\d+)?)\s*g(?:rams?)?$/i);
      if (size && Math.abs(Number(size[1]) - value.grams_per_pack) > 0.2) return false;
    }
    return true;
  });
  return matches.length === 1 ? matches[0]! : null;
}
