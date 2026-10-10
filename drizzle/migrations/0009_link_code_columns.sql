-- Link device codes — these columns were missing, causing createLinkCode to throw SERVER_ERROR
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS link_code_hash text,
  ADD COLUMN IF NOT EXISTS link_code_expires_at timestamptz;
