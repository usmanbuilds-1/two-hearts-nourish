-- Repair missing column-level grants for adaptive profile settings.
-- Migration 0027 added these columns but did not update member permissions.
-- Authenticated clients must read them on every /today entry and update them
-- when saving their own settings. Existing members RLS limits SELECT to the
-- same room and UPDATE to the current member; no secret columns are granted.
BEGIN;

GRANT SELECT (
  adaptive_targets_enabled,
  adaptive_target_configured_at,
  physical_activity_level,
  target_rate_pct_per_week
) ON TABLE public.members TO authenticated;

GRANT UPDATE (
  adaptive_targets_enabled,
  adaptive_target_configured_at,
  physical_activity_level,
  target_rate_pct_per_week
) ON TABLE public.members TO authenticated;

COMMIT;
