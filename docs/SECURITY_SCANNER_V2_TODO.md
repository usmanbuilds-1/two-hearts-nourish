# Two Hearts Nourish — Security + Scanner V2 Implementation Checklist

Branch: `chatgpt/security-scanner-v2-20261117`
Base: `main@7a0a042d0dd508d7524ede14c6a96e59502b7f7c`

Status key:
- [ ] TODO
- [~] IN PROGRESS
- [x] DONE IN REPO
- [!] BLOCKED-LIVE / REQUIRES PRODUCTION OR PHYSICAL VALIDATION

## A. Release safety and rollback
- [x] Work only on a dedicated branch; no direct writes to main.
- [ ] Open a draft PR; do not merge automatically.
- [ ] Keep Scanner V1 available as rollback until V2 is validated.
- [ ] Add scanner/model/prompt version identifiers to every scan event.
- [ ] Add a V2 feature flag / safe rollout gate.
- [ ] Add migration postflight checks and rollback notes.
- [ ] Run CI/test/build checks on every implementation commit.
- [!] Verify production deployment/migrations on the live Supabase/Lovable environment.
- [!] Real-device smoke test on iPhone Safari + Android browser.

## B. Security and AI cost hardening
- [ ] Remove Gemini API keys from request URLs; use server-side header auth only.
- [ ] Add timeouts to every AI provider call.
- [ ] Add atomic per-member quota for diet-plan generation.
- [ ] Add strong-model escalation quota.
- [ ] Add project/global daily AI request ceiling.
- [ ] Bound retries/fallbacks and fail closed when quota/security checks fail.
- [ ] Pin production model IDs; remove drifting `*-latest` defaults.
- [ ] Never expose provider keys, service-role keys, recovery secrets, raw images or bearer tokens to client responses/logs.
- [ ] Add repository secret-safety guard tests.
- [ ] Stop tracking runtime `.env`; add `.env.example`.
- [ ] Add CI on direct pushes to main as well as PRs/feature branches.
- [ ] Add dependency/security audit step where supported.
- [ ] Add security response headers / CSP compatible with TanStack Start.
- [ ] Replace unsafe inline theme script with CSP-safe external/module path or nonce-compatible approach.
- [!] Enable GitHub secret scanning/push protection/branch protection in repository settings if account permissions allow.
- [!] Configure provider billing alerts/budget caps in Google Cloud.

## C. Identity, room and recovery hardening
- [ ] Preserve existing anonymous Supabase auth + member-device binding model.
- [ ] Add server-side rate limiting to public room preview/join/recovery endpoints.
- [ ] Separate room identifier from join authorization with high-entropy invite capability.
- [ ] Keep secret invite/recovery token in URL fragment, not query string.
- [ ] Ensure invitation capability expires/revokes after successful partner join.
- [ ] Make rejoin/link-device flow transactional where practical.
- [ ] Make create/join device + recovery setup transactional where practical.
- [ ] Prevent cross-room/cross-member recovery in negative SQL tests.
- [ ] Preserve one-use 256-bit recovery-link behavior and device revocation.
- [ ] Ensure personal scanner memory is member-scoped, never room-scoped.

## D. Private meal-photo lifecycle
- [ ] Keep meal-photo bucket private.
- [ ] Make saving a scan photo explicit and default OFF.
- [ ] Never persist raw scan photos merely for AI analysis.
- [ ] Delete associated private storage object when owner deletes a meal.
- [ ] Prevent cross-room photo deletion/read.
- [ ] Add orphan-photo cleanup strategy/test.
- [ ] Keep signed URLs short-lived and room-scoped.
- [!] Verify live bucket is private and old public URLs are no longer usable (allowing for CDN cache behavior).

## E. Scanner telemetry and correction foundation
- [ ] Add `scan_events` table.
- [ ] Add `scan_items` table.
- [ ] Add `scan_corrections` table with original vs corrected values.
- [ ] Add `member_food_priors` table for private personalization.
- [ ] Add `meal_components` table for itemized scan detail while preserving combined-meal UI.
- [ ] Add `food_aliases` / deterministic alias layer.
- [ ] Return a real `scan_id` to the client.
- [ ] Record model, scanner version, prompt version, tokens, latency, route, cache hit, grounding source, escalation reason and confidence.
- [ ] Never store raw base64 image, provider key, auth token or raw free-text context in telemetry.
- [ ] Record before/after correction deltas correctly.
- [ ] Add server-only access policy for learning/telemetry tables.
- [ ] Add SQL tests proving partner cannot access another member's private priors/corrections.

## F. Scanner V2 recognition and portion model
- [ ] Preserve current V1 endpoint for rollback.
- [ ] Add V2 photo analysis returning components, not only combined meal.
- [ ] Ask vision model for recognition/portion/cooking evidence rather than treating model macros as authoritative.
- [ ] Return estimated grams plus lower/upper plausible range.
- [ ] Detect hidden-fat risk: oil, ghee, butter, gravy, sauce, dressing, frying.
- [ ] Detect visible package/brand/variant/pack count/grams without guessing hidden labels.
- [ ] Reject malformed/unbounded AI output server-side.
- [ ] Validate decoded image bytes/MIME, not only data-URL text.
- [ ] Cap image dimensions/bytes and request duration.
- [ ] Add image-quality/occlusion/scale-evidence fields.
- [ ] Add deterministic evidence-based confidence scoring.
- [ ] Do not trust model self-confidence as final confidence.

