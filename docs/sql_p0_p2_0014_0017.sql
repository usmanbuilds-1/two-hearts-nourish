-- TWO HEARTS NOURISH — P0–P2 PRODUCTION MIGRATIONS
-- Prerequisite: 0013_device_recovery_keys.sql must already be applied.
-- Read docs/RELEASE_P0_P2.md BEFORE executing.
-- CAUTION: 0014 makes meal photos private. On the currently published old frontend,
-- photo previews will stop loading until the corresponding code is deployed.
-- All migrations are idempotent where possible; each has its own transaction.
-- DO NOT run this on the wrong Supabase project.

-- ──────────────────────── drizzle/migrations/0014_private_meal_photos.sql ────────────────────────
-- RELEASE GATE: run before deploying the private-image client.
-- Existing public URLs become inaccessible after this transaction.
-- The upgraded client signs both legacy URLs and new storage paths on demand.
BEGIN;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS photo_url text;
INSERT INTO storage.buckets (id,name,public)
  VALUES ('meal-photos','meal-photos',false)
  ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Public read meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Room members can read meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Room members can upload meal photos" ON storage.objects;

CREATE POLICY "Room members can read meal photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = public.my_room_id()::text
  );

CREATE POLICY "Room members can upload meal photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = public.my_room_id()::text
    AND storage.extension(name) = 'jpg'
  );
COMMIT;

-- ──────────────────────── drizzle/migrations/0015_device_security.sql ────────────────────────
-- Deploy before the device management UI. Existing sessions and data remain.
BEGIN;

ALTER TABLE public.member_devices
  ADD COLUMN IF NOT EXISTS device_label text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.member_recovery_keys
  ADD COLUMN IF NOT EXISTS device_id uuid
  REFERENCES public.member_devices(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS member_recovery_keys_device_idx
  ON public.member_recovery_keys(device_id);

-- Trusted server uses service_role, never a browser-accessible RPC.
-- Atomic rotation invalidates legacy and all device recovery keys.
-- Other existing device sessions remain mapped, but need new keys if their auth is lost.
CREATE OR REPLACE FUNCTION public.rotate_member_recovery(
  p_actor_auth_user_id uuid,
  p_replacement_hash text,
  p_revoke_device_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_device_id uuid;
  v_member_id uuid;
  v_target_device_id uuid;
BEGIN
  IF p_replacement_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_KEY_HASH';
  END IF;
  SELECT id, member_id INTO v_actor_device_id, v_member_id
    FROM public.member_devices
    WHERE auth_user_id = p_actor_auth_user_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;

  IF p_revoke_device_id IS NOT NULL THEN
    IF p_revoke_device_id = v_actor_device_id THEN
      RAISE EXCEPTION 'CANNOT_REVOKE_CURRENT_DEVICE';
    END IF;
    SELECT id INTO v_target_device_id
      FROM public.member_devices
      WHERE id = p_revoke_device_id AND member_id = v_member_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND'; END IF;
    DELETE FROM public.member_devices WHERE id = v_target_device_id;
  END IF;

  -- Revoke every previous capability, including legacy/unbound keys.
  DELETE FROM public.member_recovery_keys WHERE member_id = v_member_id;
  UPDATE public.members
    SET participant_token_hash = p_replacement_hash
    WHERE id = v_member_id;
  INSERT INTO public.member_recovery_keys (member_id, device_id, token_hash)
    VALUES (v_member_id, v_actor_device_id, p_replacement_hash);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_member_recovery(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_member_recovery(uuid,text,uuid)
  TO service_role;
COMMIT;

-- ──────────────────────── drizzle/migrations/0016_lifetime_couple_stats.sql ────────────────────────
-- Calculate lifetime couple metrics without sending the entire meal history to phones.
-- Only the authenticated server's service_role may call this RPC.
BEGIN;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS is_planned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS meals_planned_idx
  ON public.meals (member_id,meal_date,is_planned);
CREATE OR REPLACE FUNCTION public.room_activity_rollup(
  p_room_id uuid, p_today date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eaten AS (
    SELECT m.member_id, m.meal_date, m.meal_type, m.protein
    FROM public.meals m
    WHERE m.room_id = p_room_id AND m.is_planned = false
  ),
  per_member_day AS (
    SELECT e.meal_date, e.member_id, SUM(e.protein) AS protein,
           BOOL_OR(e.meal_type = 'dinner') AS had_dinner
    FROM eaten e GROUP BY e.meal_date, e.member_id
  ),
  per_day AS (
    SELECT d.meal_date,
           COUNT(*) AS participants,
           BOOL_AND(d.had_dinner) AS everyone_dinner,
           BOOL_AND(
             m.daily_protein_target IS NOT NULL
             AND m.daily_protein_target > 0
             AND d.protein >= m.daily_protein_target
           ) AS everyone_protein
    FROM per_member_day d
    JOIN public.members m ON m.id = d.member_id
    GROUP BY d.meal_date
  ),
  both_days AS (
    SELECT meal_date FROM per_day WHERE participants = 2
  ),
  start_day AS (
    SELECT CASE WHEN EXISTS (SELECT 1 FROM both_days WHERE meal_date = p_today)
      THEN p_today ELSE p_today - 1 END AS first_day
  ),
  numbered AS (
    SELECT meal_date,
      (ROW_NUMBER() OVER (ORDER BY meal_date DESC) - 1)::integer AS step
    FROM both_days WHERE meal_date <= (SELECT first_day FROM start_day)
  )
  SELECT jsonb_build_object(
    'totalMeals', (SELECT COUNT(*) FROM eaten),
    'daysActive', (SELECT COUNT(*) FROM per_day),
    'daysBoth', (SELECT COUNT(*) FROM both_days),
    'daysBothProtein', (SELECT COUNT(*) FROM per_day WHERE participants = 2 AND everyone_protein),
    'sharedDinners', (SELECT COUNT(*) FROM per_day WHERE participants = 2 AND everyone_dinner),
    'firstBothDay', (SELECT MIN(meal_date)::text FROM both_days),
    'streak', (SELECT COUNT(*) FROM numbered, start_day
       WHERE numbered.meal_date = start_day.first_day - numbered.step)
  );
$$;

REVOKE ALL ON FUNCTION public.room_activity_rollup(uuid,date)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_activity_rollup(uuid,date) TO service_role;
COMMIT;

-- ──────────────────────── drizzle/migrations/0017_ai_quotas.sql ────────────────────────
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

