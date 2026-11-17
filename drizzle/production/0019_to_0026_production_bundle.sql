-- Two Hearts Nourish / Our Health Space
-- Production bundle: migrations 0019 through 0026
-- Generated from the tested branch chatgpt/security-scanner-v2-20261117
-- Run in Supabase SQL Editor as ONE script. Each migration has its own transaction.


-- ============================================================
-- drizzle/migrations/0019_scanner_v2_security.sql
-- ============================================================

-- Security + Scanner V2 foundation.
-- Additive migration only. Deploy before dependent application code.
BEGIN;

ALTER TABLE public.ai_usage_daily
  ADD COLUMN IF NOT EXISTS plan_requests integer NOT NULL DEFAULT 0 CHECK (plan_requests >= 0),
  ADD COLUMN IF NOT EXISTS strong_scan_requests integer NOT NULL DEFAULT 0 CHECK (strong_scan_requests >= 0);

CREATE TABLE IF NOT EXISTS public.ai_usage_global (
  usage_date date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'UTC')::date,
  scan_requests integer NOT NULL DEFAULT 0 CHECK (scan_requests >= 0),
  text_requests integer NOT NULL DEFAULT 0 CHECK (text_requests >= 0),
  plan_requests integer NOT NULL DEFAULT 0 CHECK (plan_requests >= 0),
  strong_scan_requests integer NOT NULL DEFAULT 0 CHECK (strong_scan_requests >= 0)
);
ALTER TABLE public.ai_usage_global ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_global FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage_global TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_request_v2(
  p_member_id uuid,
  p_mode text,
  p_member_daily_cap integer,
  p_global_daily_cap integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'UTC')::date;
  v_member_count integer := 0;
  v_global_count integer := 0;
BEGIN
  IF p_member_id IS NULL
     OR p_member_daily_cap < 1 OR p_member_daily_cap > 500
     OR p_global_daily_cap < 1 OR p_global_daily_cap > 100000
     OR p_mode NOT IN ('scan','text','plan','strong_scan') THEN
    RAISE EXCEPTION 'INVALID_AI_QUOTA_REQUEST';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  -- Serialize quota decisions by UTC day + mode so separate server instances cannot race.
  PERFORM pg_advisory_xact_lock(hashtext('two-hearts-ai:' || v_date::text || ':' || p_mode));

  INSERT INTO public.ai_usage_daily(member_id, usage_date)
  VALUES (p_member_id, v_date)
  ON CONFLICT (member_id, usage_date) DO NOTHING;

  INSERT INTO public.ai_usage_global(usage_date)
  VALUES (v_date)
  ON CONFLICT (usage_date) DO NOTHING;

  SELECT CASE p_mode
    WHEN 'scan' THEN scan_requests
    WHEN 'text' THEN text_requests
    WHEN 'plan' THEN plan_requests
    WHEN 'strong_scan' THEN strong_scan_requests
  END
  INTO v_member_count
  FROM public.ai_usage_daily
  WHERE member_id = p_member_id AND usage_date = v_date
  FOR UPDATE;

  SELECT CASE p_mode
    WHEN 'scan' THEN scan_requests
    WHEN 'text' THEN text_requests
    WHEN 'plan' THEN plan_requests
    WHEN 'strong_scan' THEN strong_scan_requests
  END
  INTO v_global_count
  FROM public.ai_usage_global
  WHERE usage_date = v_date
  FOR UPDATE;

  IF v_member_count >= p_member_daily_cap OR v_global_count >= p_global_daily_cap THEN
    RETURN false;
  END IF;

  UPDATE public.ai_usage_daily SET
    scan_requests = scan_requests + CASE WHEN p_mode='scan' THEN 1 ELSE 0 END,
    text_requests = text_requests + CASE WHEN p_mode='text' THEN 1 ELSE 0 END,
    plan_requests = plan_requests + CASE WHEN p_mode='plan' THEN 1 ELSE 0 END,
    strong_scan_requests = strong_scan_requests + CASE WHEN p_mode='strong_scan' THEN 1 ELSE 0 END
  WHERE member_id = p_member_id AND usage_date = v_date;

  UPDATE public.ai_usage_global SET
    scan_requests = scan_requests + CASE WHEN p_mode='scan' THEN 1 ELSE 0 END,
    text_requests = text_requests + CASE WHEN p_mode='text' THEN 1 ELSE 0 END,
    plan_requests = plan_requests + CASE WHEN p_mode='plan' THEN 1 ELSE 0 END,
    strong_scan_requests = strong_scan_requests + CASE WHEN p_mode='strong_scan' THEN 1 ELSE 0 END
  WHERE usage_date = v_date;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ai_request_v2(uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_request_v2(uuid,text,integer,integer)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  scanner_version text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  route text NOT NULL CHECK (route IN ('vision','barcode','label','cache','context','manual')),
  status text NOT NULL CHECK (status IN ('started','succeeded','failed')),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  thinking_tokens integer NOT NULL DEFAULT 0 CHECK (thinking_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  estimated_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  cache_hit boolean NOT NULL DEFAULT false,
  escalated boolean NOT NULL DEFAULT false,
  escalation_reason text,
  grounding_sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(grounding_sources) = 'array'),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_events_member_created_idx
  ON public.scan_events(member_id, created_at DESC);
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scan_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scan_events TO service_role;

CREATE TABLE IF NOT EXISTS public.scan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_events(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  item_index integer NOT NULL CHECK (item_index >= 0 AND item_index <= 50),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  grams_estimate numeric CHECK (grams_estimate IS NULL OR (grams_estimate >= 0 AND grams_estimate <= 10000)),
  grams_min numeric CHECK (grams_min IS NULL OR (grams_min >= 0 AND grams_min <= 10000)),
  grams_max numeric CHECK (grams_max IS NULL OR (grams_max >= 0 AND grams_max <= 10000)),
  calories numeric CHECK (calories IS NULL OR (calories >= 0 AND calories <= 20000)),
  protein numeric CHECK (protein IS NULL OR (protein >= 0 AND protein <= 2000)),
  carbs numeric CHECK (carbs IS NULL OR (carbs >= 0 AND carbs <= 2000)),
  fat numeric CHECK (fat IS NULL OR (fat >= 0 AND fat <= 2000)),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  hidden_fat_risk text CHECK (hidden_fat_risk IS NULL OR hidden_fat_risk IN ('low','medium','high')),
  source_name text,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scan_id, item_index)
);
CREATE INDEX IF NOT EXISTS scan_items_member_idx ON public.scan_items(member_id, created_at DESC);
ALTER TABLE public.scan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scan_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scan_items TO service_role;

