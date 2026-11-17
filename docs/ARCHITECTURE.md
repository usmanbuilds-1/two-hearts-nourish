# Architecture

## Trust boundaries

```text
Browser
  │ Supabase user session / server-function auth
  ▼
TanStack Start server functions
  ├─ authenticated Supabase client (RLS)
  ├─ service-role Supabase client (server only)
  ├─ Gemini API (server only)
  ├─ USDA FoodData Central (server only)
  └─ Open Food Facts packaged-food lookup
        │
        ▼
Supabase Postgres / Realtime / private Storage
```

The browser is never trusted with service-role credentials, Gemini credentials, quota mutation RPCs, correction-memory tables, scan telemetry tables or cleanup queues.

## Identity and rooms

The app intentionally avoids email/password UX, but it still uses a Supabase-backed browser identity.

- `member_devices` binds a Supabase auth user to one member profile.
- `rooms` hold exactly two member seats.
- Room codes are human-readable identifiers only.
- New-partner join requires a separate one-use, high-entropy invitation capability.
- Reconnect links are one-use and short-lived.
- Personal recovery keys are hashed and can be rotated.
- Device removal rotates the member's recovery capabilities atomically.

## Meals

Ordinary manual meals use room/member RLS. Scanner V2 saves through a server-only Postgres RPC so the meal row, component rows and scan link are committed together.

`meal_components` preserves item-level nutrition and provenance for scanner-created meals.

## Photos

The `meal-photos` bucket is private.

- Scanner analysis photos are not persisted by default.
- A member can explicitly opt to keep a photo with a meal.
- Photo upload happens only after the meal is saved.
- A server-verified attach step links the object to an owned meal.
- Deleting a meal transactionally queues its photo for Storage cleanup.
- Cleanup retries are service-role-only and cannot resurrect a deleted meal.

## Realtime

Shared meal visibility still comes from Supabase Realtime. RLS determines which room rows a browser can read. Realtime is not used as an authorization mechanism.

## AI budgets

Every provider-backed feature calls the same atomic Postgres quota guard before a paid/limited request:

- photo scans
- text nutrition fallback
- diet-plan generation
- strong-model scan escalation

Both per-member and project-wide daily ceilings are enforced. If quota state cannot be read or written, the provider request is not sent.

## Private learning data

Member-specific correction memory is deliberately isolated:

- `scan_events` — route/model/token/cost metadata, no raw image or raw prompt
- `scan_items` — structured scan outputs
- `scan_corrections` — original vs corrected structured values
- `member_food_priors` — confirmed member-specific portions/nutrition priors
- `member_scan_cache` — member-scoped visual fingerprint + final confirmed structured estimate

These tables are denied to browser roles and accessible only through bounded server functions.
