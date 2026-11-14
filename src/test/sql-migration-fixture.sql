-- Disposable schema fixture ONLY for PostgreSQL CI. Never run on a real Supabase project.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(p text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(p, '/') $$;
CREATE OR REPLACE FUNCTION storage.extension(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT substring(p from '\.([^.]*)$') $$;

CREATE TABLE public.rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE public.members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.rooms(id),
 auth_user_id uuid UNIQUE,
 participant_token_hash text NOT NULL,
 daily_protein_target numeric
);
CREATE TABLE public.member_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES public.members(id),
 auth_user_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.member_recovery_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- 0013 already ran in production, so mirror its RLS configuration in this fixture.
ALTER TABLE public.member_recovery_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_recovery_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_recovery_keys TO service_role;

CREATE TABLE public.meals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.rooms(id),
 member_id uuid NOT NULL REFERENCES public.members(id),
 meal_date date NOT NULL,
 meal_type text NOT NULL,
 protein numeric NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $fixture_touch$
BEGIN NEW.updated_at = now(); RETURN NEW; END $fixture_touch$;

CREATE OR REPLACE FUNCTION public.my_room_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