## G. Nutrition grounding
- [ ] Separate food recognition from nutrition calculation.
- [ ] Add USDA FoodData Central server integration for generic foods.
- [ ] Keep Open Food Facts primarily for packaged/barcoded foods.
- [ ] Preserve strict brand/product/variant/package-weight matching.
- [ ] Add deterministic candidate matching with score + top1/top2 margin.
- [ ] Add nutrition-source provenance to each component.
- [ ] Use model-generated macros only as last-resort fallback.
- [ ] Add cache for safe database lookups.
- [ ] Respect upstream rate limits and timeouts.
- [ ] Add South Asian alias normalization (dal/daal, roti/chapati, dahi/yogurt, etc.).
- [ ] Seed a South Asian food-graph v1 with preparation/portion/hidden-fat metadata.

## H. Context fusion
- [ ] Add free-text context input on scan review.
- [ ] Parse deterministic context locally/server-side first (pack count, grams, tablespoons oil/ghee, explicit identity).
- [ ] Recalculate deterministic changes without another AI call.
- [ ] Re-run food retrieval when context changes food identity.
- [ ] Only call AI again when context genuinely requires visual reinterpretation.
- [ ] Add adaptive question chips for ambiguous portions/identity/hidden fat.
- [ ] Never ask questions on every scan.
- [ ] Store structured answers needed for personalization, not raw context text by default.
- [ ] Add second-angle request path only when geometry is genuinely ambiguous.

## I. Selective escalation and caching
- [ ] Default to one cheap vision call.
- [ ] Escalate only hard/ambiguous scans to one stronger call.
- [ ] Cap strong-model usage independently.
- [ ] Escalate uncertain components/crops where practical rather than full image.
- [ ] Add repeat-meal/cache path.
- [ ] Make corrected result supersede raw cached result.
- [ ] Include portion + relevant context in cache identity.
- [ ] Add freshness/decay rules for old personal priors.
- [ ] Never let a partner's prior override the current member's estimate.

## J. Scan review UX
- [ ] Keep mandatory user review before logging.
- [ ] Allow change food identity.
- [ ] Allow change grams/portion.
- [ ] Allow add missing component.
- [ ] Allow remove wrong component.
- [ ] Allow package correction.
- [ ] Allow hidden-fat/oil/ghee correction.
- [ ] Display honest uncertainty/range without overwhelming the user.
- [ ] Show nutrition provenance where useful.
- [ ] Save combined meal plus components atomically.
- [ ] Make photo retention an explicit opt-in.
- [ ] Keep manual entry as immediate fallback.

## K. Nutrition-label and barcode paths
- [ ] Keep barcode as zero-AI deterministic path.
- [ ] Add dedicated nutrition-label scan path.
- [ ] Extract only visible label values; missing values remain unknown.
- [ ] Add structural sanity checks.
- [ ] Use 4/4/9 only as a warning heuristic, never a universal hard reject.
- [ ] Let user verify/correct label values before saving.

## L. Other AI features
- [ ] Ground text food lookup through the same nutrition retrieval engine.
- [ ] Avoid asking Gemini to invent macros when deterministic sources are available.
- [ ] Harden Budget Plan: key handling, timeout, quota, model pinning, validation.
- [ ] Stop presenting unverified AI grocery prices/sources as current facts.
- [ ] Improve macro suggestions using user foods/locale/favorites instead of fixed Western examples.

## M. Meal/data integrity
- [ ] Preserve planned-meal exclusion from consumed totals/streaks.
- [ ] Preserve local-date handling around midnight.
- [ ] Make multi-component scanned-meal save atomic.
- [ ] Ensure deleting/editing a combined meal handles components consistently.
- [ ] Preserve partner read / owner write semantics.
- [ ] Preserve CSV formula escaping and owner-only export.
- [ ] Preserve realtime behavior.
- [ ] Regression-test Today, Together, Diary, Week, Recipes, Favorites, Quick Meals, Weight, Settings.

## N. Benchmark and quality gates
- [ ] Freeze current V1 scanner/model/prompt as baseline.
- [ ] Add benchmark harness + schema to repo.
- [!] Collect initial 30–50 physically weighed meals (desi-heavy) with ground-truth weights/macros.
- [ ] Include simple, mixed, layered, high-fat, packaged, beverage and restaurant-style categories.
- [ ] Test same meal at multiple angles/distances/lighting.
- [ ] Track food-ID accuracy, gram error, calorie MAPE, calorie bias, protein/carb/fat error.
- [ ] Track repeat-scan variance and angle sensitivity.
- [ ] Track correction rate and average correction magnitude.
- [ ] Track scan→review→save conversion, clarification rate and escalation rate.
- [ ] Track cost/successful scan and p50/p95 latency.
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
- [ ] Add `docs/SCANNER_ARCHITECTURE.md`.
- [ ] Add `docs/SCAN_SECURITY.md`.
- [ ] Add `docs/ACCURACY_EVALS.md`.
- [ ] Add `docs/AI_COST_MODEL.md`.
- [ ] Add production migration/deployment runbook.
- [ ] Update README to reflect actual architecture and privacy behavior.
