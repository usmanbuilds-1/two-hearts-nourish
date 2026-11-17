-- Atomically consume one-use rejoin link and bind the receiving device.
BEGIN;

CREATE OR REPLACE FUNCTION public.consume_rejoin_link(
  p_member_id uuid,
  p_claim_hash text,
  p_auth_user_id uuid,
  p_device_label text,
  p_new_recovery_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.members%ROWTYPE;
  v_existing_member uuid;
  v_device_id uuid;
BEGIN
  IF p_member_id IS NULL OR p_auth_user_id IS NULL
     OR p_claim_hash !~ '^[a-f0-9]{64}$'
     OR p_new_recovery_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_LINK';
  END IF;

  SELECT * INTO v_member
    FROM public.members
    WHERE id=p_member_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LINK'; END IF;

  IF v_member.link_code_hash IS NULL
     OR v_member.link_code_expires_at IS NULL
     OR v_member.link_code_expires_at <= now()
     OR v_member.link_code_hash <> p_claim_hash THEN
    RAISE EXCEPTION 'INVALID_LINK';
  END IF;

  SELECT member_id, id INTO v_existing_member, v_device_id
    FROM public.member_devices
    WHERE auth_user_id=p_auth_user_id
    FOR UPDATE;

  IF FOUND AND v_existing_member <> p_member_id THEN
    RAISE EXCEPTION 'ALREADY_IN_SPACE';
  END IF;

  IF v_device_id IS NULL THEN
    INSERT INTO public.member_devices(member_id,auth_user_id,device_label,last_seen_at)
    VALUES(p_member_id,p_auth_user_id,nullif(btrim(coalesce(p_device_label,'')),''),now())
    RETURNING id INTO v_device_id;
  ELSE
    UPDATE public.member_devices
      SET last_seen_at=now(),
          device_label=coalesce(nullif(btrim(coalesce(p_device_label,'')),''),device_label)
      WHERE id=v_device_id;
  END IF;

  UPDATE public.members
    SET link_code_hash=NULL, link_code_expires_at=NULL
    WHERE id=p_member_id;

  DELETE FROM public.member_recovery_keys WHERE device_id=v_device_id;
  INSERT INTO public.member_recovery_keys(member_id,device_id,token_hash)
    VALUES(p_member_id,v_device_id,p_new_recovery_hash);

  RETURN jsonb_build_object('member_id',p_member_id,'device_id',v_device_id);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rejoin_link(uuid,text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rejoin_link(uuid,text,uuid,text,text)
  TO service_role;

COMMIT;
