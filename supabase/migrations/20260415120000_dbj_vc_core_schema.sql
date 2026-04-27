-- =============================================================================
-- DBJ VC & Private Capital Management — core PostgreSQL schema
-- Supabase-compatible migration (public + auth.users references)
-- =============================================================================
-- Notes:
-- - UUID PKs; tenant_id NOT NULL on all business tables
-- - RLS enabled on all tenant-scoped tables (add policies in a follow-up migration)
-- - updated_at maintained via trigger
-- - vc_fund_applications: soft delete via deleted_at
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- ENUMs (defined before tables)
-- -----------------------------------------------------------------------------

CREATE TYPE public.fund_application_status AS ENUM (
  'draft',
  'submitted',
  'pre_screening',
  'due_diligence',
  'approved',
  'rejected'
);

CREATE TYPE public.dd_questionnaire_status AS ENUM (
  'draft',
  'in_progress',
  'completed'
);

CREATE TYPE public.dd_section_key AS ENUM (
  'basic_info',
  'sponsor',
  'deal_flow',
  'portfolio_monitoring',
  'investment_strategy',
  'governing_rules',
  'investors_fundraising',
  'legal',
  'additional',
  'staff_bios'
);

CREATE TYPE public.dd_section_status AS ENUM (
  'not_started',
  'in_progress',
  'completed'
);

CREATE TYPE public.assessment_status AS ENUM (
  'draft',
  'in_progress',
  'completed',
  'approved'
);

CREATE TYPE public.vc_assessment_criteria_key AS ENUM (
  'firm',
  'fundraising',
  'team',
  'investment_strategy',
  'investment_process',
  'representative_pipeline',
  'governance'
);

CREATE TYPE public.assessment_recommendation AS ENUM (
  'approve',
  'review',
  'reject'
);

CREATE TYPE public.deal_stage AS ENUM (
  'sourced',
  'screening',
  'due_diligence',
  'investment_committee',
  'approved',
  'rejected',
  'funded'
);

CREATE TYPE public.investment_status AS ENUM (
  'active',
  'on_hold',
  'closed',
  'written_off'
);

CREATE TYPE public.instrument_type AS ENUM (
  'equity',
  'debt',
  'convertible',
  'mezzanine',
  'grant',
  'blended'
);

CREATE TYPE public.disbursement_status AS ENUM (
  'pending',
  'approved',
  'disbursed',
  'cancelled'
);

CREATE TYPE public.repayment_status AS ENUM (
  'current',
  'delinquent',
  'default'
);

CREATE TYPE public.monitoring_report_type AS ENUM (
  'quarterly',
  'annual',
  'ad_hoc'
);

CREATE TYPE public.investor_type AS ENUM (
  'multilateral',
  'government',
  'private',
  'development_bank',
  'pension_fund',
  'other'
);

CREATE TYPE public.task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE public.task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE public.approval_type AS ENUM (
  'pre_screening',
  'due_diligence',
  'investment',
  'disbursement'
);

CREATE TYPE public.approval_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vc_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Tables (dependency order)
-- -----------------------------------------------------------------------------

CREATE TABLE public.vc_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_tenants_slug_key UNIQUE (slug)
);

CREATE TRIGGER trg_vc_tenants_set_updated_at
BEFORE UPDATE ON public.vc_tenants
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_profiles_tenant_user_key UNIQUE (tenant_id, user_id),
  CONSTRAINT vc_profiles_tenant_email_key UNIQUE (tenant_id, email)
);

CREATE TRIGGER trg_vc_profiles_set_updated_at
BEFORE UPDATE ON public.vc_profiles
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_fund_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_name text NOT NULL,
  manager_name text NOT NULL,
  country_of_incorporation text NOT NULL,
  geographic_area text NOT NULL,
  total_capital_commitment_usd numeric NOT NULL,
  status public.fund_application_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  deleted_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_fund_applications_commitment_nonneg CHECK (total_capital_commitment_usd >= 0),
  CONSTRAINT vc_fund_applications_submitted_at_consistency CHECK (
    status = 'draft' OR submitted_at IS NOT NULL
  ),
  CONSTRAINT vc_fund_applications_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE TRIGGER trg_vc_fund_applications_set_updated_at
