-- High-entropy partner invitations and atomic room create/join.
BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS invite_token_hash text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.create_room_with_owner(
  p_room_code text,
  p_auth_user_id uuid,
  p_display_name text,
  p_device_label text,
  p_participant_hash text,
  p_invite_hash text,
  p_invite_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_room_id uuid;
  v_member_id uuid;
BEGIN
  IF p_auth_user_id IS NULL
     OR p_room_code !~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'
     OR char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 40
     OR p_participant_hash !~ '^[a-f0-9]{64}$'
     OR p_invite_hash !~ '^[a-f0-9]{64}$'
     OR p_invite_expires_at <= now()
     OR p_invite_expires_at > now() + interval '7 days' THEN
    RAISE EXCEPTION 'INVALID_ROOM_CREATE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_devices WHERE auth_user_id=p_auth_user_id) THEN
    RAISE EXCEPTION 'ALREADY_IN_SPACE';
  END IF;

  INSERT INTO public.rooms(room_code, invite_token_hash, invite_expires_at)
  VALUES(p_room_code, p_invite_hash, p_invite_expires_at)
  RETURNING id INTO v_room_id;

  INSERT INTO public.members(
    room_id, seat, display_name, auth_user_id, participant_token_hash
  ) VALUES(
    v_room_id, 1, btrim(p_display_name), p_auth_user_id, p_participant_hash
  )
  RETURNING id INTO v_member_id;

  INSERT INTO public.member_devices(member_id, auth_user_id, device_label, last_seen_at)
  VALUES(v_member_id, p_auth_user_id, nullif(btrim(coalesce(p_device_label,'')),''), now());

  RETURN jsonb_build_object('room_id',v_room_id,'member_id',v_member_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_room_with_owner(text,uuid,text,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_with_owner(text,uuid,text,text,text,text,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.join_room_with_invite(
  p_room_code text,
  p_auth_user_id uuid,
  p_display_name text,
  p_device_label text,
  p_participant_hash text,
  p_invite_hash text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_member_id uuid;
  v_count integer;
BEGIN
  IF p_auth_user_id IS NULL
     OR p_room_code !~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'
     OR char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 40
     OR p_participant_hash !~ '^[a-f0-9]{64}$'
     OR p_invite_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_INVITE';
  END IF;

  IF EXISTS (SELECT 1 FROM public.member_devices WHERE auth_user_id=p_auth_user_id) THEN
    RAISE EXCEPTION 'ALREADY_IN_SPACE';
  END IF;

  SELECT * INTO v_room
    FROM public.rooms
    WHERE room_code=p_room_code
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;

  IF v_room.invite_token_hash IS NULL
     OR v_room.invite_expires_at IS NULL
     OR v_room.invite_expires_at <= now()
     OR v_room.invite_token_hash <> p_invite_hash THEN
    RAISE EXCEPTION 'INVALID_INVITE';
  END IF;

  SELECT count(*) INTO v_count FROM public.members WHERE room_id=v_room.id;
  IF v_count >= 2 THEN RAISE EXCEPTION 'ROOM_FULL'; END IF;

  INSERT INTO public.members(
    room_id, seat, display_name, auth_user_id, participant_token_hash
  ) VALUES(
    v_room.id, 2, btrim(p_display_name), p_auth_user_id, p_participant_hash
  )
  RETURNING id INTO v_member_id;

  INSERT INTO public.member_devices(member_id, auth_user_id, device_label, last_seen_at)
  VALUES(v_member_id, p_auth_user_id, nullif(btrim(coalesce(p_device_label,'')),''), now());

  UPDATE public.rooms
    SET invite_token_hash=NULL, invite_expires_at=NULL
    WHERE id=v_room.id;

  RETURN v_member_id;
END;
$$;
REVOKE ALL ON FUNCTION public.join_room_with_invite(text,uuid,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_with_invite(text,uuid,text,text,text,text)
  TO service_role;

COMMIT;
