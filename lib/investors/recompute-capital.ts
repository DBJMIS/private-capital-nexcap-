/**
 * Keep vc_investors aggregate capital in sync with commitment lines.
 * File path: lib/investors/recompute-capital.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function recomputeInvestorCapital(
  supabase: SupabaseClient,
  tenantId: string,
  investorId: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from('vc_investor_commitments')
    .select('committed_amount_usd, deployed_amount_usd')
    .eq('tenant_id', tenantId)
    .eq('investor_id', investorId);

  let committed = 0;
  let deployed = 0;
  for (const r of rows ?? []) {
    committed += Number(r.committed_amount_usd);
    deployed += Number((r as { deployed_amount_usd?: number }).deployed_amount_usd ?? 0);
  }

  await supabase
    .from('vc_investors')
    .update({
      committed_capital_usd: committed,
      deployed_capital_usd: deployed,
    })
    .eq('id', investorId)
    .eq('tenant_id', tenantId);
}

export function utilizationPercent(committed: number, deployed: number): number | null {
  if (!Number.isFinite(committed) || committed <= 0) return null;
  return Math.round((deployed / committed) * 10000) / 100;
}

export function isUnderDeployed(committed: number, deployed: number, threshold = 0.5): boolean {
  if (!Number.isFinite(committed) || committed <= 0) return false;
  return deployed / committed < threshold;
}
