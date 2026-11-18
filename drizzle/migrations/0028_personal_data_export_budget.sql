-- Allow the existing server-only security budget to throttle personal data exports.
BEGIN;

ALTER TABLE public.security_attempt_budgets
  DROP CONSTRAINT IF EXISTS security_attempt_budgets_action_check;

ALTER TABLE public.security_attempt_budgets
  ADD CONSTRAINT security_attempt_budgets_action_check
  CHECK (
    action IN (
      'room_preview',
      'partner_join',
      'rejoin_link',
      'recovery_key',
      'personal_data_export'
    )
  );

CREATE OR REPLACE FUNCTION public.claim_security_attempt(
  p_actor_auth_user_id uuid,
  p_action text,
  p_window_seconds integer,
  p_max_attempts integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_now timestamptz := now();
  v_row public.security_attempt_budgets%ROWTYPE;
BEGIN
  IF p_actor_auth_user_id IS NULL
     OR p_action NOT IN (
       'room_preview',
       'partner_join',
       'rejoin_link',
       'recovery_key',
       'personal_data_export'
     )
     OR p_window_seconds < 10 OR p_window_seconds > 86400
     OR p_max_attempts < 1 OR p_max_attempts > 1000 THEN
    RAISE EXCEPTION 'INVALID_SECURITY_BUDGET';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(
      'two-hearts-security:' ||
      p_actor_auth_user_id::text ||
      ':' ||
      p_action
    )
  );

  SELECT * INTO v_row
    FROM public.security_attempt_budgets
   WHERE actor_auth_user_id = p_actor_auth_user_id
     AND action = p_action
   FOR UPDATE;

  IF NOT FOUND
     OR v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now
  THEN
    INSERT INTO public.security_attempt_budgets(
      actor_auth_user_id,
      action,
      window_started_at,
      attempts
    )
    VALUES(
      p_actor_auth_user_id,
      p_action,
      v_now,
      1
    )
    ON CONFLICT(actor_auth_user_id, action)
    DO UPDATE SET
      window_started_at = EXCLUDED.window_started_at,
      attempts = 1;

    RETURN true;
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    RETURN false;
  END IF;

  UPDATE public.security_attempt_budgets
     SET attempts = attempts + 1
   WHERE actor_auth_user_id = p_actor_auth_user_id
     AND action = p_action;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_security_attempt(uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_security_attempt(uuid,text,integer,integer)
  TO service_role;

COMMIT;
