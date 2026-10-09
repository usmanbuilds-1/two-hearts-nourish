CREATE TABLE public.progress_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  text varchar NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress_notes TO authenticated;
GRANT ALL ON public.progress_notes TO service_role;
ALTER TABLE public.progress_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_notes own member" ON public.progress_notes FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.progress_notes(member_id, note_date DESC);