# Security

## Scope

This document covers the application controls in this repository. Supabase project configuration, deployment secrets and provider-console settings must also be reviewed separately.

## Secrets

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `USDA_FDC_API_KEY`

Do not prefix server secrets with `VITE_`. A committed runtime `.env` is prohibited; use the deployment secret store and `.env.example`.

## Room access

- Room codes are not credentials.
- Partner invitation requires a 256-bit one-use capability.
- Invitation secrets travel in URL fragments, not query strings.
- Reconnect links are one-use and short-lived.
- Personal recovery keys are stored only as hashes.
- Recovery/device mutations are server-only RPCs and execute transactionally.
- Entry attempts are rate-budgeted per browser identity as defense in depth.

## Database

RLS remains the browser authorization layer for ordinary room data.

Service-role-only tables include:

- AI usage budgets
- scan events/items/corrections
- member food priors
- repeat-scan cache
- photo cleanup queue
- security-attempt budgets

Critical mutation RPCs explicitly revoke browser execution.

## AI abuse controls

Provider calls require an authenticated member plus an atomic quota claim. Both per-member and global ceilings apply. Quota-storage failure blocks the provider request.

No provider secret is returned to the browser.

## Images

Input image validation checks:

- permitted data-URL MIME
- bounded decoded size
- magic bytes

Meal-photo retention is opt-in.

Stored meal images are private and resolved with short-lived signed access. Deleting a meal queues object cleanup transactionally.

## Browser protections

The server emits:

- CSP
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- restrictive Permissions Policy
- HSTS on HTTPS

The current CSP still allows framework-managed inline scripts/styles where required by the TanStack/Lovable runtime. Tighten this further only after verifying nonce/hash support in the production output.

## CI security guards

CI verifies:

- no committed `.env`
- no obvious browser-side provider/service-role secret patterns
- no unpinned `*-latest` Gemini aliases
- tests
- strict TypeScript
- ESLint
- production build
- SQL migrations `0014–0026`
- server-only privilege assertions for security RPCs/tables

## Incident response

If a server secret is exposed:

1. Rotate/revoke it at the provider immediately.
2. Remove it from the deployment environment and Git history if committed.
3. Review provider usage and Supabase logs for abuse.
4. Redeploy with the replacement secret.
5. Do not rely on deleting the visible file alone.

If a member recovery capability may be exposed, rotate that member's recovery keys from Device Center.


## Temporary dependency advisory exception

CI currently ignores only `GHSA-fc5q-39xc-vjpf` (picomatch repeated-extglob ReDoS) because, as of 2026-11-18, npm has no patched picomatch release. The application has no direct picomatch/micromatch/minimatch/glob imports and does not pass user-controlled glob patterns into the transitive framework/build-tool copies. All other high/critical advisories remain blocking. Remove this exception as soon as a patched upstream release becomes available.