BEFORE UPDATE ON public.vc_fund_applications
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_pre_screening_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  fund_info_complete boolean NOT NULL DEFAULT false,
  strategy_complete boolean NOT NULL DEFAULT false,
  management_complete boolean NOT NULL DEFAULT false,
  legal_complete boolean NOT NULL DEFAULT false,
  overall_pass boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_pre_screening_checklists_tenant_application_key UNIQUE (tenant_id, application_id),
  CONSTRAINT vc_pre_screening_checklists_tenant_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_vc_pre_screening_checklists_set_updated_at
BEFORE UPDATE ON public.vc_pre_screening_checklists
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_dd_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  status public.dd_questionnaire_status NOT NULL DEFAULT 'draft',
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_questionnaires_application_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_vc_dd_questionnaires_set_updated_at
BEFORE UPDATE ON public.vc_dd_questionnaires
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_dd_questionnaires
  ADD CONSTRAINT vc_dd_questionnaires_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_dd_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  section_key public.dd_section_key NOT NULL,
  section_order integer NOT NULL,
  status public.dd_section_status NOT NULL DEFAULT 'not_started',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_sections_questionnaire_fk FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_dd_sections_questionnaire_section_key UNIQUE (questionnaire_id, section_key),
  CONSTRAINT vc_dd_sections_questionnaire_section_order UNIQUE (questionnaire_id, section_order)
);

CREATE TRIGGER trg_vc_dd_sections_set_updated_at
BEFORE UPDATE ON public.vc_dd_sections
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_dd_sections
  ADD CONSTRAINT vc_dd_sections_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_dd_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  question_key varchar(200) NOT NULL,
  answer_text text,
  answer_value numeric,
  answer_boolean boolean,
  answer_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_answers_section_fk FOREIGN KEY (tenant_id, section_id)
    REFERENCES public.vc_dd_sections (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_dd_answers_section_question_key UNIQUE (section_id, question_key)
);

CREATE TRIGGER trg_vc_dd_answers_set_updated_at
BEFORE UPDATE ON public.vc_dd_answers
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_dd_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  section_id uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_documents_questionnaire_fk FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_dd_documents_section_fk FOREIGN KEY (tenant_id, section_id)
    REFERENCES public.vc_dd_sections (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT vc_dd_documents_size_nonneg CHECK (file_size_bytes >= 0)
);

CREATE TRIGGER trg_vc_dd_documents_set_updated_at
BEFORE UPDATE ON public.vc_dd_documents
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_dd_staff_bios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  full_name text NOT NULL,
  work_phone text,
  email text,
  date_of_birth date,
  nationality text,
  education jsonb,
  work_experience text,
  fund_responsibilities text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_staff_bios_questionnaire_fk FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_vc_dd_staff_bios_set_updated_at
BEFORE UPDATE ON public.vc_dd_staff_bios
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  questionnaire_id uuid NOT NULL,
  evaluator_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  status public.assessment_status NOT NULL DEFAULT 'draft',
  overall_score numeric,
  overall_weighted_score numeric,
  pass_threshold numeric NOT NULL DEFAULT 70,
  passed boolean,
  recommendation public.assessment_recommendation,
  completed_at timestamptz,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_assessments_application_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_assessments_questionnaire_fk FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_assessments_pass_threshold_range CHECK (pass_threshold >= 0 AND pass_threshold <= 100)
);

