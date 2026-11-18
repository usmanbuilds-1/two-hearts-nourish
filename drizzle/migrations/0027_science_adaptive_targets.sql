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

CREATE OR REPLACE FUNCTION public.apply_adaptive_target_change(
  p_member_id uuid,
  p_expected_old_target integer,
  p_new_target integer,
  p_estimated_maintenance integer,
  p_maintenance_ci95_low integer,
  p_maintenance_ci95_high integer,
  p_target_ci95_low integer,
  p_target_ci95_high integer,
  p_target_rate_pct_per_week numeric,
  p_desired_kg_per_week numeric,
  p_model_rmse_kg numeric,
  p_data_start date,
  p_data_end date,
  p_complete_days integer,
  p_weight_points integer,
  p_source_references jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $
DECLARE
  v_current_target integer;
  v_history_id uuid;
BEGIN
  SELECT daily_calorie_target
    INTO v_current_target
    FROM public.members
   WHERE id = p_member_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  IF v_current_target IS DISTINCT FROM p_expected_old_target THEN
    RAISE EXCEPTION 'TARGET_CHANGED_CONCURRENTLY';
  END IF;

  IF p_new_target <= 0 OR p_new_target > 10000
     OR p_complete_days < 1
     OR p_weight_points < 3
     OR p_data_end < p_data_start
     OR jsonb_typeof(p_source_references) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ADAPTIVE_TARGET';
  END IF;

  UPDATE public.members
     SET daily_calorie_target = p_new_target
   WHERE id = p_member_id;

  INSERT INTO public.calorie_target_history(
    member_id,
    old_target,
    new_target,
    estimated_maintenance,
    maintenance_ci95_low,
    maintenance_ci95_high,
    target_ci95_low,
    target_ci95_high,
    target_rate_pct_per_week,
    desired_kg_per_week,
    model_version,
    model_rmse_kg,
    data_start,
    data_end,
    complete_days,
    weight_points,
    change_reason,
    source_references
  )
  VALUES(
    p_member_id,
    p_expected_old_target,
    p_new_target,
    p_estimated_maintenance,
    p_maintenance_ci95_low,
    p_maintenance_ci95_high,
    p_target_ci95_low,
    p_target_ci95_high,
    p_target_rate_pct_per_week,
    p_desired_kg_per_week,
    'hall-2011-longterm-v1',
    p_model_rmse_kg,
    p_data_start,
    p_data_end,
    p_complete_days,
    p_weight_points,
    'current_target_outside_model_95ci',
    p_source_references
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$;

REVOKE ALL ON FUNCTION public.apply_adaptive_target_change(
  uuid,integer,integer,integer,integer,integer,integer,integer,numeric,numeric,numeric,date,date,integer,integer,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_adaptive_target_change(
  uuid,integer,integer,integer,integer,integer,integer,integer,numeric,numeric,numeric,date,date,integer,integer,jsonb
) TO service_role;

COMMIT;
