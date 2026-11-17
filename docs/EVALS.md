# Scanner evaluation

Do not claim scanner accuracy from mocked JSON tests. Accuracy requires measured ground truth.

## Ground-truth protocol

For each benchmark meal:

1. Weigh the edible components on a calibrated kitchen scale.
2. Record cooking state and preparation details that materially alter nutrition.
3. Measure/document oil, ghee, butter, dressing and sauces when possible.
4. Resolve nutrition from a traceable source:
   - exact package label for packaged foods
   - USDA/FNDDS/Foundation for suitable generic foods
   - documented ingredient calculation for mixed dishes
5. Capture the normal user-facing photo.
6. For repeatability cases, capture the untouched meal from several ordinary angles/distances.

Never use another model's estimate as ground truth.

## Required metrics

The benchmark harness in `src/lib/scan-benchmark.ts` calculates:

- calorie MAPE
- directional calorie bias
- calorie MAE
- protein/carbs/fat MAE
- gram MAPE where grams are known
- % within ±10%, ±20%, ±30%
- same-meal repeat variation
- p50/p95 latency
- average provider cost

Also track operational metrics outside the static harness:

- component identification precision/recall
- correction rate
- escalation rate
- cache-hit rate
- scan → review → save conversion
- abandonment reason

## Dataset composition

Start with 30–50 tightly measured cases to stabilize collection. Then grow to 300–500+.

Bias the set toward real use:

- Pakistani/South Asian mixed dishes
- rice + curry combinations
- nihari/karahi/biryani/pulao
- roti/chapati and daal
- fried foods and hidden fats
- drinks/chai
- Western simple foods
- packaged foods
- restaurant-style portions
- soups/deep bowls/layered dishes
- repeat-angle cases

## Release discipline

Do not enable V2 for everyone because a handful of demo photos look good.

A release candidate should show:

- no material systematic under-counting
- acceptable repeatability
- correction rate improving or stable
- bounded escalation
- acceptable p95 latency
- measured blended cost below the configured budget target