CREATE TRIGGER trg_vc_assessments_set_updated_at
BEFORE UPDATE ON public.vc_assessments
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_assessments
  ADD CONSTRAINT vc_assessments_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_assessment_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  criteria_key public.vc_assessment_criteria_key NOT NULL,
  criteria_weight numeric NOT NULL,
  max_points numeric NOT NULL,
  raw_score numeric,
  weighted_score numeric,
  evaluator_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_assessment_criteria_assessment_fk FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES public.vc_assessments (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_assessment_criteria_assessment_key UNIQUE (assessment_id, criteria_key),
  CONSTRAINT vc_assessment_criteria_weights_nonneg CHECK (criteria_weight >= 0),
  CONSTRAINT vc_assessment_criteria_max_points_nonneg CHECK (max_points >= 0),
  CONSTRAINT vc_assessment_criteria_raw_score_range CHECK (raw_score IS NULL OR (raw_score >= 1 AND raw_score <= 5))
);

CREATE TRIGGER trg_vc_assessment_criteria_set_updated_at
BEFORE UPDATE ON public.vc_assessment_criteria
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_assessment_criteria
  ADD CONSTRAINT vc_assessment_criteria_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_assessment_subcriteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  subcriteria_key varchar(200) NOT NULL,
  description text,
  max_points numeric NOT NULL,
  score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_assessment_subcriteria_criteria_fk FOREIGN KEY (tenant_id, criteria_id)
    REFERENCES public.vc_assessment_criteria (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_assessment_subcriteria_key_unique UNIQUE (criteria_id, subcriteria_key),
  CONSTRAINT vc_assessment_subcriteria_max_points_nonneg CHECK (max_points >= 0)
);

CREATE TRIGGER trg_vc_assessment_subcriteria_set_updated_at
BEFORE UPDATE ON public.vc_assessment_subcriteria
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  title text NOT NULL,
  assigned_officer text,
  stage public.deal_stage NOT NULL DEFAULT 'sourced',
  deal_value_usd numeric,
  sector varchar(200),
  geography varchar(200),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_deals_application_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_deals_value_nonneg CHECK (deal_value_usd IS NULL OR deal_value_usd >= 0)
);

CREATE TRIGGER trg_vc_deals_set_updated_at
BEFORE UPDATE ON public.vc_deals
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_deals
  ADD CONSTRAINT vc_deals_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  deal_id uuid NOT NULL,
  application_id uuid NOT NULL,
  approved_amount_usd numeric NOT NULL,
  disbursed_amount_usd numeric NOT NULL DEFAULT 0,
  remaining_amount_usd numeric NOT NULL,
  status public.investment_status NOT NULL DEFAULT 'active',
  investment_date date,
  maturity_date date,
  instrument_type public.instrument_type NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_investments_deal_fk FOREIGN KEY (tenant_id, deal_id)
    REFERENCES public.vc_deals (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_investments_application_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_investments_amounts_nonneg CHECK (
    approved_amount_usd >= 0
    AND disbursed_amount_usd >= 0
    AND remaining_amount_usd >= 0
  ),
  CONSTRAINT vc_investments_disbursed_lte_approved CHECK (disbursed_amount_usd <= approved_amount_usd)
);

CREATE TRIGGER trg_vc_investments_set_updated_at
BEFORE UPDATE ON public.vc_investments
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_investments
  ADD CONSTRAINT vc_investments_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  investment_id uuid NOT NULL,
  tranche_number integer NOT NULL,
  amount_usd numeric NOT NULL,
  disbursement_date date,
  reference_number varchar(200),
  status public.disbursement_status NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_disbursements_investment_fk FOREIGN KEY (tenant_id, investment_id)
    REFERENCES public.vc_investments (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_disbursements_amount_nonneg CHECK (amount_usd >= 0),
  CONSTRAINT vc_disbursements_tranche_unique UNIQUE (investment_id, tranche_number)
);

