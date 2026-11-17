# Production deployment and rollback

Scanner V2 is now the production default. Scanner V1 remains available as an emergency rollback path.

## 1. Preflight

Before applying migrations:

- Confirm the current production database backup/recovery policy.
- Confirm `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and (recommended) `USDA_FDC_API_KEY` exist only in the server secret store.
- Scanner V2 is enabled by default.
- Set either scanner flag to `false` only if an emergency rollback is required.
- Confirm the current app still passes its normal meal/invite/recovery smoke tests.
- Confirm the `meal-photos` bucket can be made private without depending on public CDN URLs.

## 2. Apply database migrations

Apply in numeric order. If production already has 0014–0018, continue from 0019.

```text
0014_private_meal_photos
0015_device_security
0016_lifetime_couple_stats
0017_ai_quotas
0018_bulk_device_cleanup
0019_scanner_v2_security
0020_scanner_atomic_meals
0021_secure_partner_invites
0022_atomic_rejoin
0023_food_prior_memory
0024_private_scan_cache
0025_security_attempt_budgets
0026_scanner_evidence
```

Do not skip migrations in the middle.

## 3. Post-migration checks

Verify in production:

- `meal-photos` is private.
- Browser roles cannot SELECT scanner telemetry, correction, prior, cache, cleanup or security-budget tables.
- Browser roles cannot execute the server-only quota, room-capability, recovery, scanner-save or prior-memory RPCs.
- Existing members can still open their room.
- Existing recovery keys still work as designed.
- Existing meal rows remain readable.
- Private meal images render through signed URLs.
- Deleting a meal with a photo queues/removes its Storage object.

## 4. Deploy application code

Deploy the code with the default V2 behavior unless you are intentionally performing an emergency rollback.

Smoke-test:

- manual add/edit/delete
- Today/Together/Week
- favourites/recent/quick meals
- packaged-food search + barcode
- room creation
- private partner invitation
- recovery key
- one-use reconnect link
- photo upload/delete
- Scanner V1

This proves the additive migrations did not require V2 to function.

## 5. Scanner V2 runtime behavior

V2 is enabled when the flags are absent or set to `true`.

Emergency rollback:

```text
SCANNER_V2_ENABLED=false
VITE_SCANNER_V2_ENABLED=false
```

Remove those overrides, or set them back to `true`, to restore V2.

Test at minimum:

- ordinary meal photo
- mixed/desi meal
- explicit context (`2 packets, 61g each`)
- added oil/ghee context
- exact packaged-food replacement
- barcode path
- nutrition-label path
- optional second angle
- manual component add/remove
- correction + save
- photo retention OFF and ON
- meal deletion after retained photo
- daily scan limit
- strong-model escalation limit

## 6. Observe before broad rollout

Monitor structured telemetry, not raw user content:

- successful scan count
- cache-hit rate
- grounding source mix
- escalation rate/reasons
- correction rate
- token totals
- estimated provider cost
- p50/p95 latency
- scan → review → save completion

Do not market an accuracy percentage until the weighed-meal benchmark has enough defensible data.

## Rollback

Scanner rollback does **not** require reversing migrations.

Set either scanner flag false; safest is both:

```text
SCANNER_V2_ENABLED=false
VITE_SCANNER_V2_ENABLED=false
```

The UI returns to Scanner V1. The additive V2 tables can remain in place.

If a provider has an outage, keep manual logging, barcode and deterministic database paths available rather than bypassing quotas or weakening server validation.

## Live-only checks that cannot be proven in repository CI

- production Supabase project secrets
- Google billing alerts/budget controls
- GitHub secret scanning / push protection / branch rules
- real iPhone Safari camera behavior
- real Android browser camera behavior
- old public-image URL/CDN behavior after bucket privacy change
- weighed-meal accuracy targets and provider cost under real traffic
