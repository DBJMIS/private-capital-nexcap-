import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, VcAssessmentConfig } from '@/types/database';

type Client = SupabaseClient<Database>;

export const DEFAULT_ASSESSMENT_CONFIG: Omit<VcAssessmentConfig, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  weight_financial_performance: 30,
  weight_development_impact: 25,
  weight_fund_management: 20,
  weight_compliance_governance: 15,
  weight_portfolio_health: 10,
  lifecycle_early_financial_adj: -10,
  lifecycle_early_management_adj: 10,
  lifecycle_late_financial_adj: 10,
  lifecycle_late_impact_adj: -10,
  threshold_strong: 70,
  threshold_adequate: 50,
  threshold_watchlist: 30,
  watchlist_escalation_quarters: 2,
};

export async function fetchAssessmentConfigRow(
  supabase: Client,
  tenantId: string,
): Promise<{ row: VcAssessmentConfig | null; defaults: VcAssessmentConfig }> {
  const { data } = await supabase.from('vc_assessment_config').select('*').eq('tenant_id', tenantId).maybeSingle();

  const base = DEFAULT_ASSESSMENT_CONFIG;
  const defaults: VcAssessmentConfig = {
    id: '00000000-0000-0000-0000-000000000000',
    tenant_id: tenantId,
    ...base,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { row: (data as VcAssessmentConfig | null) ?? null, defaults };
}
