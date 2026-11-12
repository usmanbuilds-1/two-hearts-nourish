-- Atomically cap third-party AI requests per member each UTC calendar day.
-- Failed attempts consume a slot to stop automated retry abuse.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  scan_requests integer NOT NULL DEFAULT 0 CHECK (scan_requests >= 0),
  text_requests integer NOT NULL DEFAULT 0 CHECK (text_requests >= 0),
  PRIMARY KEY(member_id, usage_date)
);
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_request(
  p_member_id uuid,
  p_mode text,
  p_daily_cap integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF p_daily_cap < 1 OR p_daily_cap > 100 OR p_mode NOT IN ('scan','text') THEN
    RAISE EXCEPTION 'INVALID_AI_QUOTA_REQUEST';
  END IF;
  INSERT INTO public.ai_usage_daily(member_id,usage_date,scan_requests,text_requests)
  VALUES(p_member_id,(now() AT TIME ZONE 'UTC')::date,
      CASE WHEN p_mode='scan' THEN 1 ELSE 0 END,
      CASE WHEN p_mode='text' THEN 1 ELSE 0 END)
  ON CONFLICT(member_id,usage_date) DO UPDATE SET
    scan_requests = public.ai_usage_daily.scan_requests
      + CASE WHEN p_mode='scan' THEN 1 ELSE 0 END,
    text_requests = public.ai_usage_daily.text_requests
      + CASE WHEN p_mode='text' THEN 1 ELSE 0 END
  WHERE (
     p_mode='scan' AND public.ai_usage_daily.scan_requests < p_daily_cap
  ) OR (
     p_mode='text' AND public.ai_usage_daily.text_requests < p_daily_cap
  )
  RETURNING 1 INTO v_count;
  RETURN v_count IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ai_request(uuid,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_request(uuid,text,integer)
  TO service_role;
COMMIT;
