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
