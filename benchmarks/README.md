# Scanner benchmark data

This directory is intentionally data-light in Git. The benchmark harness lives in `src/lib/scan-benchmark.ts`.

## Ground-truth protocol

For each meal:
1. Weigh the empty vessel when needed.
2. Weigh each edible component on a calibrated kitchen scale before serving.
3. Record preparation details that materially change nutrition (oil/ghee/butter/sauce, drained vs undrained, cooked vs raw basis).
4. Resolve ground-truth nutrition from a traceable source (package label for exact packaged food; USDA/FNDDS/Foundation where appropriate; documented recipe calculation for mixed dishes).
5. Capture at least one primary photo. For repeatability cases, capture the same untouched meal from multiple angles/distances and normal lighting changes.
6. Keep the test photo and truth record out of public Git unless licensing/privacy permits publication.

Recommended initial set: 30–50 desi-heavy meals across simple, mixed, layered, high-fat, packaged, beverage and restaurant-style categories. Grow to 300–500+ only after the collection SOP is stable.

Never label synthetic/model-generated nutrition as ground truth.
