-- Link fund performance snapshots to reporting obligations + AI extraction metadata
BEGIN;

ALTER TABLE public.vc_fund_snapshots
  ADD COLUMN IF NOT EXISTS source_obligation_id uuid REFERENCES public.vc_reporting_obligations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extraction_confidence jsonb;

CREATE INDEX IF NOT EXISTS idx_vc_fund_snapshots_source_obligation
  ON public.vc_fund_snapshots (source_obligation_id)
  WHERE source_obligation_id IS NOT NULL;

ALTER TABLE public.vc_reporting_obligations
  ADD COLUMN IF NOT EXISTS snapshot_extracted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid REFERENCES public.vc_fund_snapshots (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vc_reporting_obligations_snapshot_id
  ON public.vc_reporting_obligations (snapshot_id)
  WHERE snapshot_id IS NOT NULL;

COMMIT;
