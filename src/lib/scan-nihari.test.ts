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
  data: { image: string; context?: string };
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
    expect(args[0]).toContain("/models/gemini-3.8-flash:generateContent");
    const payload = JSON.parse(args[1].body) as { contents: Array<{ parts: unknown[] }> };
    expect(payload.contents[0]?.parts).toHaveLength(1);
    expect(console.info).toHaveBeenCalledWith("food_scan_token_usage", {
      model: "gemini-3.8-flash",
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

  it("uses a stronger first pass without a second call when the result is valid", async () => {
    const request = mockGemini({
      food_name: "rice and chicken", serving_description: "one plate",
      calories: 610, protein: 33, carbs: 62, fat: 24,
      confidence: "medium", packaged_food: null,
    });
    const result = await callHandler({ data: { image }, context });
    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect((request.mock.calls[0] as unknown as [string])[0]).toContain("/models/gemini-3.8-flash:");
  });

  it("uses the Lite fallback if a 200 response contains unusable nutrition JSON", async () => {
    const fallback = {
      food_name: "toasted bun with breaded patty (filling unconfirmed)",
      serving_description: "one bun and one fried rectangular filling",
      calories: 390, protein: 12, carbs: 44, fat: 18,
      confidence: "low", packaged_food: null,
    };
    const request = vi.fn()
      .mockResolvedValueOnce({
        ok: true, json: async () => ({
          candidates: [{ content: { parts: [{ text: "{not-json" }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true, json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(fallback) }] } }],
        }),
      });
    vi.stubGlobal("fetch", request);
    const result = await callHandler({ data: { image }, context });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate.food_name).toContain("filling unconfirmed");
      expect(result.estimate.confidence).toBe("low");
    }
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toContain("/models/gemini-3.5-flash-lite:");
  });

  it("parses valid JSON from later Gemini text parts without a second request", async () => {
    const response = {
      food_name: "bun with patty", serving_description: "one bun",
      calories: 320, protein: 11, carbs: 41, fat: 13,
      confidence: "low", packaged_food: null,
    };
    const request = vi.fn(async () => ({
      ok: true, json: async () => ({
        candidates: [{ content: { parts: [{ text: "" }, { text: JSON.stringify(response) }] } }],
      }),
    }));
    vi.stubGlobal("fetch", request);
    const result = await callHandler({ data: { image }, context });
    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("never retries a safety-blocked response on another model", async () => {
    const request = vi.fn(async () => ({
      ok: true, json: async () => ({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }),
    }));
    vi.stubGlobal("fetch", request);
    const result = await callHandler({ data: { image }, context });
    expect(result).toEqual({ ok: false, error: "AI_BLOCKED" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("passes a post-result correction as an additional user data part", async () => {
    const request = mockGemini({
      food_name: "chicken patty bun", serving_description: "one bun",
      calories: 430, protein: 24, carbs: 40, fat: 20,
      confidence: "medium", packaged_food: null,
    });
    const result = await callHandler({
      data: { image, context: "It is chicken, not fish." }, context,
    });
    expect(result.ok).toBe(true);
    const args = request.mock.calls[0] as unknown as [string, { body: string }];
    const payload = JSON.parse(args[1].body) as { contents: Array<{ parts: Array<{ text?: string }> }> };
    expect(payload.contents[0]?.parts).toHaveLength(2);
    expect(payload.contents[0]?.parts[0]?.text).toContain("chicken, not fish");
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
    // The same implausible output from both models is rejected.
    expect(request).toHaveBeenCalledTimes(2);
  });
});