CREATE TRIGGER trg_vc_disbursements_set_updated_at
BEFORE UPDATE ON public.vc_disbursements
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  investment_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  revenue_usd numeric,
  ebitda_usd numeric,
  repayment_status public.repayment_status NOT NULL DEFAULT 'current',
  performance_score numeric,
  valuation_usd numeric,
  notes text,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_portfolio_snapshots_investment_fk FOREIGN KEY (tenant_id, investment_id)
    REFERENCES public.vc_investments (tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_vc_portfolio_snapshots_set_updated_at
BEFORE UPDATE ON public.vc_portfolio_snapshots
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_monitoring_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  investment_id uuid NOT NULL,
  reporting_period varchar(50) NOT NULL,
  report_type public.monitoring_report_type NOT NULL,
  submitted_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  document_path text,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_monitoring_reports_investment_fk FOREIGN KEY (tenant_id, investment_id)
    REFERENCES public.vc_investments (tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_vc_monitoring_reports_set_updated_at
BEFORE UPDATE ON public.vc_monitoring_reports
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  investor_type public.investor_type NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  country text,
  committed_capital_usd numeric NOT NULL DEFAULT 0,
  deployed_capital_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_investors_capital_nonneg CHECK (committed_capital_usd >= 0 AND deployed_capital_usd >= 0)
);

CREATE TRIGGER trg_vc_investors_set_updated_at
BEFORE UPDATE ON public.vc_investors
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_investors
  ADD CONSTRAINT vc_investors_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE public.vc_investor_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  investor_id uuid NOT NULL,
  application_id uuid,
  investment_id uuid,
  committed_amount_usd numeric NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  commitment_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_investor_commitments_investor_fk FOREIGN KEY (tenant_id, investor_id)
    REFERENCES public.vc_investors (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_investor_commitments_application_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT vc_investor_commitments_investment_fk FOREIGN KEY (tenant_id, investment_id)
    REFERENCES public.vc_investments (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT vc_investor_commitments_amount_nonneg CHECK (committed_amount_usd >= 0),
  CONSTRAINT vc_investor_commitments_targets_ck CHECK (
    application_id IS NOT NULL OR investment_id IS NOT NULL
  )
);

CREATE TRIGGER trg_vc_investor_commitments_set_updated_at
BEFORE UPDATE ON public.vc_investor_commitments
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  entity_type varchar(100) NOT NULL,
  entity_id uuid NOT NULL,
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'pending',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  due_date date,
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_tasks_set_updated_at
BEFORE UPDATE ON public.vc_tasks
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  entity_type varchar(100) NOT NULL,
  entity_id uuid NOT NULL,
  approval_type public.approval_type NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status public.approval_status NOT NULL DEFAULT 'pending',
  decision_notes text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_approvals_set_updated_at
BEFORE UPDATE ON public.vc_approvals
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE TABLE public.vc_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  entity_type varchar(100) NOT NULL,
  entity_id uuid NOT NULL,
  action varchar(100) NOT NULL,
  before_state jsonb,
  after_state jsonb,
  ip_address varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_audit_logs_set_updated_at
BEFORE UPDATE ON public.vc_audit_logs
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes (declared after tables)
-- -----------------------------------------------------------------------------

CREATE INDEX idx_vc_fund_applications_tenant_status ON public.vc_fund_applications (tenant_id, status);
CREATE INDEX idx_vc_fund_applications_tenant_application ON public.vc_fund_applications (tenant_id, id);

CREATE INDEX idx_vc_pre_screening_tenant_application ON public.vc_pre_screening_checklists (tenant_id, application_id);

CREATE INDEX idx_vc_dd_questionnaires_tenant_application ON public.vc_dd_questionnaires (tenant_id, application_id);
CREATE INDEX idx_vc_dd_questionnaires_tenant_status ON public.vc_dd_questionnaires (tenant_id, status);

CREATE INDEX idx_vc_dd_sections_tenant_questionnaire ON public.vc_dd_sections (tenant_id, questionnaire_id);

CREATE INDEX idx_vc_dd_answers_tenant_section ON public.vc_dd_answers (tenant_id, section_id);

CREATE INDEX idx_vc_dd_documents_tenant_questionnaire ON public.vc_dd_documents (tenant_id, questionnaire_id);
CREATE INDEX idx_vc_dd_documents_tenant_section ON public.vc_dd_documents (tenant_id, section_id);

CREATE INDEX idx_vc_dd_staff_bios_tenant_questionnaire ON public.vc_dd_staff_bios (tenant_id, questionnaire_id);

CREATE INDEX idx_vc_assessments_tenant_application ON public.vc_assessments (tenant_id, application_id);
CREATE INDEX idx_vc_assessments_tenant_status ON public.vc_assessments (tenant_id, status);

CREATE INDEX idx_vc_assessment_criteria_tenant_assessment ON public.vc_assessment_criteria (tenant_id, assessment_id);

CREATE INDEX idx_vc_assessment_subcriteria_tenant_criteria ON public.vc_assessment_subcriteria (tenant_id, criteria_id);

CREATE INDEX idx_vc_deals_tenant_stage ON public.vc_deals (tenant_id, stage);
CREATE INDEX idx_vc_deals_tenant_application ON public.vc_deals (tenant_id, application_id);

CREATE INDEX idx_vc_investments_tenant_status ON public.vc_investments (tenant_id, status);
CREATE INDEX idx_vc_investments_tenant_application ON public.vc_investments (tenant_id, application_id);
CREATE INDEX idx_vc_investments_tenant_investment ON public.vc_investments (tenant_id, id);

CREATE INDEX idx_vc_disbursements_tenant_investment ON public.vc_disbursements (tenant_id, investment_id);
CREATE INDEX idx_vc_disbursements_tenant_status ON public.vc_disbursements (tenant_id, status);

CREATE INDEX idx_vc_portfolio_snapshots_tenant_investment ON public.vc_portfolio_snapshots (tenant_id, investment_id);
CREATE INDEX idx_vc_portfolio_snapshots_tenant_snapshot_date ON public.vc_portfolio_snapshots (tenant_id, snapshot_date DESC);

CREATE INDEX idx_vc_monitoring_reports_tenant_investment ON public.vc_monitoring_reports (tenant_id, investment_id);

CREATE INDEX idx_vc_investors_tenant_type ON public.vc_investors (tenant_id, investor_type);

CREATE INDEX idx_vc_investor_commitments_tenant_investor ON public.vc_investor_commitments (tenant_id, investor_id);
CREATE INDEX idx_vc_investor_commitments_tenant_application ON public.vc_investor_commitments (tenant_id, application_id);
CREATE INDEX idx_vc_investor_commitments_tenant_investment ON public.vc_investor_commitments (tenant_id, investment_id);

CREATE INDEX idx_vc_tasks_tenant_status ON public.vc_tasks (tenant_id, status);
CREATE INDEX idx_vc_tasks_tenant_entity ON public.vc_tasks (tenant_id, entity_type, entity_id);

CREATE INDEX idx_vc_approvals_tenant_status ON public.vc_approvals (tenant_id, status);
CREATE INDEX idx_vc_approvals_tenant_entity ON public.vc_approvals (tenant_id, entity_type, entity_id);

CREATE INDEX idx_vc_audit_logs_tenant_created_at ON public.vc_audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_vc_audit_logs_tenant_entity ON public.vc_audit_logs (tenant_id, entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Row Level Security (enabled; policies belong in a dedicated migration)
-- -----------------------------------------------------------------------------

ALTER TABLE public.vc_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_fund_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_pre_screening_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_staff_bios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_assessment_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_assessment_subcriteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_monitoring_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investor_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_audit_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.vc_tenants IS 'Top-level tenant boundary for RLS and data isolation.';
COMMENT ON TABLE public.vc_fund_applications IS 'Soft delete via deleted_at; filter deleted rows in queries unless explicitly needed.';

COMMIT;
