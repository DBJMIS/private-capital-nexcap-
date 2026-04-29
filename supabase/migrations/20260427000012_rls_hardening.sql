BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.tenant_id
  FROM public.vc_profiles p
  WHERE p.user_id = auth.uid() OR p.id = auth.uid()
  LIMIT 1;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vc_portfolio_funds',
    'vc_reporting_obligations',
    'vc_capital_calls',
    'vc_capital_call_items',
    'vc_distributions',
    'vc_compliance_actions',
    'vc_user_roles',
    'vc_invitations',
    'vc_role_permissions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'tenant_isolation_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_my_tenant_id())',
        t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
