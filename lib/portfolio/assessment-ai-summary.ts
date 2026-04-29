import 'server-only';

import { summarizeCompliance } from '@/lib/portfolio/compliance';
import { pickLatestSnapshot } from '@/lib/portfolio/fund-performance-metrics';
import { callClaudeJson } from '@/lib/prequalification/claude';
import type { ObligationLite } from '@/lib/portfolio/compliance';
import type { VcFundSnapshot, VcQuarterlyAssessment } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/** System prompt for quarterly AI summary; `/assessments/.../ai-summary` and auto-run paths use this only. */
export const QUARTERLY_ASSESSMENT_AI_SUMMARY_SYSTEM = [
  'You write concise institutional summaries for a development finance institution oversight committee.',
  'Respond with plain prose only — no JSON, no markdown headings, no bullet lists unless essential.',
  'Length: 150–200 words. Formal, precise, risk-aware tone.',
].join(' ');

type FundHead = {
  fund_name: string;
  is_pvc: boolean | null;
};

function buildUserText(
  fund: FundHead,
  a: VcQuarterlyAssessment,
  comp: ReturnType<typeof summarizeCompliance>,
  latest: VcFundSnapshot | null,
): string {
  return [
    `Fund: ${fund.fund_name}`,
    `Assessment period: ${a.assessment_period}`,
    `Lifecycle stage: ${a.fund_lifecycle_stage}`,
    `PVC: ${fund.is_pvc ? 'yes' : 'no'}`,
    '',
    'Dimension scores (0–100):',
    `Financial performance: ${a.financial_performance_score ?? '—'}`,
    `Development impact: ${a.development_impact_score ?? '—'}`,
    `Fund management: ${a.fund_management_score ?? '—'}`,
    `Compliance & governance: ${a.compliance_governance_score ?? '—'}`,
    `Portfolio health: ${a.portfolio_health_score ?? '—'}`,
    `Weighted total: ${a.weighted_total_score ?? '—'}`,
    `Category: ${a.category ?? '—'}`,
    `Divestment recommendation: ${a.divestment_recommendation ?? '—'}`,
    '',
    'Commentaries:',
    a.financial_commentary ? `Financial: ${a.financial_commentary}` : 'Financial: —',
    a.impact_commentary ? `Impact: ${a.impact_commentary}` : 'Impact: —',
    a.management_commentary ? `Management: ${a.management_commentary}` : 'Management: —',
    a.compliance_commentary ? `Compliance: ${a.compliance_commentary}` : 'Compliance: —',
    a.portfolio_commentary ? `Portfolio: ${a.portfolio_commentary}` : 'Portfolio: —',
    '',
    `Compliance engine summary: status=${comp.compliance_status}; overdue=${comp.overdue}; outstanding=${comp.outstanding}`,
    '',
    latest
      ? `Latest performance snapshot (as of ${latest.snapshot_date}): NAV=${latest.nav}; reported IRR (decimal)=${latest.reported_irr ?? 'n/a'}.`
      : 'No performance snapshot on file.',
  ].join('\n');
}

export type GenerateQuarterlyAiSummaryResult =
  | { ok: true; summary: string }
  | { ok: false; error: string; status: 404 | 500 | 502 | 503 };

/**
 * Same prompt/model/params as the `/ai-summary` API route. Returns errors for HTTP mapping.
 */
export async function generateAndPersistQuarterlyAiSummary(
  supabase: SupabaseClient,
  ctx: { tenantId: string; fundId: string; assessmentId: string },
): Promise<GenerateQuarterlyAiSummaryResult> {
  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('fund_name, commitment_date, is_pvc, fund_category, sector_focus, impact_objectives')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', ctx.fundId)
    .maybeSingle();
  if (fErr || !fund) {
    return { ok: false, error: fErr?.message ?? 'Fund not found', status: 404 };
  }

  const { data: row, error: aErr } = await supabase
    .from('vc_quarterly_assessments')
    .select(
      'id, tenant_id, fund_id, assessment_period, fund_lifecycle_stage, financial_performance_score, development_impact_score, fund_management_score, compliance_governance_score, portfolio_health_score, weighted_total_score, category, divestment_recommendation, financial_commentary, impact_commentary, management_commentary, compliance_commentary, portfolio_commentary',
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('fund_id', ctx.fundId)
    .eq('id', ctx.assessmentId)
    .maybeSingle();
  if (aErr || !row) {
    return { ok: false, error: aErr?.message ?? 'Assessment not found', status: 404 };
  }
  const a = row as VcQuarterlyAssessment;

  const { data: obs } = await supabase
    .from('vc_reporting_obligations')
    .select('report_type, status, due_date')
    .eq('tenant_id', ctx.tenantId)
    .eq('fund_id', ctx.fundId);
  const comp = summarizeCompliance((obs ?? []) as ObligationLite[]);

  const { data: snaps } = await supabase
    .from('vc_fund_snapshots')
    .select('id, fund_id, snapshot_date, nav, reported_irr')
    .eq('tenant_id', ctx.tenantId)
    .eq('fund_id', ctx.fundId)
    .order('snapshot_date', { ascending: false });
  const latest = pickLatestSnapshot((snaps ?? []) as VcFundSnapshot[]);

  const userText = buildUserText(fund as FundHead, a, comp, latest);

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not configured', status: 503 };
  }

  const claude = await callClaudeJson({
    apiKey,
    model,
    system: QUARTERLY_ASSESSMENT_AI_SUMMARY_SYSTEM,
    userText,
    maxTokens: 500,
  });
  if (!claude.ok) {
    return { ok: false, error: claude.error, status: 502 };
  }
  const summary = claude.text.trim();
  const { error: uErr } = await supabase
    .from('vc_quarterly_assessments')
    .update({
      ai_summary: summary,
      ai_generated_at: new Date().toISOString(),
    })
    .eq('id', ctx.assessmentId)
    .eq('tenant_id', ctx.tenantId)
    .eq('fund_id', ctx.fundId);
  if (uErr) {
    return { ok: false, error: uErr.message, status: 500 };
  }

  return { ok: true, summary };
}

/**
 * Best-effort: generate AI summary and persist. Does not throw; logs failures.
 * Use after assessment create / recompute so creation is never blocked.
 */
export async function tryGenerateAndPersistQuarterlyAiSummary(
  supabase: SupabaseClient,
  ctx: { tenantId: string; fundId: string; assessmentId: string },
): Promise<void> {
  try {
    const result = await generateAndPersistQuarterlyAiSummary(supabase, ctx);
    if (!result.ok) {
      console.error('[assessment-ai-summary] generation failed', result.error, { status: result.status });
    }
  } catch (e) {
    console.error('[assessment-ai-summary] unexpected', e);
  }
}
