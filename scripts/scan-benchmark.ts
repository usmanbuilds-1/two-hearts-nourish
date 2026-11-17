import { z } from "zod";
import { summarizeBenchmark, type BenchmarkObservation } from "../src/lib/scan-benchmark";

const nutrition = z.object({
  calories: z.number().finite().min(0),
  protein: z.number().finite().min(0),
  carbs: z.number().finite().min(0),
  fat: z.number().finite().min(0),
  grams: z.number().finite().positive().optional(),
});

const observation = z.object({
  mealId: z.string().min(1),
  category: z.string().min(1),
  truth: nutrition,
  predicted: nutrition,
  latencyMs: z.number().finite().min(0).optional(),
  costMicrousd: z.number().finite().min(0).optional(),
});

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: bun run benchmark:scanner -- <benchmark-observations.json>");
  process.exit(2);
}

const file = Bun.file(filePath);
if (!(await file.exists())) {
  console.error("Benchmark file not found:", filePath);
  process.exit(2);
}

let raw: unknown;
try {
  raw = JSON.parse(await file.text());
} catch {
  console.error("Benchmark file must be valid JSON.");
  process.exit(2);
}

const validated = z.array(observation).safeParse(raw);
if (!validated.success) {
  console.error("Benchmark data does not match the expected observation schema.");
  console.error(validated.error.issues.slice(0, 10));
  process.exit(2);
}

const rows = validated.data as BenchmarkObservation[];
const summary = summarizeBenchmark(rows);
console.log(JSON.stringify(summary, null, 2));
