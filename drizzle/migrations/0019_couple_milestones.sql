-- A small, private shared timeline of relationship dates. No health data, no public read.
-- The browser cannot query this table directly; authenticated app server functions
-- verify the caller's current member-device mapping and the room before every action.
BEGIN;

CREATE TABLE IF NOT EXISTS public.couple_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  title varchar(100) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  milestone_date date NOT NULL CHECK (milestone_date >= DATE '1900-01-01'
                                      AND milestone_date <= DATE '2100-12-31'),
  note varchar(500),
  repeats_annually boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS couple_milestones_room_date_idx
  ON public.couple_milestones(room_id,milestone_date DESC);

DROP TRIGGER IF EXISTS couple_milestones_touch ON public.couple_milestones;
CREATE TRIGGER couple_milestones_touch BEFORE UPDATE ON public.couple_milestones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.couple_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.couple_milestones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.couple_milestones TO service_role;

-- No RLS policies for web clients. All reads and writes are server-only,
-- through verified room membership, and service_role bypasses RLS.
COMMIT;
