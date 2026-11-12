-- Execute ONLY against synthetic fixture, after SQL migrations 0014–0017.
DO $$
DECLARE
  room uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  member_a uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  member_b uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  device_a uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  device_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  actor uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  counter jsonb;
  succeeded boolean;
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id='meal-photos') IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'Bucket must be private'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.member_recovery_keys'::regclass)
    THEN RAISE EXCEPTION 'Recovery RLS missing'; END IF;
  IF has_table_privilege('authenticated','public.member_recovery_keys','SELECT')
    THEN RAISE EXCEPTION 'Recovery keys exposed'; END IF;
  IF has_table_privilege('authenticated','public.ai_usage_daily','SELECT')
    THEN RAISE EXCEPTION 'AI usage exposed'; END IF;
  IF has_function_privilege('authenticated','public.rotate_member_recovery(uuid,text,uuid)','EXECUTE')
    THEN RAISE EXCEPTION 'Device rotation exposed'; END IF;
  IF has_function_privilege('authenticated','public.room_activity_rollup(uuid,date)','EXECUTE')
    THEN RAISE EXCEPTION 'Room stats exposed'; END IF;
  IF has_function_privilege('authenticated','public.claim_ai_request(uuid,text,integer)','EXECUTE')
    THEN RAISE EXCEPTION 'AI quota claim exposed'; END IF;

  INSERT INTO public.rooms(id) VALUES(room);
  INSERT INTO public.members(id,room_id,participant_token_hash,daily_protein_target)
    VALUES(member_a,room,repeat('a',64),10),(member_b,room,repeat('b',64),10);
  INSERT INTO public.member_devices(id,member_id,auth_user_id)
    VALUES (device_a,member_a,actor),(device_b,member_a,'11111111-1111-4111-8111-111111111111');
  INSERT INTO public.member_recovery_keys(member_id,device_id,token_hash)
    VALUES(member_a,device_b,repeat('c',64));

  INSERT INTO public.meals(room_id,member_id,meal_date,meal_type,protein,is_planned)
    VALUES
      (room,member_a,'2026-11-13','dinner',20,false),
      (room,member_b,'2026-11-13','dinner',15,false),
      (room,member_a,'2026-11-13','lunch',500,true);
  SELECT public.room_activity_rollup(room,'2026-11-13') INTO counter;
  IF (counter->>'totalMeals')::int <> 2
    OR (counter->>'daysBoth')::int <> 1
    OR (counter->>'daysBothProtein')::int <> 1
    OR (counter->>'sharedDinners')::int <> 1
    OR (counter->>'streak')::int <> 1
    THEN RAISE EXCEPTION 'Incorrect rollup: %', counter; END IF;

  SELECT public.claim_ai_request(member_a,'scan',2) INTO succeeded;
  IF succeeded IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quota first request'; END IF;
  SELECT public.claim_ai_request(member_a,'scan',2) INTO succeeded;
  IF succeeded IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quota second request'; END IF;
  SELECT public.claim_ai_request(member_a,'scan',2) INTO succeeded;
  IF succeeded IS DISTINCT FROM false THEN RAISE EXCEPTION 'Quota exceeded'; END IF;

  SELECT public.rotate_member_recovery(actor,repeat('d',64),device_b) INTO succeeded;
  IF succeeded IS DISTINCT FROM true THEN RAISE EXCEPTION 'Rotation failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.member_devices WHERE id=device_b)
    THEN RAISE EXCEPTION 'Revoked device still mapped'; END IF;
  IF (SELECT participant_token_hash FROM public.members WHERE id=member_a) <> repeat('d',64)
    THEN RAISE EXCEPTION 'Legacy key not rotated'; END IF;
  IF (SELECT count(*) FROM public.member_recovery_keys WHERE member_id=member_a) <> 1
    THEN RAISE EXCEPTION 'Old recovery keys still valid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.member_recovery_keys WHERE member_id=member_a
      AND device_id=device_a AND token_hash=repeat('d',64))
    THEN RAISE EXCEPTION 'Active device key missing'; END IF;
END $$;

SELECT 'Migration SQL and behavior verified' AS result;
