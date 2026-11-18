-- New profiles have adaptive calibration selected by default.
-- Existing profiles that have never configured adaptive targets also opt in.
-- This is not authorization for a numerical change: the server evaluator
-- requires a non-NULL adaptive_target_configured_at (set only after users
-- choose goal, PAL and pace and save).
-- An explicit previous opt-out is preserved via configured_at.
BEGIN;

ALTER TABLE public.members
  ALTER COLUMN adaptive_targets_enabled SET DEFAULT true;

UPDATE public.members
SET adaptive_targets_enabled = true
WHERE adaptive_target_configured_at IS NULL
  AND adaptive_targets_enabled IS DISTINCT FROM true;

COMMIT;
