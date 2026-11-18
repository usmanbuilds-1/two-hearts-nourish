import type { Member } from "./nutrition";

export type ScienceTip = {
  id: string;
  goals: Array<NonNullable<Member["body_goal"]> | "all">;
  title: string;
  body: string;
  evidence: "Position stand" | "Systematic review" | "Review" | "Randomized trial";
  sourceLabel: string;
  sourceUrl: string;
};

export const SCIENCE_TIPS: readonly ScienceTip[] = [
  {
    id: "protein-daily",
    goals: ["all", "gain", "maintain", "lose"],
    title: "Daily protein matters more than a perfect clock",
    body: "For exercising adults, total daily protein is the main lever. A practical target often lands around 1.4–2.0 g/kg/day, adjusted for the person and goal.",
    evidence: "Position stand",
    sourceLabel: "ISSN — Protein and exercise",
    sourceUrl: "https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8",
  },
  {
    id: "gain-liquid-calories",
    goals: ["gain"],
    title: "Low appetite? Liquids can make a surplus easier",
    body: "Weight-gain reviews identify energy-dense foods and liquid calories as practical ways to raise intake when larger solid meals are hard to finish.",
    evidence: "Review",
    sourceLabel: "Sports Medicine — Weight gain recommendations",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/35233712/",
  },
  {
    id: "gain-surplus",
    goals: ["gain"],
    title: "Use a modest surplus, not a force-feed",
    body: "A moderate energy surplus is commonly recommended for muscle gain, but the exact 'perfect' surplus is not firmly established. Track body-weight trend and adjust.",
    evidence: "Review",
    sourceLabel: "Sports Medicine — Energy surplus and hypertrophy",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31482093/",
  },
  {
    id: "gain-offseason",
    goals: ["gain"],
    title: "Aim to gain slowly enough to monitor it",
    body: "A bodybuilding review suggests roughly 0.25–0.5% body weight gain per week for novice/intermediate lifters, with more conservative rates as training age rises.",
    evidence: "Review",
    sourceLabel: "Sports — Off-season bodybuilding nutrition",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31247944/",
  },
  {
    id: "lose-deficit",
    goals: ["lose"],
    title: "Bigger deficits are not automatically better",
    body: "A meta-analysis found prolonged energy deficits impaired lean-mass gains during resistance training; around a 500 kcal/day deficit was enough to prevent lean-mass gain in the model.",
    evidence: "Systematic review",
    sourceLabel: "Scandinavian Journal of Medicine & Science in Sports",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/34623696/",
  },
  {
    id: "protein-frequency",
    goals: ["maintain", "gain", "lose"],
    title: "Three solid protein meals can be enough",
    body: "In a recent resistance-training trial, three versus five protein-rich eating occasions produced similar gains when total protein intake was comparable.",
    evidence: "Randomized trial",
    sourceLabel: "Nutrition — Protein frequency trial",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40673785/",
  },
  {
    id: "training-volume",
    goals: ["all", "gain", "maintain"],
    title: "Nutrition cannot replace the training signal",
    body: "ACSM's 2026 resistance-training position stand highlights weekly training volume as a central driver of hypertrophy, with about 10 sets per muscle group per week as a useful reference point.",
    evidence: "Position stand",
    sourceLabel: "ACSM — Resistance training position stand",
    sourceUrl: "https://acsm.org/science-spotlight-acsm-releases-new-position-stand-on-resistance-training/",
  },
] as const;

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function scienceTipFor(goal: Member["body_goal"], localDay: string): ScienceTip {
  const eligible = SCIENCE_TIPS.filter((tip) =>
    tip.goals.includes("all") || (goal ? tip.goals.includes(goal) : tip.goals.includes("all")),
  );
  return eligible[hash(`${goal ?? "none"}:${localDay}`) % eligible.length] ?? SCIENCE_TIPS[0]!;
}
