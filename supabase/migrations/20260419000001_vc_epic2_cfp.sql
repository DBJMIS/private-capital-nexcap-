BEGIN;

-- 1. New ENUMs
CREATE TYPE public.cfp_status AS ENUM (
  'draft',
  'active',
  'closed',
  'archived'
);

CREATE TYPE public.panel_member_type AS ENUM (
  'voting',
  'observer'
);

CREATE TYPE public.dd_recommendation AS ENUM (
  'full_dd',
  'conditional_dd',
  'no_dd'
);

-- 2. Add missing values to fund_application_status
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'pre_qualified';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'shortlisted';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'presentation_scheduled';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'presentation_complete';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'panel_evaluation';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'dd_recommended';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'dd_complete';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'site_visit';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'negotiation';
ALTER TYPE public.fund_application_status
  ADD VALUE IF NOT EXISTS 'committed';

-- 3. vc_cfps table
CREATE TABLE public.vc_cfps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  opening_date date NOT NULL,
  closing_date date NOT NULL,
  status public.cfp_status NOT NULL DEFAULT 'draft',
  investment_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeline_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users (id)
    ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_cfps_dates_check
    CHECK (closing_date > opening_date)
);

CREATE TRIGGER trg_vc_cfps_updated_at
  BEFORE UPDATE ON public.vc_cfps
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_cfps_tenant_status
  ON public.vc_cfps (tenant_id, status);

ALTER TABLE public.vc_cfps ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_cfps_select ON public.vc_cfps
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_cfps_insert ON public.vc_cfps
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_cfps_update ON public.vc_cfps
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_cfps_delete ON public.vc_cfps
  FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- 4. Add cfp_id to vc_fund_applications
ALTER TABLE public.vc_fund_applications
  ADD COLUMN IF NOT EXISTS cfp_id uuid
    REFERENCES public.vc_cfps (id) ON DELETE SET NULL;

CREATE INDEX idx_vc_fund_applications_cfp
  ON public.vc_fund_applications (tenant_id, cfp_id);

-- 5. vc_panel_members
CREATE TABLE public.vc_panel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  cfp_id uuid NOT NULL REFERENCES public.vc_cfps (id)
    ON DELETE CASCADE,
  investor_id uuid REFERENCES public.vc_investors (id)
    ON DELETE SET NULL,
  member_name text NOT NULL,
  member_organisation text,
  member_email text,
  member_type public.panel_member_type NOT NULL
    DEFAULT 'voting',
  nda_signed boolean NOT NULL DEFAULT false,
  nda_signed_date date,
  is_fund_manager boolean NOT NULL DEFAULT false,
  excluded_application_ids uuid[] NOT NULL DEFAULT '{}',
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_panel_members_updated_at
  BEFORE UPDATE ON public.vc_panel_members
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_panel_members_tenant_cfp
  ON public.vc_panel_members (tenant_id, cfp_id);

ALTER TABLE public.vc_panel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_panel_members_select ON public.vc_panel_members
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_panel_members_insert ON public.vc_panel_members
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_panel_members_update ON public.vc_panel_members
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_panel_members_delete ON public.vc_panel_members
  FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- 6. vc_presentations
CREATE TABLE public.vc_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  application_id uuid NOT NULL
    REFERENCES public.vc_fund_applications (id)
    ON DELETE CASCADE,
  cfp_id uuid NOT NULL REFERENCES public.vc_cfps (id)
    ON DELETE CASCADE,
  scheduled_date date,
  actual_date date,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  recording_url text,
  presentation_file_path text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users (id)
    ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_presentations_updated_at
  BEFORE UPDATE ON public.vc_presentations
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_presentations_tenant_application
  ON public.vc_presentations (tenant_id, application_id);

ALTER TABLE public.vc_presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_presentations_select ON public.vc_presentations
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_presentations_insert ON public.vc_presentations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_presentations_update ON public.vc_presentations
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- 7. vc_panel_evaluations
CREATE TABLE public.vc_panel_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  application_id uuid NOT NULL
    REFERENCES public.vc_fund_applications (id)
    ON DELETE CASCADE,
  cfp_id uuid NOT NULL REFERENCES public.vc_cfps (id)
    ON DELETE CASCADE,
  panel_member_id uuid NOT NULL
    REFERENCES public.vc_panel_members (id)
    ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted')),
  dd_vote public.dd_recommendation,
  conditions text,
  general_notes text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_panel_evaluations_unique
    UNIQUE (application_id, panel_member_id)
);

CREATE TRIGGER trg_vc_panel_evaluations_updated_at
  BEFORE UPDATE ON public.vc_panel_evaluations
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_panel_evaluations_tenant_application
  ON public.vc_panel_evaluations (tenant_id, application_id);

ALTER TABLE public.vc_panel_evaluations
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_panel_evaluations_select
  ON public.vc_panel_evaluations
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_panel_evaluations_insert
  ON public.vc_panel_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_panel_evaluations_update
  ON public.vc_panel_evaluations
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- 8. vc_panel_evaluation_scores
CREATE TABLE public.vc_panel_evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  evaluation_id uuid NOT NULL
    REFERENCES public.vc_panel_evaluations (id)
    ON DELETE CASCADE,
  category text NOT NULL,
  criterion_key text NOT NULL,
  rating text CHECK (rating IN ('S', 'R', 'W', 'I')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_eval_scores_unique
    UNIQUE (evaluation_id, criterion_key)
);

CREATE TRIGGER trg_vc_panel_evaluation_scores_updated_at
  BEFORE UPDATE ON public.vc_panel_evaluation_scores
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_eval_scores_evaluation
  ON public.vc_panel_evaluation_scores (tenant_id, evaluation_id);

ALTER TABLE public.vc_panel_evaluation_scores
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_eval_scores_select
  ON public.vc_panel_evaluation_scores
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_eval_scores_insert
  ON public.vc_panel_evaluation_scores
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_eval_scores_update
  ON public.vc_panel_evaluation_scores
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- 9. vc_site_visits
CREATE TABLE public.vc_site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  application_id uuid NOT NULL
    REFERENCES public.vc_fund_applications (id)
    ON DELETE CASCADE,
  scheduled_date date,
  actual_date date,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  location text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text CHECK (outcome IN (
    'satisfactory', 'unsatisfactory', 'conditional')),
  report_file_path text,
  notes text,
  conducted_by uuid REFERENCES auth.users (id)
    ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_site_visits_updated_at
  BEFORE UPDATE ON public.vc_site_visits
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_site_visits_tenant_application
  ON public.vc_site_visits (tenant_id, application_id);

ALTER TABLE public.vc_site_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_site_visits_select ON public.vc_site_visits
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_site_visits_insert ON public.vc_site_visits
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_site_visits_update ON public.vc_site_visits
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

COMMIT;
