-- Add photo_url to meals
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Storage bucket for meal photos (public CDN delivery)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-photos', 'meal-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read photos (they are served via public CDN URLs anyway)
CREATE POLICY IF NOT EXISTS "Public read meal photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'meal-photos');

-- Authenticated users can upload
CREATE POLICY IF NOT EXISTS "Authenticated upload meal photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'meal-photos');
