export type HiddenFatRisk = "low" | "medium" | "high";

export type FoodProfile = {
  canonicalLabel: string;
  aliases: string[];
  cuisine: "south_asian";
  typicalPortionG: readonly [number, number];
  hiddenFatRisk: HiddenFatRisk;
  preparations: readonly string[];
};

/**
 * Conservative South Asian profile layer.
 * Typical portions are context metadata only; they never replace a visual/user weight.
 * Hidden-fat risk may raise uncertainty, never lower it.
 */
export const SOUTH_ASIAN_FOOD_PROFILES: readonly FoodProfile[] = [
  { canonicalLabel:"Biryani", aliases:["biryani","chicken biryani","beef biryani"], cuisine:"south_asian", typicalPortionG:[250,500], hiddenFatRisk:"high", preparations:["dum","pot rice","restaurant"] },
  { canonicalLabel:"Nihari", aliases:["nihari","beef nihari"], cuisine:"south_asian", typicalPortionG:[250,450], hiddenFatRisk:"high", preparations:["stew","gravy"] },
  { canonicalLabel:"Chicken karahi", aliases:["chicken karahi","karahi chicken","kadai chicken"], cuisine:"south_asian", typicalPortionG:[200,400], hiddenFatRisk:"high", preparations:["karahi","gravy"] },
  { canonicalLabel:"Pulao", aliases:["pulao","pilaf","chicken pulao"], cuisine:"south_asian", typicalPortionG:[250,450], hiddenFatRisk:"medium", preparations:["rice"] },
  { canonicalLabel:"Daal", aliases:["dal","daal","dhal"], cuisine:"south_asian", typicalPortionG:[180,320], hiddenFatRisk:"medium", preparations:["tarka","plain"] },
  { canonicalLabel:"Roti", aliases:["roti","chapati","phulka"], cuisine:"south_asian", typicalPortionG:[35,70], hiddenFatRisk:"low", preparations:["tawa"] },
  { canonicalLabel:"Paratha", aliases:["paratha","parantha"], cuisine:"south_asian", typicalPortionG:[70,140], hiddenFatRisk:"high", preparations:["tawa","fried"] },
  { canonicalLabel:"Haleem", aliases:["haleem"], cuisine:"south_asian", typicalPortionG:[250,450], hiddenFatRisk:"medium", preparations:["stew"] },
  { canonicalLabel:"Korma", aliases:["korma","qorma","chicken korma","beef korma"], cuisine:"south_asian", typicalPortionG:[200,400], hiddenFatRisk:"high", preparations:["gravy"] },
  { canonicalLabel:"Samosa", aliases:["samosa","aloo samosa","chicken samosa"], cuisine:"south_asian", typicalPortionG:[60,130], hiddenFatRisk:"high", preparations:["deep fried"] },
  { canonicalLabel:"Milk tea", aliases:["chai","doodh patti","milk tea"], cuisine:"south_asian", typicalPortionG:[180,350], hiddenFatRisk:"medium", preparations:["milk tea"] },
  { canonicalLabel:"Yogurt", aliases:["dahi","yoghurt","yogurt"], cuisine:"south_asian", typicalPortionG:[100,250], hiddenFatRisk:"low", preparations:["plain"] },
] as const;

export function foodProfile(value: string): FoodProfile | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return SOUTH_ASIAN_FOOD_PROFILES.find((profile) =>
    profile.canonicalLabel.toLowerCase() === normalized ||
    profile.aliases.some((alias) => alias === normalized)
  ) ?? null;
}

const RISK_ORDER: Record<HiddenFatRisk, number> = { low:0, medium:1, high:2 };

export function conservativeHiddenFatRisk(
  visualRisk: HiddenFatRisk,
  label: string,
): HiddenFatRisk {
  const profileRisk = foodProfile(label)?.hiddenFatRisk ?? "low";
  return RISK_ORDER[profileRisk] > RISK_ORDER[visualRisk] ? profileRisk : visualRisk;
}


export type DeterministicContext = {
  identityOverride?: string;
  totalGrams?: number;
  packCount?: number;
  gramsPerPack?: number;
  addedFat?: { kind: "oil" | "ghee" | "butter"; grams: number };
};

