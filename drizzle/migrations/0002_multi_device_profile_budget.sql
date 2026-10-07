CREATE TABLE public.member_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.member_devices TO authenticated;
GRANT ALL ON public.member_devices TO service_role;
ALTER TABLE public.member_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices read own" ON public.member_devices FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE INDEX ON public.member_devices(member_id);

INSERT INTO public.member_devices(member_id, auth_user_id)
SELECT id, auth_user_id FROM public.members WHERE auth_user_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.my_member_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT member_id FROM public.member_devices WHERE auth_user_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.my_room_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.room_id FROM public.member_devices d JOIN public.members m ON m.id = d.member_id WHERE d.auth_user_id = auth.uid() LIMIT 1
$$;

DROP POLICY IF EXISTS "members update self" ON public.members;
CREATE POLICY "members update self" ON public.members FOR UPDATE TO authenticated USING (id = my_member_id()) WITH CHECK (id = my_member_id());

ALTER TABLE public.members
  ADD COLUMN height_cm numeric, ADD COLUMN weight_kg numeric, ADD COLUMN age smallint,
  ADD COLUMN sex text CHECK (sex IN ('male','female')),
  ADD COLUMN activity_level text CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  ADD COLUMN body_goal text CHECK (body_goal IN ('lose','maintain','gain')),
  ADD COLUMN daily_food_budget numeric, ADD COLUMN currency text, ADD COLUMN locality text,
  ADD COLUMN link_code_hash text, ADD COLUMN link_code_expires_at timestamptz;
GRANT SELECT (height_cm, weight_kg, age, sex, activity_level, body_goal, daily_food_budget, currency, locality),
      UPDATE (height_cm, weight_kg, age, sex, activity_level, body_goal, daily_food_budget, currency, locality)
  ON public.members TO authenticated;