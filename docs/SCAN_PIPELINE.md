# Scanner V2 pipeline

Scanner V2 is designed to improve accuracy **without turning every photo into an expensive frontier-model call**.

## Routing

```text
photo
  │
  ├─ confirmed-result cache hit? ───────────────► review (0 AI calls)
  │
  └─ cheap vision pass
       │ identity + components + grams range + ambiguity
       ▼
     deterministic context
       │ "2 × 61 g", "actually beef", "2 tbsp ghee"
       ▼
     nutrition grounding
       ├─ USDA generic-food match
       ├─ exact packaged-food lookup when selected
       └─ model nutrition only as last-resort fallback
       ▼
     evidence confidence
       │
       ├─ strong enough ────────────────────────► review
       └─ genuinely ambiguous ─► bounded strong-model pass ─► review
```

## What the vision model should do

The model is primarily a **perception layer**, not the nutrition database. It should return:

- visible components
- a portion estimate plus lower/upper range
- visible preparation clues
- hidden-fat risk
- image quality
- ambiguity flags
- package text only when legible

Model-generated macros remain a fallback for cases where deterministic retrieval fails.

## Deterministic context

User context is parsed before another AI call whenever possible.

Examples:

- `2 packets, 61g each` → 122 g
- `actually beef` → identity override + database re-grounding when possible
- `2 tbsp oil` → explicit added-fat calculation

Raw context is not stored in the private cache; only a one-way context fingerprint may be persisted.

## Grounding

### USDA

USDA FoodData Central is the generic-food backbone. Candidate selection requires:

- meaningful lexical overlap
- a minimum absolute score
- separation from the second-best result

A weak match must never silently replace the model estimate.

### Open Food Facts

Open Food Facts is for packaged products and labels, not the generic-food backbone. Exact brand/product/package-size matching is preferred over fuzzy substitution.

## Confidence

Confidence combines evidence rather than trusting the model's own confidence:

- recognition confidence
- portion confidence
- database match quality
- portion-range width
- hidden-fat uncertainty
- image quality
- number of components

The UI can ask for context or a second angle when the actual uncertainty warrants it.

## Escalation

The strong model is intentionally bounded. Typical escalation reasons:

- ambiguous identity
- model explicitly requests a second pass
- low evidence confidence

A strong-model failure must not discard a valid cheap-model result.

## Corrections and memory

The review screen supports:

- changing grams
- changing label/macros
- removing an incorrect component
- adding a missing component
- exact packaged-food replacement
- structured context

Corrections are linked to a real `scan_id` and original item IDs.

Member priors become suggestions only after repeated confirmation. They do **not** silently override a new photo.

## Repeat-photo cache

The browser computes a small perceptual fingerprint locally. The server stores only:

- member ID
- visual fingerprint
- context fingerprint
- scanner version
- final user-confirmed structured estimate
- expiry

No raw photo is stored for cache purposes. Two-angle scans intentionally bypass this cache.

## Rollback

V1 is preserved as a separate component. Disable either Scanner V2 flag to route users back to V1 without reverting database migrations.
