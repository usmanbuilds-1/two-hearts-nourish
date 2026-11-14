import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeFood, type FoodEstimate } from "./scan.functions";

/**
 * This is a deterministic integration regression of our server scan handler with
 * mocked Gemini JSON, NOT a live image recognition or nutritional accuracy test.
 */
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (value: unknown) => unknown) => ({
        handler: (handler: (arg: { data: unknown; context: unknown }) => unknown) =>
          (arg: { data: unknown; context: unknown }) =>
            handler({ data: validate(arg.data), context: arg.context }),
      }),
    }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("./ai-quota.server", () => ({
  claimAiQuota: vi.fn(async () => true),
}));

type ScanResult =
  | { ok: true; estimate: FoodEstimate }
  | { ok: false; error: string };

const callHandler = analyzeFood as unknown as (arg: {
  data: { image: string };
  context: unknown;
}) => Promise<ScanResult>;

const context = {
  userId: "test-member",
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { member_id: "member-1" } }),
        }),
      }),
    }),
  },
};

// Placeholder bytes: there is no real Google vision inference in this test.
const image = "data:image/jpeg;base64,YWJj";

function mockGemini(value: unknown) {
  const request = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
      usageMetadata: {
        promptTokenCount: 780,
        candidatesTokenCount: 130,
        thoughtsTokenCount: 22,
        totalTokenCount: 932,
      },
    }),
  }));
  vi.stubGlobal("fetch", request);
  return request;
}

describe("nihari: real server scan contract with mocked Gemini response", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-only-no-real-key");
    // The mock fetch doesn't use network signals; jsdom lacks AbortSignal.timeout.
    vi.stubGlobal("AbortSignal", { timeout: () => undefined });
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps beef nihari as an uncertain homemade estimate with no packaged match", async () => {
    const request = mockGemini({
      food_name: "Beef nihari",
      serving_description: "One medium bowl (~350 g), beef and gravy; no bread",
      calories: 620,
      protein: 35,
      carbs: 24,
      fat: 43,
      confidence: "low",
      packaged_food: null,
    });
    const result = await callHandler({ data: { image }, context });
    expect(result).toEqual({
      ok: true,
      estimate: {
        food_name: "Beef nihari",
        serving_description: "One medium bowl (~350 g), beef and gravy; no bread",
        calories: 620,
        protein: 35,
        carbs: 24,
        fat: 43,
        confidence: "low",
        packaged_food: null,
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    const args = request.mock.calls[0] as unknown as [string, { body: string }];
    expect(args[0]).toContain("/models/gemini-3.5-flash-lite:generateContent");
    const payload = JSON.parse(args[1].body) as { contents: Array<{ parts: unknown[] }> };
    expect(payload.contents[0]?.parts).toHaveLength(1);
    expect(console.info).toHaveBeenCalledWith("food_scan_token_usage", {
      model: "gemini-3.5-flash-lite",
      input: 780,
      output: 130,
      thinking: 22,
      total: 932,
    });
  });

  it("retains naan with nihari as a combined meal, still not packaged food", async () => {
    const request = mockGemini({
      food_name: "Beef nihari + naan",
      serving_description: "One bowl of beef nihari and one naan",
      calories: 940,
      protein: 43,
      carbs: 93,
      fat: 42,
      confidence: "low",
      packaged_food: null,
    });
    const result = await callHandler({ data: { image }, context });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate.food_name).toBe("Beef nihari + naan");
      expect(result.estimate.packaged_food).toBeNull();
      expect(result.estimate.confidence).toBe("low");
    }
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not silently accept nonsense macros even for a correctly named nihari", async () => {
    const request = mockGemini({
      food_name: "Beef nihari",
      serving_description: "One bowl",
      calories: 4500,
      protein: 2,
      carbs: 3,
      fat: 1,
      confidence: "high",
      packaged_food: null,
    });
    const result = await callHandler({ data: { image }, context });
    expect(result).toEqual({ ok: false, error: "AI_MALFORMED" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
