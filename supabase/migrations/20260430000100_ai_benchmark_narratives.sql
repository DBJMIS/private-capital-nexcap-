BEGIN;

CREATE TABLE IF NOT EXISTS public.benchmark_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  index_name text NOT NULL,
  vintage_year integer NOT NULL,
  asset_class text NOT NULL,
  geography text NOT NULL,
  median_irr numeric NOT NULL,
  top_quartile_irr numeric NOT NULL,
  median_moic numeric NOT NULL,
  top_quartile_moic numeric NOT NULL,
  source text NOT NULL,
  as_of_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_benchmark_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('full_portfolio', 'by_fund')),
  fund_id uuid REFERENCES public.vc_portfolio_funds(id) ON DELETE SET NULL,
  narrative text NOT NULL,
  headline_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_narratives_scope_created
  ON public.ai_benchmark_narratives (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_narratives_fund_created
  ON public.ai_benchmark_narratives (fund_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_indices_asset_geo
  ON public.benchmark_indices (asset_class, geography, as_of_date DESC);

INSERT INTO public.benchmark_indices (
  index_name,
  vintage_year,
  asset_class,
  geography,
  median_irr,
  top_quartile_irr,
  median_moic,
  top_quartile_moic,
  source,
  as_of_date
)
SELECT
  v.index_name,
  v.vintage_year,
  v.asset_class,
  v.geography,
  v.median_irr,
  v.top_quartile_irr,
  v.median_moic,
  v.top_quartile_moic,
  v.source,
  v.as_of_date
FROM (
  VALUES
    (
      'Cambridge Associates Global VC Benchmark (Reference)',
      2024,
      'venture_capital',
      'global',
      12.0,
      25.0,
      1.8,
      3.2,
      'Cambridge Associates (reference values for internal benchmarking)',
      DATE '2024-12-31'
    ),
    (
      'Cambridge Associates Emerging Markets PE (Reference)',
      2024,
      'private_equity',
      'emerging_markets',
      10.0,
      19.0,
      1.6,
      2.8,
      'Cambridge Associates (reference values for internal benchmarking)',
      DATE '2024-12-31'
    ),
    (
      'Caribbean Regional PE (Estimated Reference)',
      2024,
      'private_equity',
      'caribbean',
      9.0,
      16.0,
      1.5,
      2.4,
      'Regional estimate (reference values for internal benchmarking)',
      DATE '2024-12-31'
    )
) AS v(
  index_name,
  vintage_year,
  asset_class,
  geography,
  median_irr,
  top_quartile_irr,
  median_moic,
  top_quartile_moic,
  source,
  as_of_date
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.benchmark_indices b
  WHERE b.index_name = v.index_name
    AND b.vintage_year = v.vintage_year
    AND b.as_of_date = v.as_of_date
);

ALTER TABLE public.benchmark_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_narratives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS benchmark_indices_select_authenticated ON public.benchmark_indices;
CREATE POLICY benchmark_indices_select_authenticated
  ON public.benchmark_indices
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS benchmark_indices_insert_service_role ON public.benchmark_indices;
CREATE POLICY benchmark_indices_insert_service_role
  ON public.benchmark_indices
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_benchmark_narratives_select_authenticated ON public.ai_benchmark_narratives;
CREATE POLICY ai_benchmark_narratives_select_authenticated
  ON public.ai_benchmark_narratives
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_benchmark_narratives_insert_service_role ON public.ai_benchmark_narratives;
CREATE POLICY ai_benchmark_narratives_insert_service_role
  ON public.ai_benchmark_narratives
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMIT;
