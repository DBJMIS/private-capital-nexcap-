BEGIN;

ALTER TABLE public.vc_presentations
  ADD COLUMN IF NOT EXISTS presentation_type text
    NOT NULL DEFAULT 'in_person'
    CHECK (presentation_type IN ('teams', 'in_person')),
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS teams_meeting_id text,
  ADD COLUMN IF NOT EXISTS teams_join_url text,
  ADD COLUMN IF NOT EXISTS teams_recording_url text,
  ADD COLUMN IF NOT EXISTS auto_completed boolean
    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_sent boolean
    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;

COMMENT ON COLUMN public.vc_presentations.presentation_type IS
  'teams = Microsoft Teams meeting (auto-created via Graph API in future); in_person = physical meeting';
COMMENT ON COLUMN public.vc_presentations.teams_meeting_id IS
  'Microsoft Graph meeting ID — populated when Teams integration is active';
COMMENT ON COLUMN public.vc_presentations.teams_join_url IS
  'Teams meeting join URL — populated when Teams integration is active';
COMMENT ON COLUMN public.vc_presentations.teams_recording_url IS
  'Teams recording URL — populated after meeting ends via Graph API';
COMMENT ON COLUMN public.vc_presentations.auto_completed IS
  'True if marked complete automatically by Edge Function cron job';
COMMENT ON COLUMN public.vc_presentations.invite_sent IS
  'True if calendar invites have been sent to attendees';

COMMIT;
