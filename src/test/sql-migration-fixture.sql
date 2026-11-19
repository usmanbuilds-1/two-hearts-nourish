-- Disposable schema fixture ONLY for PostgreSQL CI. Never run on a real Supabase project.
-- Represents the production schema after migration 0013, before the migrations tested by CI.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
CREATE TABLE storage.objects (
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(p text) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT string_to_array(p, '/') $$;

CREATE OR REPLACE FUNCTION storage.extension(p text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT substring(p from '\.([^.]*)$') $$;

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text UNIQUE NOT NULL,
  shared_goal text,
  couple_message text,
  together_since date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  auth_user_id uuid UNIQUE,
  seat smallint NOT NULL CHECK (seat IN (1,2)),
  display_name text NOT NULL,
  participant_token_hash text NOT NULL,
  daily_calorie_target integer,
  daily_protein_target numeric,
  daily_carbs_target numeric,
  daily_fat_target numeric,
  height_cm numeric,
  weight_kg numeric,
  age smallint,
  sex text CHECK (sex IN ('male','female')),
  activity_level text CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  body_goal text CHECK (body_goal IN ('lose','maintain','gain')),
  daily_food_budget numeric,
  currency text,
  locality text,
  link_code_hash text,
  link_code_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, seat)
);

-- The disposable fixture begins after the early schema migrations, so
-- reproduce the existing weight-log table before testing atomic writes.
CREATE TABLE public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  logged_date date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric(5,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weight_logs_member_date UNIQUE(member_id,logged_date)
);

CREATE TABLE public.member_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.member_recovery_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_recovery_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_recovery_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_recovery_keys TO service_role;

CREATE TABLE public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  food_name text NOT NULL CHECK (char_length(food_name) BETWEEN 1 AND 200),
  calories integer NOT NULL CHECK (calories BETWEEN 0 AND 20000),
  protein numeric NOT NULL CHECK (protein BETWEEN 0 AND 2000),
  carbs numeric NOT NULL CHECK (carbs BETWEEN 0 AND 2000),
  fat numeric NOT NULL CHECK (fat BETWEEN 0 AND 2000),
  serving_description text,
  ai_confidence text CHECK (ai_confidence IS NULL OR ai_confidence IN ('low','medium','high')),
  meal_type text NOT NULL DEFAULT 'snack' CHECK (meal_type IN ('breakfast','lunch','snack','dinner')),
  meal_date date NOT NULL,
  is_planned boolean NOT NULL DEFAULT false,
  photo_url text,
  portion_percentage integer NOT NULL DEFAULT 100,
  nominal_calories integer,
  nominal_protein numeric(6,1),
  nominal_carbs numeric(6,1),
  nominal_fat numeric(6,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
-- Match the restricted column-level grants used in production. Broad table
-- grants masked the missing permissions introduced by migration 0027.
GRANT SELECT (
  id, room_id, auth_user_id, seat, display_name,
  daily_calorie_target, daily_protein_target, daily_carbs_target,
  daily_fat_target, created_at, height_cm, weight_kg, age, sex,
  activity_level, body_goal, daily_food_budget, currency, locality
) ON public.members TO authenticated;
GRANT UPDATE (
  activity_level, age, body_goal, currency, daily_calorie_target,
  daily_carbs_target, daily_fat_target, daily_food_budget,
  daily_protein_target, display_name, height_cm, locality, sex, weight_kg
) ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
GRANT SELECT ON public.member_devices TO authenticated;
GRANT ALL ON public.member_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
GRANT ALL ON public.meals TO service_role;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_member_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT member_id
  FROM public.member_devices
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_room_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.room_id
  FROM public.member_devices d
  JOIN public.members m ON m.id = d.member_id
  WHERE d.auth_user_id = auth.uid()
  LIMIT 1
$$;