CREATE TABLE IF NOT EXISTS public.scan_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_events(id) ON DELETE CASCADE,
  scan_item_id uuid REFERENCES public.scan_items(id) ON DELETE SET NULL,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  correction_type text NOT NULL CHECK (correction_type IN (
    'identity','portion','nutrition','remove','add','package','context','hidden_fat'
  )),
  original jsonb NOT NULL,
  corrected jsonb NOT NULL,
  structured_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(structured_context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_corrections_member_created_idx
  ON public.scan_corrections(member_id, created_at DESC);
ALTER TABLE public.scan_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scan_corrections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scan_corrections TO service_role;

CREATE TABLE IF NOT EXISTS public.member_food_priors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 8 AND 200),
  canonical_label text NOT NULL CHECK (char_length(canonical_label) BETWEEN 1 AND 160),
  typical_grams numeric CHECK (typical_grams IS NULL OR (typical_grams >= 0 AND typical_grams <= 10000)),
  calories_per_100g numeric CHECK (calories_per_100g IS NULL OR (calories_per_100g >= 0 AND calories_per_100g <= 2000)),
  protein_per_100g numeric CHECK (protein_per_100g IS NULL OR (protein_per_100g >= 0 AND protein_per_100g <= 100)),
  carbs_per_100g numeric CHECK (carbs_per_100g IS NULL OR (carbs_per_100g >= 0 AND carbs_per_100g <= 100)),
  fat_per_100g numeric CHECK (fat_per_100g IS NULL OR (fat_per_100g >= 0 AND fat_per_100g <= 100)),
  preparation text,
  structured_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(structured_context) = 'object'),
  confirmations integer NOT NULL DEFAULT 1 CHECK (confirmations >= 1),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS member_food_priors_member_recent_idx
  ON public.member_food_priors(member_id, last_confirmed_at DESC);
ALTER TABLE public.member_food_priors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_food_priors FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_food_priors TO service_role;

