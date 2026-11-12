-- Remove selected obsolete sign-ins atomically while rotating ALL recovery capabilities.
-- Run before deploying the updated Device Center. Never auto-delete unknown devices.
BEGIN;
CREATE OR REPLACE FUNCTION public.rotate_member_recovery_many(
  p_actor_auth_user_id uuid,
  p_replacement_hash text,
  p_revoke_device_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id uuid;
  v_actor_device_id uuid;
  v_targets integer;
  v_removed integer;
BEGIN
  IF p_replacement_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_KEY_HASH';
  END IF;
  IF p_revoke_device_ids IS NULL OR cardinality(p_revoke_device_ids) < 1
       OR cardinality(p_revoke_device_ids) > 50
       OR cardinality(p_revoke_device_ids) <> (
         SELECT count(DISTINCT id) FROM unnest(p_revoke_device_ids) AS ids(id)
       ) THEN
    RAISE EXCEPTION 'INVALID_DEVICE_SELECTION';
  END IF;
  SELECT id,member_id INTO v_actor_device_id,v_member_id
    FROM public.member_devices
    WHERE auth_user_id=p_actor_auth_user_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF v_actor_device_id=ANY(p_revoke_device_ids) THEN
    RAISE EXCEPTION 'CANNOT_REVOKE_CURRENT_DEVICE';
  END IF;

  SELECT count(*) INTO v_targets FROM public.member_devices
    WHERE member_id=v_member_id AND id=ANY(p_revoke_device_ids);
  IF v_targets <> cardinality(p_revoke_device_ids) THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND_OR_NOT_OWNED';
  END IF;
  DELETE FROM public.member_devices
    WHERE member_id=v_member_id AND id=ANY(p_revoke_device_ids);
  GET DIAGNOSTICS v_removed=ROW_COUNT;

  DELETE FROM public.member_recovery_keys WHERE member_id=v_member_id;
  UPDATE public.members
    SET participant_token_hash=p_replacement_hash WHERE id=v_member_id;
  INSERT INTO public.member_recovery_keys(member_id,device_id,token_hash)
    VALUES(v_member_id,v_actor_device_id,p_replacement_hash);
  RETURN v_removed;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_member_recovery_many(uuid,text,uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_member_recovery_many(uuid,text,uuid[])
  TO service_role;
COMMIT;
