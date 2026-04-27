import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_ASSESSMENT_CONFIG, fetchAssessmentConfigRow } from '@/lib/portfolio/assessment-helpers';
import type { VcAssessmentConfig } from '@/types/database';

export const dynamic = 'force-dynamic';

function sumWeights(c: Pick<VcAssessmentConfig, keyof typeof DEFAULT_ASSESSMENT_CONFIG>) {
  return (
    Number(c.weight_financial_performance) +
    Number(c.weight_development_impact) +
    Number(c.weight_fund_management) +
    Number(c.weight_compliance_governance) +
    Number(c.weight_portfolio_health)
  );
}

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { row, defaults } = await fetchAssessmentConfigRow(supabase, profile.tenant_id);
  const config = row ?? defaults;
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as Partial<VcAssessmentConfig>;
  const merged: Omit<VcAssessmentConfig, 'id' | 'created_at' | 'updated_at'> = {
    tenant_id: profile.tenant_id,
    weight_financial_performance: Number(body.weight_financial_performance ?? DEFAULT_ASSESSMENT_CONFIG.weight_financial_performance),
    weight_development_impact: Number(body.weight_development_impact ?? DEFAULT_ASSESSMENT_CONFIG.weight_development_impact),
    weight_fund_management: Number(body.weight_fund_management ?? DEFAULT_ASSESSMENT_CONFIG.weight_fund_management),
    weight_compliance_governance: Number(body.weight_compliance_governance ?? DEFAULT_ASSESSMENT_CONFIG.weight_compliance_governance),
    weight_portfolio_health: Number(body.weight_portfolio_health ?? DEFAULT_ASSESSMENT_CONFIG.weight_portfolio_health),
    lifecycle_early_financial_adj: Number(body.lifecycle_early_financial_adj ?? DEFAULT_ASSESSMENT_CONFIG.lifecycle_early_financial_adj),
    lifecycle_early_management_adj: Number(body.lifecycle_early_management_adj ?? DEFAULT_ASSESSMENT_CONFIG.lifecycle_early_management_adj),
    lifecycle_late_financial_adj: Number(body.lifecycle_late_financial_adj ?? DEFAULT_ASSESSMENT_CONFIG.lifecycle_late_financial_adj),
    lifecycle_late_impact_adj: Number(body.lifecycle_late_impact_adj ?? DEFAULT_ASSESSMENT_CONFIG.lifecycle_late_impact_adj),
    threshold_strong: Number(body.threshold_strong ?? DEFAULT_ASSESSMENT_CONFIG.threshold_strong),
    threshold_adequate: Number(body.threshold_adequate ?? DEFAULT_ASSESSMENT_CONFIG.threshold_adequate),
    threshold_watchlist: Number(body.threshold_watchlist ?? DEFAULT_ASSESSMENT_CONFIG.threshold_watchlist),
    watchlist_escalation_quarters: Number(body.watchlist_escalation_quarters ?? DEFAULT_ASSESSMENT_CONFIG.watchlist_escalation_quarters),
  };

  const wsum = sumWeights(merged);
  if (Math.abs(wsum - 100) > 0.01) {
    return NextResponse.json({ error: `Dimension weights must sum to 100 (currently ${wsum})` }, { status: 400 });
  }

  const supabase = createServerClient();
  const { row } = await fetchAssessmentConfigRow(supabase, profile.tenant_id);

  if (row) {
    const { data, error } = await supabase
      .from('vc_assessment_config')
      .update(merged)
      .eq('tenant_id', profile.tenant_id)
      .eq('id', row.id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath('/settings');
    return NextResponse.json({ config: data });
  }

  const { data, error } = await supabase.from('vc_assessment_config').insert(merged).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/settings');
  return NextResponse.json({ config: data });
}
