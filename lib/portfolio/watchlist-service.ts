import 'server-only';

import { createServerClient } from '@/lib/supabase/server';
import type { VcAssessmentConfig } from '@/types/database';

type Client = ReturnType<typeof createServerClient>;

export async function updateWatchlistAfterApproval(
  supabase: Client,
  params: {
    fundId: string;
    tenantId: string;
    recommendation: string;
    assessmentId: string;
    config: VcAssessmentConfig;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { fundId, tenantId, recommendation, assessmentId, config } = params;
  const watchRecs = new Set(['watchlist', 'freeze', 'divest']);
  const clearRecs = new Set(['hold', 'monitor']);

  const today = new Date().toISOString().slice(0, 10);

  if (clearRecs.has(recommendation)) {
    const { error } = await supabase.from('vc_watchlist').delete().eq('tenant_id', tenantId).eq('fund_id', fundId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (!watchRecs.has(recommendation)) {
    return { ok: true };
  }

  const { data: existing, error: selErr } = await supabase
    .from('vc_watchlist')
    .select('id, consecutive_quarters, placed_on_watchlist, escalated, escalated_at')
    .eq('tenant_id', tenantId)
    .eq('fund_id', fundId)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };

  const threshold = config.watchlist_escalation_quarters;
  const nextQuarters = existing ? (existing as { consecutive_quarters: number }).consecutive_quarters + 1 : 1;
  const escalated = nextQuarters >= threshold;
  const placed = existing
    ? (existing as { placed_on_watchlist: string }).placed_on_watchlist
    : today;
  const prevEsc = existing ? !!(existing as { escalated: boolean }).escalated : false;
  const prevAt = (existing as { escalated_at: string | null } | null)?.escalated_at ?? null;
  const escalated_at = escalated ? (prevEsc ? prevAt : new Date().toISOString()) : null;

  const row = {
    tenant_id: tenantId,
    fund_id: fundId,
    placed_on_watchlist: placed,
    consecutive_quarters: nextQuarters,
    last_assessment_id: assessmentId,
    escalated,
    escalated_at,
  };

  if (existing) {
    const { error } = await supabase
      .from('vc_watchlist')
      .update(row)
      .eq('id', (existing as { id: string }).id)
      .eq('tenant_id', tenantId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('vc_watchlist').insert(row);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
