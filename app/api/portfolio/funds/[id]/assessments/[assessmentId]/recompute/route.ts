import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { fetchAssessmentConfigRow } from '@/lib/portfolio/assessment-helpers';
import { tryGenerateAndPersistQuarterlyAiSummary } from '@/lib/portfolio/assessment-ai-summary';
import { deriveAssessment } from '@/lib/portfolio/assessment-derivation';
import { createServerClient } from '@/lib/supabase/server';
import type {
  VcCapitalCall,
  VcCapitalCallItem,
  VcDistribution,
  VcFundNarrativeExtract,
  VcFundSnapshot,
  VcQuarterlyAssessment,
  VcReportingObligation,
} from '@/types/database';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; assessmentId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId, assessmentId } = await ctx.params;
  const supabase = createServerClient();

  const { data: assessment, error: aErr } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .maybeSingle();
  if (aErr || !assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  const a = assessment as VcQuarterlyAssessment;
  if (a.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft assessments can be recomputed.' }, { status: 400 });
  }

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fErr || !fund) return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
  const pf = fund as PortfolioFundRow;

  const [obRes, snapRes, callsRes, distRes, cfgRes, nxRes] = await Promise.all([
    supabase.from('vc_reporting_obligations').select('*').eq('tenant_id', profile.tenant_id).eq('fund_id', fundId),
    supabase.from('vc_fund_snapshots').select('*').eq('tenant_id', profile.tenant_id).eq('fund_id', fundId).order('snapshot_date', { ascending: false }).limit(1),
    supabase.from('vc_capital_calls').select('*').eq('tenant_id', profile.tenant_id).eq('fund_id', fundId),
    supabase.from('vc_distributions').select('*').eq('tenant_id', profile.tenant_id).eq('fund_id', fundId),
    fetchAssessmentConfigRow(supabase, profile.tenant_id),
    supabase.from('vc_fund_narrative_extracts').select('*').eq('tenant_id', profile.tenant_id).eq('fund_id', fundId).order('extracted_at', { ascending: false }).limit(1),
  ]);
  if (obRes.error || snapRes.error || callsRes.error || distRes.error || nxRes.error) {
    return NextResponse.json({ error: obRes.error?.message ?? snapRes.error?.message ?? callsRes.error?.message ?? distRes.error?.message ?? nxRes.error?.message ?? 'Failed to load recompute context' }, { status: 500 });
  }

  const calls = (callsRes.data ?? []) as VcCapitalCall[];
  const callIds = calls.map((c) => c.id);
  let callItems: VcCapitalCallItem[] = [];
  if (callIds.length) {
    const itemsRes = await supabase.from('vc_capital_call_items').select('*').eq('tenant_id', profile.tenant_id).in('capital_call_id', callIds);
    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    callItems = (itemsRes.data ?? []) as VcCapitalCallItem[];
  }

  const derived = await deriveAssessment({
    fund: pf,
    latestSnapshot: (((snapRes.data ?? [])[0] ?? null) as VcFundSnapshot | null),
    capitalCalls: calls,
    capitalCallItems: callItems,
    distributions: (distRes.data ?? []) as VcDistribution[],
    obligations: (obRes.data ?? []) as VcReportingObligation[],
    narrativeExtract: (((nxRes.data ?? [])[0] ?? null) as VcFundNarrativeExtract | null),
    config: cfgRes.row ?? cfgRes.defaults,
    assessmentDate: a.assessment_date,
    contractualObligation: !!a.contractual_obligation,
  });

  const patch = {
    fund_lifecycle_stage: derived.lifecycleStage,
    investment_stage: derived.investmentStage,
    financial_performance_score: derived.dimensions.financial_performance.score,
    development_impact_score: derived.dimensions.development_impact.score,
    fund_management_score: derived.dimensions.fund_management.score,
    compliance_governance_score: derived.dimensions.compliance_governance.score,
    portfolio_health_score: derived.dimensions.portfolio_health.score,
    weighted_total_score: derived.weightedTotal,
    category: derived.category,
    divestment_recommendation: derived.recommendation,
    dimension_reasoning: {
      financial_performance: derived.dimensions.financial_performance.reasoning,
      development_impact: derived.dimensions.development_impact.reasoning,
      fund_management: derived.dimensions.fund_management.reasoning,
      compliance_governance: derived.dimensions.compliance_governance.reasoning,
      portfolio_health: derived.dimensions.portfolio_health.reasoning,
      confidence: {
        financial_performance: derived.dimensions.financial_performance.confidence,
        development_impact: derived.dimensions.development_impact.confidence,
        fund_management: derived.dimensions.fund_management.confidence,
        compliance_governance: derived.dimensions.compliance_governance.confidence,
        portfolio_health: derived.dimensions.portfolio_health.confidence,
      },
      effective_weights: derived.effectiveWeights,
    },
    source_snippets: {
      financial_performance: derived.dimensions.financial_performance.source_snippets,
      development_impact: derived.dimensions.development_impact.source_snippets,
      fund_management: derived.dimensions.fund_management.source_snippets,
      compliance_governance: derived.dimensions.compliance_governance.source_snippets,
      portfolio_health: derived.dimensions.portfolio_health.source_snippets,
    },
    narrative_extract_id: (((nxRes.data ?? [])[0] ?? null) as { id?: string } | null)?.id ?? null,
  };

  const { data: updated, error: upErr } = await supabase
    .from('vc_quarterly_assessments')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .select('*')
    .single();
  if (upErr || !updated) return NextResponse.json({ error: upErr?.message ?? 'Recompute failed' }, { status: 500 });

  try {
    await tryGenerateAndPersistQuarterlyAiSummary(supabase, {
      tenantId: profile.tenant_id,
      fundId,
      assessmentId,
    });
  } catch (e) {
    console.error('[recompute] AI summary regeneration failed', e);
  }

  const { data: final, error: finErr } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .maybeSingle();
  if (finErr) {
    console.error('[recompute] reload after AI summary', finErr);
  }

  return NextResponse.json({ assessment: final ?? updated });
}
