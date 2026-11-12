-- RELEASE GATE: run before deploying the private-image client.
-- Existing public URLs become inaccessible after this transaction.
-- The upgraded client signs both legacy URLs and new storage paths on demand.
BEGIN;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS photo_url text;
INSERT INTO storage.buckets (id,name,public)
  VALUES ('meal-photos','meal-photos',false)
  ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Public read meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Room members can read meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Room members can upload meal photos" ON storage.objects;

CREATE POLICY "Room members can read meal photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = public.my_room_id()::text
  );

CREATE POLICY "Room members can upload meal photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = public.my_room_id()::text
    AND storage.extension(name) = 'jpg'
  );
COMMIT;
