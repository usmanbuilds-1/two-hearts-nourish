-- 0031: additive server-only helpers. Apply before deploying the callers.
-- Existing browser sessions, room bindings, recovery keys and meal data remain intact.
BEGIN;

CREATE OR REPLACE FUNCTION public.log_member_weight_atomic(
  p_actor_auth_user_id uuid,
  p_log_date date,
  p_weight_kg numeric
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_member_id uuid;
  v_utc_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_actor_auth_user_id IS NULL OR p_log_date IS NULL
     OR p_weight_kg IS NULL OR p_weight_kg < 20 OR p_weight_kg > 400
     OR p_log_date < v_utc_today - 1 OR p_log_date > v_utc_today + 1
  THEN RAISE EXCEPTION 'INVALID_WEIGHT_LOG'; END IF;

  SELECT member_id INTO v_member_id FROM public.member_devices
    WHERE auth_user_id = p_actor_auth_user_id;
  IF v_member_id IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;

  -- Serialize simultaneous weights against the member row. If an older date
  -- is ever entered, the profile must retain the latest-dated measurement.
  PERFORM 1 FROM public.members WHERE id = v_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;

  INSERT INTO public.weight_logs(member_id, logged_date, weight_kg)
  VALUES(v_member_id, p_log_date, p_weight_kg)
  ON CONFLICT(member_id, logged_date) DO UPDATE SET
    weight_kg = EXCLUDED.weight_kg;

  UPDATE public.members
     SET weight_kg = (
       SELECT w.weight_kg FROM public.weight_logs w
       WHERE w.member_id = v_member_id
       ORDER BY w.logged_date DESC LIMIT 1
     )
   WHERE id = v_member_id;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_member_weight_atomic(uuid,date,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_member_weight_atomic(uuid,date,numeric)
  TO service_role;

-- Check ownership of an existing uploaded object before a service-role
-- endpoint attaches its path. Room membership alone is not upload ownership.
CREATE OR REPLACE FUNCTION public.photo_uploaded_by_device(
  p_actor_auth_user_id uuid,
  p_photo_path text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    JOIN public.member_devices AS device
      ON device.auth_user_id = p_actor_auth_user_id
    JOIN public.members AS member
      ON member.id = device.member_id
    WHERE object.bucket_id = 'meal-photos'
      AND object.name = p_photo_path
      AND object.owner_id = p_actor_auth_user_id::text
      AND p_photo_path LIKE member.room_id::text || '/%'
  )
$fn$;

REVOKE ALL ON FUNCTION public.photo_uploaded_by_device(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photo_uploaded_by_device(uuid,text)
  TO service_role;

COMMIT;
