# P0–P2 production release — Two Hearts Nourish

**Status:** Implemented on GitHub draft [PR #5](https://github.com/usmanbuilds-1/two-hearts-nourish/pull/5); NOT merged or deployed while production migrations remain unapplied.

## Critical deploy order

1. Confirm a recent database backup and the correct Supabase project.
2. Confirm migration `0013_device_recovery_keys.sql` was previously executed successfully. Keep the existing `members`, `rooms`, `meals`, `member_devices`, and `member_recovery_keys` data intact.
3. In Supabase SQL editor, run **`docs/sql_p0_p2_0014_0017.sql`**. The file contains the exact four reviewed migration files in order. SQL 0014 makes meal photos private; **current published photo URLs stop working until the new app bundle deploys**. Coordinate migration closely with publish.
4. Run postflight SQL below and verify expected values.
5. Merge [PR #5](https://github.com/usmanbuilds-1/two-hearts-nourish/pull/5) after CI is green and migration has succeeded.
6. Deploy **both frontend and TanStack server functions** from the updated `main` commit. The GitHub connector has no production hosting publish action; GitHub merge alone does not prove deployment. No new Edge Functions are needed.
7. Verify via real iPhone Safari/Android devices with two separate anonymous accounts. Test recovery before relying on it.

## Postflight database validation

```sql
SELECT
  to_regclass('public.member_recovery_keys') IS NOT NULL AS recovery_keys_exist,
  to_regclass('public.ai_usage_daily') IS NOT NULL AS ai_quota_table_exists,
  (SELECT public FROM storage.buckets WHERE id = 'meal-photos') AS meal_photos_public,
  has_table_privilege('authenticated','public.member_recovery_keys','SELECT') AS users_can_read_keys,
  has_table_privilege('service_role','public.member_recovery_keys','INSERT') AS server_can_store_keys,
  has_function_privilege('authenticated','public.rotate_member_recovery(uuid,text,uuid)','EXECUTE') AS clients_can_rotate_any_account,
  has_function_privilege('service_role','public.rotate_member_recovery(uuid,text,uuid)','EXECUTE') AS server_can_rotate,
  has_function_privilege('authenticated','public.room_activity_rollup(uuid,date)','EXECUTE') AS clients_can_call_lifetime_rollup,
  has_function_privilege('service_role','public.room_activity_rollup(uuid,date)','EXECUTE') AS server_can_aggregate,
  has_function_privilege('authenticated','public.claim_ai_request(uuid,text,integer)','EXECUTE') AS clients_can_claim_ai_requests,
  has_function_privilege('service_role','public.claim_ai_request(uuid,text,integer)','EXECUTE') AS server_can_claim_ai_requests;
```

Expected: true, true, **false**, false, true, false, true, false, true, false, true.
Confirm `public.member_devices` has `device_label` and `last_seen_at`, `public.member_recovery_keys` has `device_id`, and `public.meals` has `is_planned` and `photo_url`.

## Acceptance checklist

### P0 — Identity and safety
- Anonymous Supabase session loss with saved recovery key retains correct member; offline state never calls `clearSession`.
- Partner rejoin links never switch partner identity. Lost phone revocation denies further room access; key rotation invalidates **all previous** member recovery keys and legacy key without changing partner's credentials.
- Six-digit link endpoints are disabled; only cryptographically random 256-bit one-use links are accepted.
- Reusing, expiring, guessing, cross-room swapping or superseding a link must fail. Both members losing all credentials is not automatically recoverable; preserve private backup keys.
- New photos use a **private** Storage bucket and short-lived signed URLs with room-scoped RLS.
- Old public URLs should return unauthorized after migration; check CDN caches. If exposed, purge caches where the Supabase plan supports it. **Do not** claim cached previously public URLs are instantly erased. Old objects may retain longer historical cacheControl values.

### P0 — Data correctness
- Planned meals appear as planned, but **never** affect consumed calories/protein, streaks, weekly summaries or lifetime shared stats.
- Historical daily weight records use the phone's local date; weight trend uses real calendar intervals, not entry positions.
- Correct production schema and typed meal fields; strict TypeScript checks required.

### P1 — Performance and food logging
- Initial data load is bounded to the recent 90-day window; older **lifetime** couple totals are calculated by a server-only SQL rollup instead of truncated client data.
- Food search is explicit on submit, not per keystroke. Barcode uses camera where supported and manual input otherwise.
- Community label values are not AI-invented; incomplete Open Food Facts macros are rejected. User can adjust grams.
- Gemini runs directly with the server API key only; model fallback, 15-second request timeout, plausibility checks, atomic per-member daily scan/text quotas, manual-entry fallback.
- Recipe editing must update in place; logging a multi-item recipe must be a single atomic insert. Repeat last meal and favorites work.
- Offline banner makes no false promise of offline write syncing.

### P2 — Shared experience and UX
- Clear first-time invitation and recovery paths, plus connected device list and secure key copy.
- Together screen has grounded weekly recap and shared regular meals without copying calories between partners.
- CSV export returns only the signed-in member's meals, escapes formulas, and is bounded to avoid excessive payloads.
- Mobile touch targets are large; no nested action buttons on Today; clear error/fallback UI.
- iOS and Android smoke tests: onboarding, join/rejoin, editing, scan, barcode, photo previews, nutrition counts, and device rotation.

## Continuous integration

The PR workflow runs `bun install --frozen-lockfile`, `bun run test`, `bun x tsc --noEmit`, `bun x eslint . --rule 'prettier/prettier:off'`, and `bun run build` as **required** checks. Repo-wide Prettier formatting debt is tracked separately; no blanket reformat is needed for this security release.

## Data protection and rollback

- Migrations do **not** drop rooms, meals, or members.
- Photo privacy deliberately changes access to older files; roll forward with the new signed-URL frontend. Do not revert by making the bucket public unless an authorized owner knowingly accepts privacy exposure.
- User-requested key rotation deliberately destroys validity of old recovery secrets; it cannot be reversed.
- If the new web bundle fails, revert the application commit on the host; preserve additive tables, re-evaluate signed-photo frontend compatibility, and fix forward where practical.
- Supabase cached public photo URLs may persist at CDN/browser edges. See: https://supabase.com/docs/guides/storage/cdn/smart-cdn and https://supabase.com/kb/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout

## Architecture references

- Supabase anonymous identities: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase Storage private bucket RLS/signed URLs: https://supabase.com/docs/guides/storage/security/access-control
- OWASP session expiration and invalidation: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- TanStack placeholder query data: https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data
- WCAG 2.2 pointer target sizes: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
