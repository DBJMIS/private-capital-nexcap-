-- Fund Manager Portal: profile flags, invitation metadata, password reset support
BEGIN;

ALTER TABLE public.vc_profiles
  ADD COLUMN IF NOT EXISTS is_portal_user boolean NOT NULL DEFAULT false;

ALTER TABLE public.vc_profiles
  ADD COLUMN IF NOT EXISTS password_hash text;

COMMENT ON COLUMN public.vc_profiles.is_portal_user IS
  'True for external Fund Manager Portal users (credentials auth).';

COMMENT ON COLUMN public.vc_profiles.password_hash IS
  'Bcrypt hash for portal credentials when is_portal_user is true.';

ALTER TABLE public.vc_invitations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vc_invitations.metadata IS
  'Structured data: application_id, fund_name, fund_manager_id, application_id for portal invites; used for reset flow.';

COMMIT;
