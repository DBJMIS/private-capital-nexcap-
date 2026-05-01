-- AI Fund Manager Relationship Intelligence

CREATE TABLE IF NOT EXISTS public.fund_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  firm_name text NOT NULL,
  email text,
  phone text,
  linkedin_url text,
  first_contact_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fund_managers_tenant_name
  ON public.fund_managers(tenant_id, name);

CREATE TABLE IF NOT EXISTS public.fund_manager_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants(id) ON DELETE CASCADE,
  fund_manager_id uuid NOT NULL REFERENCES public.fund_managers(id) ON DELETE CASCADE,
  note text NOT NULL,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fund_manager_notes_manager_created
  ON public.fund_manager_notes(fund_manager_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_relationship_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants(id) ON DELETE CASCADE,
  fund_manager_id uuid NOT NULL REFERENCES public.fund_managers(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ai_relationship_profiles_manager_generated
  ON public.ai_relationship_profiles(fund_manager_id, generated_at DESC);

ALTER TABLE public.vc_portfolio_funds
  ADD COLUMN IF NOT EXISTS fund_manager_id uuid REFERENCES public.fund_managers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vc_portfolio_funds_fund_manager
  ON public.vc_portfolio_funds(fund_manager_id);

ALTER TABLE public.fund_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_manager_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_relationship_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fund_managers_select_auth ON public.fund_managers;
CREATE POLICY fund_managers_select_auth
  ON public.fund_managers
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS fund_managers_write_service_role ON public.fund_managers;
CREATE POLICY fund_managers_write_service_role
  ON public.fund_managers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS fund_manager_notes_select_auth ON public.fund_manager_notes;
CREATE POLICY fund_manager_notes_select_auth
  ON public.fund_manager_notes
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS fund_manager_notes_insert_auth ON public.fund_manager_notes;
CREATE POLICY fund_manager_notes_insert_auth
  ON public.fund_manager_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS fund_manager_notes_write_service_role ON public.fund_manager_notes;
CREATE POLICY fund_manager_notes_write_service_role
  ON public.fund_manager_notes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_relationship_profiles_select_auth ON public.ai_relationship_profiles;
CREATE POLICY ai_relationship_profiles_select_auth
  ON public.ai_relationship_profiles
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS ai_relationship_profiles_insert_service_role ON public.ai_relationship_profiles;
CREATE POLICY ai_relationship_profiles_insert_service_role
  ON public.ai_relationship_profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_relationship_profiles_update_service_role ON public.ai_relationship_profiles;
CREATE POLICY ai_relationship_profiles_update_service_role
  ON public.ai_relationship_profiles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
