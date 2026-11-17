# Us — private nutrition for two

A mobile-first nutrition tracker for exactly two people. It combines a shared meal diary, personal targets, private recovery links, packaged-food lookup, and an optional AI-assisted food scanner.

This repository is intentionally designed around **privacy, low operating cost, explicit user review, and deterministic nutrition data before AI guesses**.

## Stack

- React 19 + TypeScript
- TanStack Start / Router / Query
- Tailwind CSS
- Supabase Postgres, Auth, Realtime and Storage
- Google Gemini through server functions only
- USDA FoodData Central for generic-food grounding
- Open Food Facts for exact packaged-food lookup

## Security model

The browser receives a Supabase session, but room membership and sensitive actions are enforced server-side and in Postgres.

Important invariants:

- A room code is an identifier, **not an authorization secret**.
- New-partner invitations use a separate 256-bit, one-use capability stored in the URL fragment.
- Recovery links are one-use, short-lived capabilities.
- Personal recovery keys are hashed in the database.
- Gemini and service-role secrets never ship to the browser.
- Scanner telemetry, correction memory, usage budgets and caches are service-role-only tables.
- Meal photos are private and opt-in. Scanner photos are not retained unless the member explicitly chooses to save one with a meal.
- AI calls fail closed if the database quota guard is unavailable.

See [SECURITY.md](SECURITY.md) for the detailed threat model and controls.

## Scanner V2

Scanner V2 is additive and rollback-safe. V1 remains available behind a client feature flag until V2 has passed live benchmark checks.

V2 flow:

1. Optional member-private repeat-photo cache check.
2. Cheap vision pass for food identity, portion range and ambiguity.
3. USDA grounding for generic foods.
4. Exact packaged-food lookup when the user chooses a package label.
5. Evidence-based confidence calculation.
6. Strong-model escalation only for genuinely ambiguous cases.
7. Editable component review before saving.
8. Structured correction capture and member-specific portion memory.
9. Atomic meal + component save.

See [docs/SCAN_PIPELINE.md](docs/SCAN_PIPELINE.md).

## Required environment

Copy `.env.example` and populate runtime values in your deployment secret store. Never commit a real `.env`.

Server-only secrets include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `USDA_FDC_API_KEY`

Scanner V2 has two independent kill switches:

- `SCANNER_V2_ENABLED=false` — server gate
- `VITE_SCANNER_V2_ENABLED=false` — client gate

Keep both off until migrations and smoke checks are deployed successfully.

## Database deployment order

Production already contains earlier migrations. For this security/scanner release, apply in order:

`0014` → `0015` → `0016` → `0017` → `0018` → `0019` → `0020` → `0021` → `0022` → `0023` → `0024` → `0025`

Do not enable Scanner V2 before `0019–0026` are present.

## Local verification

```bash
bun install
bun run test
bun x tsc --noEmit
bun x eslint . --rule 'prettier/prettier:off'
bun run build
```

GitHub Actions also runs a PostgreSQL migration-smoke job against a realistic synthetic post-0013 schema.

## Product principles

- AI estimates are suggestions, never automatic diary entries.
- Exact label/database values beat model-generated macros.
- Corrections should take seconds, not force a full rescan.
- Confidence must come from evidence, not model self-confidence alone.
- No shame, partner competition, or manipulative streak mechanics.
- Security-critical behavior is enforced below the UI layer.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Scanner pipeline](docs/SCAN_PIPELINE.md)
- [Benchmark/evals](docs/EVALS.md)
- [AI cost model](docs/COST_MODEL.md)
- [Security](SECURITY.md)
