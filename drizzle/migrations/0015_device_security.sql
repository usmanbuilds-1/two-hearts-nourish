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
