# Returning-login and device-identity release

Release branch: `fix/returning-login-device-identity-2026-11-13`.

## Included

- Landing page recognizes an already-linked anonymous Supabase auth user even if the local room marker was lost. No new anonymous account is created while checking.
- Paste the room code, same-origin invitation, or private rejoin link in one input.
- Creating or joining a different room can no longer silently delete an existing sole-member room.
- Device-specific personal recovery keys rebind to their original `member_devices` row on lost auth, rather than creating duplicates.
- Newly linked devices get recognizable browser/platform labels before Settings is ever opened; labels are cosmetic and current devices may be renamed.
- A lightweight app-opening heartbeat records recent authenticated activity.
- Device Center displays current and last-30-day verified sign-ins; older/unverified sign-ins remain accessible behind an expandable section.
- Users may deliberately remove selected old sign-ins or all other sign-ins; keys rotate in the same database transaction. This cannot touch partner membership.

## Rollout

1. Back up Supabase production data.
2. Confirm `0015_device_security.sql` was previously applied (device_label, last_seen_at, device_id columns exist).
3. Run `drizzle/migrations/0018_bulk_device_cleanup.sql`. No existing device rows or recovery keys are removed by this migration.
4. Postflight SQL:

```sql
SELECT
  to_regprocedure('public.rotate_member_recovery_many(uuid,text,uuid[])') IS NOT NULL AS bulk_cleanup_exists,
  has_function_privilege('authenticated','public.rotate_member_recovery_many(uuid,text,uuid[])','EXECUTE') AS browser_can_bulk_cleanup,
  has_function_privilege('service_role','public.rotate_member_recovery_many(uuid,text,uuid[])','EXECUTE') AS server_can_bulk_cleanup,
  has_function_privilege('authenticated','public.rebind_member_device(uuid,uuid,uuid,boolean)','EXECUTE') AS browser_can_rebind_anyone,
  has_function_privilege('service_role','public.rebind_member_device(uuid,uuid,uuid,boolean)','EXECUTE') AS server_can_rebind,
  (SELECT public FROM storage.buckets WHERE id='meal-photos') AS meal_photos_public;
```

Expected: true, false, true, false, true, false. Check the correct Supabase project.

5. Merge PR only once CI succeeds and production migration is applied; publish the updated frontend AND TanStack server immediately after merge.
6. Smoke test on two real browsers: returning with intact session, missing local room marker, lost anonymous auth but saved private key, one-use link to new device, partner rejoin, and rejoin after token loss. Confirm same key rebind does not increase device count.
7. Open Settings on two devices: both should appear labeled once they open updated app. Check that older sign-ins are grouped, and **only** test bulk cleanup on a disposable account first.
8. Upload one meal photo, then confirm it is inaccessible without authentication via its old public URL. New signed URL works temporarily for a room member.

## Safety and privacy

- The migration alone does not automatically delete historical sign-ins.
- Old rows can represent browser reinstalls, preview origins, or genuinely active sessions that predate activity tracking. Do not automatically revoke them.
- Bulk cleanup revokes each chosen session and invalidates **all** previously issued recovery keys for that member. Keep the replacement key; partner credentials are never rotated.
- Anonymous sign-in is convenient but does not provide magical recovery after clearing all browser data. The saved key or a secure link from the partner is still required.
- Private Storage's `public=false` setting must be independently verified in the *live* project. Past cached public URLs may persist until caches expire or are purged.
