# Two Hearts Nourish — Security + Scanner V2 Implementation Checklist

Branch: `chatgpt/security-scanner-v2-20261117`
Base: `main@7a0a042d0dd508d7524ede14c6a96e59502b7f7c`

Status key:
- [ ] TODO / not yet proven
- [~] IN PROGRESS
- [x] DONE IN REPO
- [!] BLOCKED-LIVE / REQUIRES PRODUCTION OR PHYSICAL VALIDATION

Latest verified repository checkpoint:
- Draft PR #16 remains unmerged.
- Unit tests, strict TypeScript, ESLint, production build and PostgreSQL migration smoke are passing on the implementation branch.
- Live deployment, real-device camera behavior and weighed-meal accuracy remain separate release gates.

## A. Release safety and rollback
- [x] Work only on a dedicated branch; no direct writes to main.
- [x] Open a draft PR; do not merge automatically.
- [x] Keep Scanner V1 available as rollback until V2 is validated.
- [x] Add scanner/model/prompt version identifiers to every scan event.
- [x] Add a V2 feature flag / safe rollout gate.
- [x] Add migration postflight checks and rollback notes.
- [x] Run CI/test/build checks on every implementation commit.
- [!] Verify production deployment/migrations on the live Supabase/Lovable environment.
- [!] Real-device smoke test on iPhone Safari + Android browser.

## B. Security and AI cost hardening
- [x] Remove Gemini API keys from request URLs; use server-side header auth only.
- [x] Add timeouts to every AI provider call.
- [x] Add atomic per-member quota for diet-plan generation.
- [x] Add strong-model escalation quota.
- [x] Add project/global daily AI request ceiling.
- [x] Bound retries/fallbacks and fail closed when quota/security checks fail.
- [x] Pin production model IDs; remove drifting `*-latest` defaults.
- [x] Never expose provider keys, service-role keys, recovery secrets, raw images or bearer tokens to client responses/logs.
- [x] Add repository secret-safety guard tests.
- [x] Stop tracking runtime `.env`; add `.env.example`.
- [x] Add CI on direct pushes to main as well as PRs/feature branches.
- [ ] Add dependency/security audit step where supported.
- [x] Add security response headers / CSP compatible with TanStack Start.
- [x] Replace unsafe inline theme script with CSP-safe external/module path or nonce-compatible approach.
- [!] Enable GitHub secret scanning/push protection/branch protection in repository settings if account permissions allow.
- [!] Configure provider billing alerts/budget caps in Google Cloud.

## C. Identity, room and recovery hardening
- [x] Preserve existing anonymous Supabase auth + member-device binding model.
- [x] Add server-side rate limiting to public room preview/join/recovery endpoints.
- [x] Separate room identifier from join authorization with high-entropy invite capability.
- [x] Keep secret invite/recovery token in URL fragment, not query string.
- [x] Ensure invitation capability expires/revokes after successful partner join.
- [x] Make rejoin/link-device flow transactional where practical.
- [x] Make create/join device + recovery setup transactional where practical.
- [ ] Prevent cross-room/cross-member recovery in negative SQL tests.
- [x] Preserve one-use 256-bit recovery-link behavior and device revocation.
- [x] Ensure personal scanner memory is member-scoped, never room-scoped.

## D. Private meal-photo lifecycle
- [x] Keep meal-photo bucket private.
- [x] Make saving a scan photo explicit and default OFF.
- [x] Never persist raw scan photos merely for AI analysis.
- [x] Delete associated private storage object when owner deletes a meal.
- [x] Prevent cross-room photo deletion/read.
- [x] Add orphan-photo cleanup strategy/test.
- [x] Keep signed URLs short-lived and room-scoped.
- [!] Verify live bucket is private and old public URLs are no longer usable (allowing for CDN cache behavior).

## E. Scanner telemetry and correction foundation
- [x] Add `scan_events` table.
- [x] Add `scan_items` table.
- [x] Add `scan_corrections` table with original vs corrected values.
- [x] Add `member_food_priors` table for private personalization.
- [x] Add `meal_components` table for itemized scan detail while preserving combined-meal UI.
- [x] Add `food_aliases` / deterministic alias layer.
- [x] Return a real `scan_id` to the client.
- [x] Record model, scanner version, prompt version, tokens, latency, route, cache hit, grounding source, escalation reason and confidence.
- [x] Never store raw base64 image, provider key, auth token or raw free-text context in telemetry.
- [x] Record before/after correction deltas correctly.
- [x] Add server-only access policy for learning/telemetry tables.
- [x] Add SQL tests proving partner cannot access another member's private priors/corrections.

## F. Scanner V2 recognition and portion model
- [x] Preserve current V1 endpoint for rollback.
- [x] Add V2 photo analysis returning components, not only combined meal.
- [x] Ask vision model for recognition/portion/cooking evidence rather than treating model macros as authoritative.
- [x] Return estimated grams plus lower/upper plausible range.
- [x] Detect hidden-fat risk: oil, ghee, butter, gravy, sauce, dressing, frying.
- [x] Detect visible package/brand/variant/pack count/grams without guessing hidden labels.
- [x] Reject malformed/unbounded AI output server-side.
- [x] Validate decoded image bytes/MIME, not only data-URL text.
- [x] Cap image dimensions/bytes and request duration.
- [ ] Add image-quality/occlusion/scale-evidence fields.
- [x] Add deterministic evidence-based confidence scoring.
- [x] Do not trust model self-confidence as final confidence.

