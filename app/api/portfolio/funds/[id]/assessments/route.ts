import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { fetchAssessmentConfigRow } from '@/lib/portfolio/assessment-helpers';
import { deriveAssessment } from '@/lib/portfolio/assessment-derivation';
import { tryGenerateAndPersistQuarterlyAiSummary } from '@/lib/portfolio/assessment-ai-summary';
import { createServerClient } from '@/lib/supabase/server';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type {
  VcCapitalCall,
  VcCapitalCallItem,
  VcDistribution,
  VcFundNarrativeExtract,
  VcFundSnapshot,
  VcReportingObligation,
} from '@/types/database';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function profileNameMap(supabase: ReturnType<typeof createServerClient>, ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))];
  if (u.length === 0) return new Map<string, string>();
  const { data } = await supabase.from('vc_profiles').select('id, full_name').in('id', u);
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    const r = p as { id: string; full_name: string };
    m.set(r.id, r.full_name?.trim() || '—');
  }
  return m;
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fErr || !fund) return NextResponse.json({ error: 'Fund not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('assessment_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const ids = list.flatMap((r) => {
    const x = r as { assessed_by: string | null; approved_by: string | null };
    return [x.assessed_by, x.approved_by].filter((v): v is string => !!v);
  });
  const names = await profileNameMap(supabase, ids);

  const enriched = list.map((r) => {
    const row = r as {
      assessed_by: string | null;
      approved_by: string | null;
    };
    return {
      ...r,
      assessed_by_name: row.assessed_by ? names.get(row.assessed_by) ?? '—' : null,
      approved_by_name: row.approved_by ? names.get(row.approved_by) ?? '—' : null,
    };
  });

  return NextResponse.json({ assessments: enriched });
}

export async function POST(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId } = await ctx.params;
  const body = (await req.json()) as { assessment_period?: string; assessment_date?: string };

  const period = body.assessment_period?.trim();
  if (!period) {
    return NextResponse.json({ error: 'assessment_period is required' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: fund, error: fundErr } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fundErr || !fund) return NextResponse.json({ error: 'Fund not found' }, { status: 404 });

  const assessmentDate =
    body.assessment_date && /^\d{4}-\d{2}-\d{2}$/.test(body.assessment_date.trim())
      ? body.assessment_date.trim()
      : new Date().toISOString().slice(0, 10);
  const f = fund as PortfolioFundRow;

  const [obRes, snapRes, callsRes, distRes, cfgRes, nxRes] = await Promise.all([
    supabase
      .from('vc_reporting_obligations')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId),
    supabase
      .from('vc_fund_snapshots')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .order('snapshot_date', { ascending: false })
      .limit(1),
    supabase
      .from('vc_capital_calls')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId),
    supabase
      .from('vc_distributions')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId),
    fetchAssessmentConfigRow(supabase, profile.tenant_id),
    supabase
      .from('vc_fund_narrative_extracts')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .order('extracted_at', { ascending: false })
      .limit(1),
  ]);
  if (obRes.error) return NextResponse.json({ error: obRes.error.message }, { status: 500 });
  if (snapRes.error) return NextResponse.json({ error: snapRes.error.message }, { status: 500 });
  if (callsRes.error) return NextResponse.json({ error: callsRes.error.message }, { status: 500 });
  if (distRes.error) return NextResponse.json({ error: distRes.error.message }, { status: 500 });
  if (nxRes.error) return NextResponse.json({ error: nxRes.error.message }, { status: 500 });

  const calls = (callsRes.data ?? []) as VcCapitalCall[];
  const dists = (distRes.data ?? []) as VcDistribution[];
  const obligations = (obRes.data ?? []) as VcReportingObligation[];
  const latestSnapshot = ((snapRes.data ?? [])[0] ?? null) as VcFundSnapshot | null;
  const narrativeExtract = ((nxRes.data ?? [])[0] ?? null) as VcFundNarrativeExtract | null;

  const callIds = calls.map((c) => c.id);
  let callItems: VcCapitalCallItem[] = [];
  if (callIds.length > 0) {
    const itemsRes = await supabase
      .from('vc_capital_call_items')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('capital_call_id', callIds);
    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    callItems = (itemsRes.data ?? []) as VcCapitalCallItem[];
  }

  const cfg = cfgRes.row ?? cfgRes.defaults;
  const { data: ddAssess } = f.application_id
    ? await supabase
        .from('vc_assessments')
        .select('id, recommendation, overall_weighted_score, overall_score, completed_at, created_at, status')
        .eq('tenant_id', profile.tenant_id)
        .eq('application_id', f.application_id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const dd = ddAssess as
    | {
        id: string;
        recommendation: string | null;
        overall_weighted_score: number | null;
        overall_score: number | null;
        completed_at: string | null;
      }
    | null;
  const derived = await deriveAssessment({
    fund: f,
    latestSnapshot,
    capitalCalls: calls,
    capitalCallItems: callItems,
    distributions: dists,
    obligations,
    narrativeExtract,
    config: cfg,
    assessmentDate,
    contractualObligation: false,
  });

  const insert: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    fund_id: fundId,
    assessment_date: assessmentDate,
    assessment_period: period,
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
    dimension_overrides: {},
    narrative_extract_id: narrativeExtract?.id ?? null,
    dd_assessment_id: dd?.id ?? null,
    dd_outcome_at_commitment: dd?.recommendation ?? null,
    contractual_obligation: false,
    status: 'draft' as const,
    assessed_by: profile.profile_id,
  };

  const { data: created, error } = await supabase.from('vc_quarterly_assessments').insert(insert).select('*').single();
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('vc_quarterly_assessments')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('fund_id', fundId)
        .eq('assessment_period', period)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: 'An assessment for this period already exists.' }, { status: 409 });
      }
      const ex = existing as { id: string; status: string };
      if (ex.status === 'draft') {
        return NextResponse.json({ assessment: existing, redirected: true }, { status: 200 });
      }
      if (ex.status === 'submitted' || ex.status === 'approved') {
        const periodLabel = period.replace('-', ' ');
        return NextResponse.json(
          {
            error: `An assessment for ${periodLabel} already exists with status ${ex.status}. View it or select a different period.`,
            assessment_id: ex.id,
            status: ex.status,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `An assessment for this period already exists with status ${ex.status}.`, assessment_id: ex.id, status: ex.status },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const createdId = (created as { id: string }).id;
  try {
    await tryGenerateAndPersistQuarterlyAiSummary(supabase, {
      tenantId: profile.tenant_id,
      fundId,
      assessmentId: createdId,
    });
  } catch (e) {
    console.error('[assessments POST] AI summary generation failed', e);
  }

  const { data: withSummary, error: fetchErr } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', createdId)
    .maybeSingle();
  if (fetchErr) {
    console.error('[assessments POST] reload after AI summary', fetchErr);
  }

  return NextResponse.json({ assessment: withSummary ?? created });
}
