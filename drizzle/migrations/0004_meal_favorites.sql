CREATE TABLE public.meal_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  food_name varchar NOT NULL,
  serving_description varchar,
  calories integer NOT NULL,
  protein numeric(6,1) NOT NULL,
  carbs numeric(6,1) NOT NULL,
  fat numeric(6,1) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT meal_favorites_member_food UNIQUE (member_id, food_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_favorites TO authenticated;
GRANT ALL ON public.meal_favorites TO service_role;
ALTER TABLE public.meal_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_favorites own member" ON public.meal_favorites FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.meal_favorites(member_id, created_at DESC);
