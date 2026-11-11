-- Each recovered/linked phone can retain its own recovery key.
-- Keep legacy members.participant_token_hash untouched so existing devices still work.
-- Apply this migration BEFORE deploying the recovery-link frontend/server.
CREATE TABLE IF NOT EXISTS public.member_recovery_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_recovery_keys_member_idx
  ON public.member_recovery_keys(member_id);
ALTER TABLE public.member_recovery_keys ENABLE ROW LEVEL SECURITY;
-- Recovery secrets are never publicly queryable, even by room participants.
REVOKE ALL ON public.member_recovery_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_recovery_keys TO service_role;
