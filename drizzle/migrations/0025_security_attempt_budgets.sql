-- App-level abuse throttles for invitation/recovery entry points.
BEGIN;

CREATE TABLE IF NOT EXISTS public.security_attempt_budgets (
  actor_auth_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('room_preview','partner_join','rejoin_link','recovery_key')),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY(actor_auth_user_id, action)
);
ALTER TABLE public.security_attempt_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_attempt_budgets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.security_attempt_budgets TO service_role;

CREATE OR REPLACE FUNCTION public.claim_security_attempt(
  p_actor_auth_user_id uuid,
  p_action text,
  p_window_seconds integer,
  p_max_attempts integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.security_attempt_budgets%ROWTYPE;
BEGIN
  IF p_actor_auth_user_id IS NULL
     OR p_action NOT IN ('room_preview','partner_join','rejoin_link','recovery_key')
     OR p_window_seconds < 10 OR p_window_seconds > 86400
     OR p_max_attempts < 1 OR p_max_attempts > 1000 THEN
    RAISE EXCEPTION 'INVALID_SECURITY_BUDGET';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('two-hearts-security:' || p_actor_auth_user_id::text || ':' || p_action));

  SELECT * INTO v_row
    FROM public.security_attempt_budgets
    WHERE actor_auth_user_id=p_actor_auth_user_id AND action=p_action
    FOR UPDATE;

  IF NOT FOUND OR v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN
    INSERT INTO public.security_attempt_budgets(actor_auth_user_id,action,window_started_at,attempts)
    VALUES(p_actor_auth_user_id,p_action,v_now,1)
    ON CONFLICT(actor_auth_user_id,action) DO UPDATE SET
      window_started_at=EXCLUDED.window_started_at,
      attempts=1;
    RETURN true;
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    RETURN false;
  END IF;

  UPDATE public.security_attempt_budgets
    SET attempts=attempts+1
    WHERE actor_auth_user_id=p_actor_auth_user_id AND action=p_action;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_security_attempt(uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_security_attempt(uuid,text,integer,integer)
  TO service_role;

-- Tighten existing identity helper search paths without changing behavior.
CREATE OR REPLACE FUNCTION public.my_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT member_id FROM public.member_devices
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_room_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.room_id
  FROM public.member_devices d
  JOIN public.members m ON m.id=d.member_id
  WHERE d.auth_user_id=auth.uid()
  LIMIT 1
$$;

COMMIT;
