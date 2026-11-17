-- Atomic scanner meal save + durable private-photo cleanup queue.
BEGIN;

ALTER TABLE public.scan_events
  ADD COLUMN IF NOT EXISTS meal_id uuid REFERENCES public.meals(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 80),
  object_path text NOT NULL CHECK (char_length(object_path) BETWEEN 1 AND 1000),
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
    INSERT INTO public.storage_cleanup_queue(bucket, object_path)
    VALUES('meal-photos', OLD.photo_url)
    ON CONFLICT(bucket, object_path) DO UPDATE
      SET cleaned_at = NULL;
  END IF;
  RETURN OLD;
END;
$;
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