## G. Nutrition grounding
- [x] Separate food recognition from nutrition calculation.
- [x] Add USDA FoodData Central server integration for generic foods.
- [x] Keep Open Food Facts primarily for packaged/barcoded foods.
- [x] Preserve strict brand/product/variant/package-weight matching.
- [x] Add deterministic candidate matching with score + top1/top2 margin.
- [x] Add nutrition-source provenance to each component.
- [x] Use model-generated macros only as last-resort fallback.
- [x] Add cache for safe database lookups.
- [x] Respect upstream rate limits and timeouts.
- [x] Add South Asian alias normalization (dal/daal, roti/chapati, dahi/yogurt, etc.).
- [ ] Seed a South Asian food-graph v1 with preparation/portion/hidden-fat metadata.

## H. Context fusion
- [x] Add free-text context input on scan review.
- [x] Parse deterministic context locally/server-side first (pack count, grams, tablespoons oil/ghee, explicit identity).
- [x] Recalculate deterministic changes without another AI call.
- [x] Re-run food retrieval when context changes food identity.
- [x] Only call AI again when context genuinely requires visual reinterpretation.
- [ ] Add adaptive question chips for ambiguous portions/identity/hidden fat.
- [x] Never ask questions on every scan.
- [x] Store structured answers needed for personalization, not raw context text by default.
- [x] Add second-angle request path only when geometry is genuinely ambiguous.

## I. Selective escalation and caching
- [x] Default to one cheap vision call.
- [x] Escalate only hard/ambiguous scans to one stronger call.
- [x] Cap strong-model usage independently.
- [ ] Escalate uncertain components/crops where practical rather than full image.
- [x] Add repeat-meal/cache path.
- [x] Make corrected result supersede raw cached result.
- [x] Include portion + relevant context in cache identity.
- [x] Add freshness/decay rules for old personal priors.
- [x] Never let a partner's prior override the current member's estimate.

## J. Scan review UX
- [x] Keep mandatory user review before logging.
- [x] Allow change food identity.
- [x] Allow change grams/portion.
- [x] Allow add missing component.
- [x] Allow remove wrong component.
- [x] Allow package correction.
- [x] Allow hidden-fat/oil/ghee correction.
- [x] Display honest uncertainty/range without overwhelming the user.
- [x] Show nutrition provenance where useful.
- [x] Save combined meal plus components atomically.
- [x] Make photo retention an explicit opt-in.
- [x] Keep manual entry as immediate fallback.

## K. Nutrition-label and barcode paths
- [x] Keep barcode as zero-AI deterministic path.
- [x] Add dedicated nutrition-label scan path.
- [x] Extract only visible label values; missing values remain unknown.
- [x] Add structural sanity checks.
- [x] Use 4/4/9 only as a warning heuristic, never a universal hard reject.
- [x] Let user verify/correct label values before saving.

## L. Other AI features
- [x] Ground text food lookup through the same nutrition retrieval engine.
- [x] Avoid asking Gemini to invent macros when deterministic sources are available.
- [x] Harden Budget Plan: key handling, timeout, quota, model pinning, validation.
- [x] Stop presenting unverified AI grocery prices/sources as current facts.
- [x] Improve macro suggestions using user foods/locale/favorites instead of fixed Western examples.

## M. Meal/data integrity
- [x] Preserve planned-meal exclusion from consumed totals/streaks.
- [x] Preserve local-date handling around midnight.
- [x] Make multi-component scanned-meal save atomic.
- [x] Ensure deleting/editing a combined meal handles components consistently.
- [x] Preserve partner read / owner write semantics.
- [x] Preserve CSV formula escaping and owner-only export.
- [x] Preserve realtime behavior.
- [ ] Regression-test Today, Together, Diary, Week, Recipes, Favorites, Quick Meals, Weight, Settings.

## N. Benchmark and quality gates
- [x] Freeze current V1 scanner/model/prompt as baseline.
- [x] Add benchmark harness + schema to repo.
- [!] Collect initial 30–50 physically weighed meals (desi-heavy) with ground-truth weights/macros.
- [x] Include simple, mixed, layered, high-fat, packaged, beverage and restaurant-style categories.
- [x] Test same meal at multiple angles/distances/lighting.
- [x] Track food-ID accuracy, gram error, calorie MAPE, calorie bias, protein/carb/fat error.
- [x] Track repeat-scan variance and angle sensitivity.
- [x] Track correction rate and average correction magnitude.
- [x] Track scan→review→save conversion, clarification rate and escalation rate.
- [x] Track cost/successful scan and p50/p95 latency.
- [ ] Add regression command so future prompt/model changes can be compared to baseline.
- [!] Grow private benchmark toward 300–500+ measured meals.
- [!] Publish benchmark only after methodology and results are defensible.

## O. Initial engineering targets (not marketing claims)
- [ ] Simple-meal calorie MAPE target <= 15%.
- [ ] Mixed-meal calorie MAPE target <= 25%.
- [ ] Overall calorie bias target within +/-5%.
- [ ] Median repeat-scan variation target <= 10%.
- [ ] Benchmark food-identification target >= 95%.
- [ ] Strong-model escalation target <= 20%.
- [ ] Clarifying-question rate target <= 25%.
- [ ] Average AI cost/scan target < $0.003.
- [ ] Blended hard cost ceiling target < $0.005.
- [ ] p50 scan→review target < 3s where practical.
- [ ] p95 scan→review target < 6s where practical.
- [ ] Correction rate should decline version-over-version without suppressing honest corrections.

## P. Documentation
- [x] Add architecture documentation → `docs/ARCHITECTURE.md`.
- [x] Add scanner/security documentation → `SECURITY.md` + `docs/SCAN_PIPELINE.md`.
- [x] Add accuracy evaluation documentation → `docs/EVALS.md`.
- [x] Add AI cost documentation → `docs/COST_MODEL.md`.
- [x] Add production migration/deployment runbook → `docs/DEPLOYMENT.md`.
- [x] Update README to reflect actual architecture and privacy behavior.
