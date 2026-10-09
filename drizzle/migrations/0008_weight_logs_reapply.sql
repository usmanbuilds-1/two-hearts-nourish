CREATE TABLE public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  logged_date date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric(5,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weight_logs_member_date UNIQUE (member_id, logged_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;
GRANT ALL ON public.weight_logs TO service_role;
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight logs own member" ON public.weight_logs FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.weight_logs(member_id, logged_date DESC);