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
