-- Scanner evidence metadata for explainable confidence.
BEGIN;

ALTER TABLE public.scan_events
  ADD COLUMN IF NOT EXISTS image_quality text
    CHECK (image_quality IS NULL OR image_quality IN ('poor','fair','good'));

ALTER TABLE public.scan_items
  ADD COLUMN IF NOT EXISTS scale_evidence text
    CHECK (scale_evidence IS NULL OR char_length(scale_evidence) <= 160),
  ADD COLUMN IF NOT EXISTS occlusion_risk text
    CHECK (occlusion_risk IS NULL OR occlusion_risk IN ('low','medium','high'));

COMMIT;
