-- Portfolio monitoring: snapshot trends, alert flags, investment cache, storage for reports.
BEGIN;

ALTER TABLE public.vc_portfolio_snapshots
  ADD COLUMN IF NOT EXISTS revenue_trend varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS valuation_trend varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS alert_flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.vc_portfolio_snapshots
  DROP CONSTRAINT IF EXISTS vc_portfolio_snapshots_revenue_trend_ck;

ALTER TABLE public.vc_portfolio_snapshots
  ADD CONSTRAINT vc_portfolio_snapshots_revenue_trend_ck CHECK (
    revenue_trend IS NULL OR revenue_trend IN ('improving', 'stable', 'declining')
  );

ALTER TABLE public.vc_portfolio_snapshots
  DROP CONSTRAINT IF EXISTS vc_portfolio_snapshots_valuation_trend_ck;

ALTER TABLE public.vc_portfolio_snapshots
  ADD CONSTRAINT vc_portfolio_snapshots_valuation_trend_ck CHECK (
    valuation_trend IS NULL OR valuation_trend IN ('improving', 'stable', 'declining')
  );

ALTER TABLE public.vc_investments
  ADD COLUMN IF NOT EXISTS portfolio_reviewer_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portfolio_last_snapshot_date date NULL,
  ADD COLUMN IF NOT EXISTS portfolio_latest_score numeric NULL;

COMMENT ON COLUMN public.vc_investments.portfolio_reviewer_id IS 'Assigned portfolio monitoring reviewer.';
COMMENT ON COLUMN public.vc_investments.portfolio_last_snapshot_date IS 'Date of latest performance snapshot.';
COMMENT ON COLUMN public.vc_investments.portfolio_latest_score IS 'Latest computed performance score (0–100).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-monitoring',
  'portfolio-monitoring',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS portfolio_monitoring_storage_select ON storage.objects;
DROP POLICY IF EXISTS portfolio_monitoring_storage_insert ON storage.objects;
DROP POLICY IF EXISTS portfolio_monitoring_storage_update ON storage.objects;
DROP POLICY IF EXISTS portfolio_monitoring_storage_delete ON storage.objects;

CREATE POLICY portfolio_monitoring_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'portfolio-monitoring'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
  );

CREATE POLICY portfolio_monitoring_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-monitoring'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
  );

CREATE POLICY portfolio_monitoring_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portfolio-monitoring'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
  );

CREATE POLICY portfolio_monitoring_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio-monitoring'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
  );

COMMIT;
