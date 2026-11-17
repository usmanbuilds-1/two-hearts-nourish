-- Private repeat-scan cache. No raw photos or raw context are stored.
BEGIN;

ALTER TABLE public.scan_events
  ADD COLUMN IF NOT EXISTS image_fingerprint text,
  ADD COLUMN IF NOT EXISTS context_fingerprint text;

CREATE TABLE IF NOT EXISTS public.member_scan_cache (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  image_fingerprint text NOT NULL CHECK (image_fingerprint ~ '^[a-f0-9]{16}$'),
  context_fingerprint text NOT NULL DEFAULT '' CHECK (context_fingerprint = '' OR context_fingerprint ~ '^[a-f0-9]{64}$'),
  scanner_version text NOT NULL,
  final_estimate jsonb NOT NULL CHECK (jsonb_typeof(final_estimate) = 'object'),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(member_id,image_fingerprint,context_fingerprint,scanner_version)
);
CREATE INDEX IF NOT EXISTS member_scan_cache_recent_idx
  ON public.member_scan_cache(member_id,updated_at DESC);
ALTER TABLE public.member_scan_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_scan_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_scan_cache TO service_role;

COMMIT;