const MAX_CONTEXT = 300;

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function foodFingerprint(value: string): string {
  return normalizeFoodAlias(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
}

export function normalizeFoodAlias(value: string): string {
  const s = cleanLabel(value).toLowerCase();
  const aliases: Record<string, string> = {
    dal: "Daal",
    daal: "Daal",
    dhal: "Daal",
    roti: "Roti",
    chapati: "Roti",
    phulka: "Roti",
    dahi: "Yogurt",
    yoghurt: "Yogurt",
    yogurt: "Yogurt",
    "doodh patti": "Milk tea",
    chai: "Milk tea",
    "kadai chicken": "Chicken karahi",
    "karahi chicken": "Chicken karahi",
    nihari: "Nihari",
    biryani: "Biryani",
    pulao: "Pulao",
    pilaf: "Pulao",
  };
  return aliases[s] ?? cleanLabel(value);
}

function finitePositive(value: number, max: number): number | undefined {
  return Number.isFinite(value) && value > 0 && value <= max ? value : undefined;
}

export function parseDeterministicContext(raw: string): DeterministicContext {
  const text = raw.trim().slice(0, MAX_CONTEXT);
  const lower = text.toLowerCase();
  const out: DeterministicContext = {};

  const pack = lower.match(/\b(\d{1,2})\s*(?:x|packets?|packs?)\b/);
  if (pack?.[1]) {
    const value = finitePositive(Number(pack[1]), 20);
    if (value !== undefined) out.packCount = value;
  }

  const gramsEach = lower.match(/\b(\d{1,4}(?:\.\d+)?)\s*g(?:rams?)?\s*(?:each|per\s*(?:packet|pack))\b/);
  if (gramsEach?.[1]) {
    const value = finitePositive(Number(gramsEach[1]), 2000);
    if (value !== undefined) out.gramsPerPack = value;
  }

  const explicitTotal = lower.match(/\b(?:total|about|around|approx(?:imately)?|roughly)?\s*(\d{1,4}(?:\.\d+)?)\s*g(?:rams?)?\b/);
  if (explicitTotal?.[1] && !gramsEach) {
    const value = finitePositive(Number(explicitTotal[1]), 10000);
    if (value !== undefined) out.totalGrams = value;
  }

  if (out.packCount && out.gramsPerPack) {
    const value = finitePositive(out.packCount * out.gramsPerPack, 10000);
    if (value !== undefined) out.totalGrams = value;
  }

  const fat = lower.match(/\b(\d+(?:\.\d+)?)\s*(tbsp|tablespoons?|tsp|teaspoons?)\s*(?:of\s*)?(oil|ghee|butter)\b/);
  if (fat?.[1] && fat[2] && fat[3]) {
    const amount = Number(fat[1]);
    const unit = fat[2].startsWith("t") && !fat[2].startsWith("tb") ? "tsp" : "tbsp";
    const kind = fat[3] as "oil" | "ghee" | "butter";
    const gramsPerUnit = unit === "tbsp" ? (kind === "oil" ? 13.6 : 14) : (kind === "oil" ? 4.5 : 4.7);
    const grams = finitePositive(amount * gramsPerUnit, 500);
    if (grams) out.addedFat = { kind, grams: Math.round(grams * 10) / 10 };
  }

  const identityPatterns = [
    /\b(?:this|it)(?:\s+is|'s)\s+([^,.]{2,60})/i,
    /\b(?:actually|food is|dish is)\s+([^,.]{2,60})/i,
  ];
  for (const pattern of identityPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const candidate = cleanLabel(match[1].replace(/\b(?:not|instead of)\b.*$/i, ""));
      if (candidate) out.identityOverride = normalizeFoodAlias(candidate);
      break;
    }
  }

  return out;
}

export function addedFatNutrition(context: DeterministicContext): {
  calories: number; protein: number; carbs: number; fat: number;
} | null {
  const grams = context.addedFat?.grams;
  if (!grams) return null;
  return {
    calories: Math.round(grams * 9),
    protein: 0,
    carbs: 0,
    fat: Math.round(grams * 10) / 10,
  };
}

export function labelEnergyWarning(input: {
  calories: number; protein: number; carbs: number; fat: number;
}): string | null {
  const { calories, protein, carbs, fat } = input;
  if (![calories, protein, carbs, fat].every(Number.isFinite)) return "Label contains invalid numbers.";
  if ([calories, protein, carbs, fat].some((n) => n < 0)) return "Label contains negative nutrition values.";
  const generic = 4 * protein + 4 * carbs + 9 * fat;
  const delta = Math.abs(calories - generic);
  // 4/4/9 is only a warning heuristic: fiber, polyols, alcohol, specific Atwater
  // factors and label rounding can legitimately create larger differences.
  if (calories > 0 && delta > Math.max(40, calories * 0.2)) {
    return "Energy and macros differ more than expected. Check the printed label before saving.";
  }
  return null;
}

export function evidenceConfidence(input: {
  recognition: number;
  portion: number;
  databaseScore?: number | null;
  gramsEstimate?: number | null;
  gramsMin?: number | null;
  gramsMax?: number | null;
  hiddenFatRisk: HiddenFatRisk;
  imageQuality: "poor" | "fair" | "good";
  componentCount: number;
}): number {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  let score = clamp(input.recognition) * 0.42 + clamp(input.portion) * 0.28;
  if (typeof input.databaseScore === "number") score += clamp(input.databaseScore) * 0.22;
  else score += 0.08;

  if (
    input.gramsEstimate && input.gramsMin != null && input.gramsMax != null &&
    input.gramsMax >= input.gramsMin
  ) {
    const width = (input.gramsMax - input.gramsMin) / Math.max(input.gramsEstimate, 1);
    score -= Math.min(0.18, Math.max(0, width - 0.2) * 0.22);
  }
  if (input.hiddenFatRisk === "medium") score -= 0.06;
  if (input.hiddenFatRisk === "high") score -= 0.12;
  if (input.imageQuality === "fair") score -= 0.05;
  if (input.imageQuality === "poor") score -= 0.14;
  if (input.componentCount >= 4) score -= 0.05;
  return Math.round(clamp(score) * 100) / 100;
}

export function contextualQuestions(input: {
  hiddenFatRisk: HiddenFatRisk;
  confidence: number;
  gramsEstimate?: number | null;
  gramsMin?: number | null;
  gramsMax?: number | null;
  ambiguousIdentity?: boolean;
}): string[] {
  const questions: string[] = [];
  if (input.ambiguousIdentity) questions.push("Which food is this closest to?");
  if (input.hiddenFatRisk === "high") questions.push("Was this light, normal, or heavy on oil/ghee/butter?");
  if (
    input.gramsEstimate && input.gramsMin != null && input.gramsMax != null &&
    (input.gramsMax - input.gramsMin) / Math.max(input.gramsEstimate, 1) > 0.45
  ) {
    questions.push("Can you confirm the portion size or approximate grams?");
  }
  if (input.confidence < 0.5 && questions.length === 0) {
    questions.push("Add one detail that would help identify or size this meal.");
  }
  return questions.slice(0, 2);
}
