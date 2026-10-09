CREATE TABLE public.meal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  meals jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_templates TO authenticated;
GRANT ALL ON public.meal_templates TO service_role;
ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_templates own member" ON public.meal_templates FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.meal_templates(member_id, created_at DESC);