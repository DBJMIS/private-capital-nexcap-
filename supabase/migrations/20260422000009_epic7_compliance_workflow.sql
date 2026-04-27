BEGIN;

-- Workflow columns (Epic 4 already has reminder_sent_at, escalated_at, escalation_level)
ALTER TABLE public.vc_reporting_obligations
  ADD COLUMN IF NOT EXISTS reminder_sent_to text,
  ADD COLUMN IF NOT EXISTS escalated_to text,
  ADD COLUMN IF NOT EXISTS actioned_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actioned_at timestamptz;

-- Compliance action log
CREATE TABLE IF NOT EXISTS public.vc_compliance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.vc_reporting_obligations (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,

  action_type text NOT NULL
    CHECK (
      action_type IN (
        'marked_received',
        'marked_accepted',
        'reminder_sent',
        'escalated',
        'document_uploaded',
        'status_changed',
        'note_added'
      )
    ),

  actor_id uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  actor_name text,

  from_status text,
  to_status text,

  notes text,
  recipient text,

  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS idx_compliance_actions_obligation ON public.vc_compliance_actions (obligation_id);

CREATE INDEX IF NOT EXISTS idx_compliance_actions_fund ON public.vc_compliance_actions (fund_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_actions_tenant ON public.vc_compliance_actions (tenant_id, created_at DESC);

ALTER TABLE public.vc_compliance_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select"
  ON public.vc_compliance_actions FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY "tenant_isolation_insert"
  ON public.vc_compliance_actions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

COMMIT;
