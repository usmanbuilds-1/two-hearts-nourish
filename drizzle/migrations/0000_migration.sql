CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  shared_goal TEXT,
  couple_message TEXT,
  together_since DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  auth_user_id UUID UNIQUE,
  seat SMALLINT NOT NULL CHECK (seat IN (1,2)),
  display_name TEXT NOT NULL,
  participant_token_hash TEXT NOT NULL,
  daily_calorie_target INTEGER,
  daily_protein_target NUMERIC,
  daily_carbs_target NUMERIC,
  daily_fat_target NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, seat)
);
CREATE INDEX members_room_id_idx ON public.members(room_id);

CREATE TABLE public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL CHECK (char_length(food_name) BETWEEN 1 AND 200),
  calories INTEGER NOT NULL CHECK (calories BETWEEN 0 AND 20000),
  protein NUMERIC NOT NULL CHECK (protein BETWEEN 0 AND 2000),
  carbs NUMERIC NOT NULL CHECK (carbs BETWEEN 0 AND 2000),
  fat NUMERIC NOT NULL CHECK (fat BETWEEN 0 AND 2000),
  serving_description TEXT,
  ai_confidence TEXT CHECK (ai_confidence IS NULL OR ai_confidence IN ('low','medium','high')),
  meal_type TEXT NOT NULL DEFAULT 'snack' CHECK (meal_type IN ('breakfast','lunch','snack','dinner')),
  meal_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meals_room_id_idx ON public.meals(room_id);
CREATE INDEX meals_member_id_idx ON public.meals(member_id);
CREATE INDEX meals_meal_date_idx ON public.meals(meal_date);
CREATE INDEX meals_created_at_idx ON public.meals(created_at);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER meals_touch BEFORE UPDATE ON public.meals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.my_room_id() RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT room_id FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.my_member_id() RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Prevent members changing room/seat/token/auth binding from the client
CREATE OR REPLACE FUNCTION public.guard_member_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    NEW.room_id := OLD.room_id; NEW.seat := OLD.seat;
    NEW.participant_token_hash := OLD.participant_token_hash;
    NEW.auth_user_id := OLD.auth_user_id; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER members_guard BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.guard_member_update();

CREATE OR REPLACE FUNCTION public.guard_meal_write() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.room_id := OLD.room_id; NEW.member_id := OLD.member_id; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meals_guard BEFORE UPDATE ON public.meals FOR EACH ROW EXECUTE FUNCTION public.guard_meal_write();

GRANT SELECT, UPDATE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT SELECT, UPDATE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
GRANT ALL ON public.meals TO service_role;
REVOKE SELECT (participant_token_hash) ON public.members FROM authenticated;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room read own" ON public.rooms FOR SELECT TO authenticated USING (id = public.my_room_id());
CREATE POLICY "room update own" ON public.rooms FOR UPDATE TO authenticated USING (id = public.my_room_id()) WITH CHECK (id = public.my_room_id());

CREATE POLICY "members read room" ON public.members FOR SELECT TO authenticated USING (room_id = public.my_room_id());
CREATE POLICY "members update self" ON public.members FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "meals read room" ON public.meals FOR SELECT TO authenticated USING (room_id = public.my_room_id());
CREATE POLICY "meals insert self" ON public.meals FOR INSERT TO authenticated WITH CHECK (member_id = public.my_member_id() AND room_id = public.my_room_id());
CREATE POLICY "meals update self" ON public.meals FOR UPDATE TO authenticated USING (member_id = public.my_member_id()) WITH CHECK (member_id = public.my_member_id());
CREATE POLICY "meals delete self" ON public.meals FOR DELETE TO authenticated USING (member_id = public.my_member_id());

ALTER TABLE public.meals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;