CREATE TABLE IF NOT EXISTS public.meal_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0 AND position <= 50),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  grams numeric CHECK (grams IS NULL OR (grams >= 0 AND grams <= 10000)),
  calories numeric NOT NULL CHECK (calories >= 0 AND calories <= 20000),
  protein numeric NOT NULL CHECK (protein >= 0 AND protein <= 2000),
  carbs numeric NOT NULL CHECK (carbs >= 0 AND carbs <= 2000),
  fat numeric NOT NULL CHECK (fat >= 0 AND fat <= 2000),
  source_name text,
  source_ref text,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meal_id, position)
);
CREATE INDEX IF NOT EXISTS meal_components_meal_idx ON public.meal_components(meal_id, position);
ALTER TABLE public.meal_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meal_components FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.meal_components TO service_role;

CREATE TABLE IF NOT EXISTS public.food_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL,
  normalized_alias text NOT NULL UNIQUE,
  canonical_label text NOT NULL,
  cuisine text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.food_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_aliases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.food_aliases TO service_role;

INSERT INTO public.food_aliases(alias, normalized_alias, canonical_label, cuisine, metadata) VALUES
  ('dal','dal','Daal','south_asian','{}'),
  ('daal','daal','Daal','south_asian','{}'),
  ('dhal','dhal','Daal','south_asian','{}'),
  ('roti','roti','Roti','south_asian','{}'),
  ('chapati','chapati','Roti','south_asian','{}'),
  ('phulka','phulka','Roti','south_asian','{}'),
  ('dahi','dahi','Yogurt','south_asian','{}'),
  ('yoghurt','yoghurt','Yogurt',NULL,'{}'),
  ('doodh patti','doodh-patti','Milk tea','south_asian','{"hidden_fat_risk":"low"}'),
  ('chai','chai','Milk tea','south_asian','{}'),
  ('kadai chicken','kadai-chicken','Chicken karahi','south_asian','{"hidden_fat_risk":"high"}'),
  ('karahi chicken','karahi-chicken','Chicken karahi','south_asian','{"hidden_fat_risk":"high"}'),
  ('pulao','pulao','Pulao','south_asian','{"hidden_fat_risk":"medium"}'),
  ('pilaf','pilaf','Pulao',NULL,'{}'),
  ('nihari','nihari','Nihari','south_asian','{"hidden_fat_risk":"high"}'),
  ('biryani','biryani','Biryani','south_asian','{"hidden_fat_risk":"high"}')
ON CONFLICT (normalized_alias) DO UPDATE SET
  canonical_label = EXCLUDED.canonical_label,
  cuisine = EXCLUDED.cuisine,
  metadata = EXCLUDED.metadata;

COMMIT;


-- ============================================================
-- drizzle/migrations/0020_scanner_atomic_meals.sql
-- ============================================================

-- Atomic scanner meal save + durable private-photo cleanup queue.
BEGIN;

ALTER TABLE public.scan_events
  ADD COLUMN IF NOT EXISTS meal_id uuid REFERENCES public.meals(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 80),
  object_path text NOT NULL CHECK (char_length(object_path) BETWEEN 1 AND 1000),
  member_id uuid NOT NULL,
  room_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  cleaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket, object_path)
);
ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.storage_cleanup_queue TO service_role;

CREATE OR REPLACE FUNCTION public.queue_deleted_meal_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.photo_url IS NOT NULL AND btrim(OLD.photo_url) <> '' THEN
    INSERT INTO public.storage_cleanup_queue(bucket, object_path, member_id, room_id)
    VALUES('meal-photos', OLD.photo_url, OLD.member_id, OLD.room_id)
    ON CONFLICT(bucket, object_path) DO UPDATE
      SET member_id = EXCLUDED.member_id,
          room_id = EXCLUDED.room_id,
          cleaned_at = NULL;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_deleted_meal_photo()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_deleted_meal_photo()
  TO service_role;

DROP TRIGGER IF EXISTS meals_queue_photo_cleanup ON public.meals;
CREATE TRIGGER meals_queue_photo_cleanup
BEFORE DELETE ON public.meals
FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_meal_photo();

