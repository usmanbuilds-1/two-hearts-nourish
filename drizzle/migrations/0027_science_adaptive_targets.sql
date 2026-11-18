-- Science-grounded adaptive calorie targets.
-- The numeric target is produced by the Hall et al. 2011 long-term model.
-- AI is not permitted to write or modify calorie targets.
BEGIN;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS adaptive_targets_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adaptive_target_configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS physical_activity_level numeric
    CHECK (physical_activity_level IS NULL OR (physical_activity_level >= 1.4 AND physical_activity_level <= 2.5)),
  ADD COLUMN IF NOT EXISTS target_rate_pct_per_week numeric
    CHECK (target_rate_pct_per_week IS NULL OR (target_rate_pct_per_week >= -1 AND target_rate_pct_per_week <= 0.5));

CREATE TABLE IF NOT EXISTS public.nutrition_day_completeness (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(member_id, log_date)
);

CREATE INDEX IF NOT EXISTS nutrition_day_completeness_member_date_idx
  ON public.nutrition_day_completeness(member_id, log_date DESC);

ALTER TABLE public.nutrition_day_completeness ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nutrition_day_completeness FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.nutrition_day_completeness TO service_role;

CREATE TABLE IF NOT EXISTS public.calorie_target_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  old_target integer,
  new_target integer NOT NULL CHECK (new_target > 0 AND new_target <= 10000),
  estimated_maintenance integer NOT NULL CHECK (estimated_maintenance > 0 AND estimated_maintenance <= 10000),
  maintenance_ci95_low integer NOT NULL,
  maintenance_ci95_high integer NOT NULL,
  target_ci95_low integer NOT NULL,
  target_ci95_high integer NOT NULL,
  target_rate_pct_per_week numeric NOT NULL,
  desired_kg_per_week numeric NOT NULL,
  model_version text NOT NULL CHECK (model_version = 'hall-2011-longterm-v1'),
  model_rmse_kg numeric NOT NULL CHECK (model_rmse_kg >= 0),
  data_start date NOT NULL,
  data_end date NOT NULL,
  complete_days integer NOT NULL CHECK (complete_days >= 1),
  weight_points integer NOT NULL CHECK (weight_points >= 3),
  change_reason text NOT NULL CHECK (change_reason = 'current_target_outside_model_95ci'),
  source_references jsonb NOT NULL CHECK (jsonb_typeof(source_references) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS calorie_target_history_member_created_idx
  ON public.calorie_target_history(member_id, created_at DESC);

ALTER TABLE public.calorie_target_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calorie_target_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calorie_target_history TO service_role;

COMMIT;