CREATE OR REPLACE FUNCTION public.save_scanned_meal_v2(
  p_member_id uuid,
  p_room_id uuid,
  p_meal_date date,
  p_meal_type text,
  p_food_name text,
  p_serving_description text,
  p_calories integer,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric,
  p_ai_confidence text,
  p_photo_url text,
  p_components jsonb,
  p_scan_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_meal_id uuid;
  v_component jsonb;
  v_position integer := 0;
BEGIN
  IF p_member_id IS NULL OR p_room_id IS NULL
     OR p_meal_date IS NULL
     OR p_meal_type NOT IN ('breakfast','lunch','snack','dinner')
     OR char_length(btrim(p_food_name)) NOT BETWEEN 1 AND 200
     OR p_calories NOT BETWEEN 0 AND 20000
     OR p_protein NOT BETWEEN 0 AND 2000
     OR p_carbs NOT BETWEEN 0 AND 2000
     OR p_fat NOT BETWEEN 0 AND 2000
     OR p_ai_confidence IS NOT NULL AND p_ai_confidence NOT IN ('low','medium','high')
     OR p_components IS NULL OR jsonb_typeof(p_components) <> 'array'
     OR jsonb_array_length(p_components) > 20 THEN
    RAISE EXCEPTION 'INVALID_SCANNED_MEAL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members WHERE id=p_member_id AND room_id=p_room_id
  ) THEN
    RAISE EXCEPTION 'MEMBER_ROOM_MISMATCH';
  END IF;

  IF p_scan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.scan_events WHERE id=p_scan_id AND member_id=p_member_id
  ) THEN
    RAISE EXCEPTION 'SCAN_NOT_OWNED';
  END IF;

  INSERT INTO public.meals(
    room_id, member_id, food_name, calories, protein, carbs, fat,
    serving_description, ai_confidence, meal_type, meal_date, photo_url
  ) VALUES (
    p_room_id, p_member_id, btrim(p_food_name), p_calories, p_protein, p_carbs, p_fat,
    nullif(btrim(coalesce(p_serving_description,'')),''), p_ai_confidence,
    p_meal_type, p_meal_date, nullif(btrim(coalesce(p_photo_url,'')),'')
  )
  RETURNING id INTO v_meal_id;

  FOR v_component IN SELECT value FROM jsonb_array_elements(p_components)
  LOOP
    IF jsonb_typeof(v_component) <> 'object'
       OR char_length(btrim(coalesce(v_component->>'label',''))) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'INVALID_SCAN_COMPONENT';
    END IF;

    INSERT INTO public.meal_components(
      meal_id, member_id, position, label, grams, calories, protein, carbs, fat,
      source_name, source_ref, confidence
    ) VALUES (
      v_meal_id,
      p_member_id,
      v_position,
      btrim(v_component->>'label'),
      CASE WHEN v_component ? 'grams' AND (v_component->>'grams') <> ''
        THEN (v_component->>'grams')::numeric ELSE NULL END,
      coalesce((v_component->>'calories')::numeric,0),
      coalesce((v_component->>'protein')::numeric,0),
      coalesce((v_component->>'carbs')::numeric,0),
      coalesce((v_component->>'fat')::numeric,0),
      nullif(v_component->>'source_name',''),
      nullif(v_component->>'source_ref',''),
      CASE WHEN v_component ? 'confidence' AND (v_component->>'confidence') <> ''
        THEN (v_component->>'confidence')::numeric ELSE NULL END
    );
    v_position := v_position + 1;
  END LOOP;

  IF p_scan_id IS NOT NULL THEN
    UPDATE public.scan_events
      SET meal_id = v_meal_id
      WHERE id = p_scan_id AND member_id = p_member_id;
  END IF;

  RETURN v_meal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_scanned_meal_v2(uuid,uuid,date,text,text,text,integer,numeric,numeric,numeric,text,text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_scanned_meal_v2(uuid,uuid,date,text,text,text,integer,numeric,numeric,numeric,text,text,jsonb,uuid)
  TO service_role;

COMMIT;


-- ============================================================
-- drizzle/migrations/0021_secure_partner_invites.sql
-- ============================================================

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


-- ============================================================
-- drizzle/migrations/0022_atomic_rejoin.sql
-- ============================================================

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


-- ============================================================
-- drizzle/migrations/0023_food_prior_memory.sql
-- ============================================================

-- Safe member-specific correction memory update.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_member_food_prior(
  p_member_id uuid,
  p_fingerprint text,
  p_canonical_label text,
  p_typical_grams numeric,
  p_calories_per_100g numeric,
  p_protein_per_100g numeric,
  p_carbs_per_100g numeric,
  p_fat_per_100g numeric,
  p_structured_context jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_member_id IS NULL
     OR char_length(p_fingerprint) NOT BETWEEN 8 AND 200
     OR char_length(btrim(p_canonical_label)) NOT BETWEEN 1 AND 160
     OR p_typical_grams IS NULL OR p_typical_grams <= 0 OR p_typical_grams > 10000
     OR p_calories_per_100g < 0 OR p_calories_per_100g > 2000
     OR p_protein_per_100g < 0 OR p_protein_per_100g > 100
     OR p_carbs_per_100g < 0 OR p_carbs_per_100g > 100
     OR p_fat_per_100g < 0 OR p_fat_per_100g > 100
     OR p_structured_context IS NULL OR jsonb_typeof(p_structured_context) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FOOD_PRIOR';
  END IF;

  INSERT INTO public.member_food_priors(
    member_id,fingerprint,canonical_label,typical_grams,
    calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,
    structured_context,confirmations,confidence,last_confirmed_at
  ) VALUES(
    p_member_id,p_fingerprint,btrim(p_canonical_label),p_typical_grams,
    p_calories_per_100g,p_protein_per_100g,p_carbs_per_100g,p_fat_per_100g,
    p_structured_context,1,0.60,now()
  )
  ON CONFLICT(member_id,fingerprint) DO UPDATE SET
    canonical_label=EXCLUDED.canonical_label,
    -- EMA favors newer confirmed behavior while preserving history.
    typical_grams=round((public.member_food_priors.typical_grams*0.70 + EXCLUDED.typical_grams*0.30)::numeric,1),
    calories_per_100g=round((public.member_food_priors.calories_per_100g*0.70 + EXCLUDED.calories_per_100g*0.30)::numeric,1),
    protein_per_100g=round((public.member_food_priors.protein_per_100g*0.70 + EXCLUDED.protein_per_100g*0.30)::numeric,1),
    carbs_per_100g=round((public.member_food_priors.carbs_per_100g*0.70 + EXCLUDED.carbs_per_100g*0.30)::numeric,1),
    fat_per_100g=round((public.member_food_priors.fat_per_100g*0.70 + EXCLUDED.fat_per_100g*0.30)::numeric,1),
    structured_context=EXCLUDED.structured_context,
    confirmations=public.member_food_priors.confirmations+1,
    confidence=least(0.95,public.member_food_priors.confidence+0.05),
    last_confirmed_at=now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_member_food_prior(uuid,text,text,numeric,numeric,numeric,numeric,numeric,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_member_food_prior(uuid,text,text,numeric,numeric,numeric,numeric,numeric,jsonb)
  TO service_role;

COMMIT;


-- ============================================================
-- drizzle/migrations/0024_private_scan_cache.sql
-- ============================================================

-- Private repeat-scan cache. No raw photos or raw context are stored.
BEGIN;

ALTER TABLE public.scan_events
  ADD COLUMN IF NOT EXISTS image_fingerprint text,
  ADD COLUMN IF NOT EXISTS context_fingerprint text;

CREATE TABLE IF NOT EXISTS public.member_scan_cache (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  image_fingerprint text NOT NULL CHECK (image_fingerprint ~ '^[a-f0-9]{16}$'),
  context_fingerprint text NOT NULL DEFAULT '' CHECK (context_fingerprint = '' OR context_fingerprint ~ '^[a-f0-9]{64}$'),
  scanner_version text NOT NULL,
  final_estimate jsonb NOT NULL CHECK (jsonb_typeof(final_estimate) = 'object'),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(member_id,image_fingerprint,context_fingerprint,scanner_version)
);
CREATE INDEX IF NOT EXISTS member_scan_cache_recent_idx
  ON public.member_scan_cache(member_id,updated_at DESC);
ALTER TABLE public.member_scan_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_scan_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_scan_cache TO service_role;

COMMIT;


-- ============================================================
-- drizzle/migrations/0025_security_attempt_budgets.sql
-- ============================================================

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


-- ============================================================
-- drizzle/migrations/0026_scanner_evidence.sql
-- ============================================================

-- Scanner evidence metadata for explainable confidence.
BEGIN;

ALTER TABLE public.scan_events
  ADD COLUMN IF NOT EXISTS image_quality text
    CHECK (image_quality IS NULL OR image_quality IN ('poor','fair','good'));

ALTER TABLE public.scan_items
  ADD COLUMN IF NOT EXISTS scale_evidence text
    CHECK (scale_evidence IS NULL OR char_length(scale_evidence) <= 160),
  ADD COLUMN IF NOT EXISTS occlusion_risk text
    CHECK (occlusion_risk IS NULL OR occlusion_risk IN ('low','medium','high'));

COMMIT;

