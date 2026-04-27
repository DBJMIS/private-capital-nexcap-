import 'server-only';

import {
  computeEffectiveWeights,
  computeWeightedScore,
  deriveCategory,
  deriveComplianceScore,
  deriveFundLifecycleStage,
  deriveRecommendation,
} from '@/lib/portfolio/assessment-scoring';
import { buildCashFlowsForXirr, computeFundPerformanceMetrics } from '@/lib/portfolio/fund-performance-metrics';
import type {
  DimensionKey,
  DimensionReasoning,
  PortfolioFundRow,
  VcCapitalCall,
  VcCapitalCallItem,
  VcDistribution,
  VcFundNarrativeExtract,
  VcFundSnapshot,
  VcReportingObligation,
} from '@/lib/portfolio/assessment-derivation-types';
import type { VcAssessmentConfig } from '@/types/database';

type Level = 'high' | 'medium' | 'low';

export type DimensionResult = {
  score: number;
  reasoning: DimensionReasoning;
  source_snippets: string[];
  confidence: Level;
};

export function deriveInvestmentStage(
  totalCalled: number,
  commitment: number,
): 'fully_invested' | 'partially_invested' | 'not_yet_deployed' {
  const c = Number(commitment);
  const called = Number(totalCalled);
  if (!Number.isFinite(called) || called <= 0) return 'not_yet_deployed';
  if (!Number.isFinite(c) || c <= 0) return 'partially_invested';
  const ratio = called / c;
  if (ratio >= 0.95) return 'fully_invested';
  return 'partially_invested';
}

function clampScore(n: number): { score: number; clamped: boolean } {
  const c = Math.max(0, Math.min(100, Math.round(n * 100) / 100));
  return { score: c, clamped: c !== n };
}

function snippetList(narrative: VcFundNarrativeExtract | null, keys: string[]): string[] {
  const src = (narrative?.source_snippets ?? null) as Record<string, unknown> | null;
  if (!src) return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = src[k];
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  }
  return out;
}

function indicators(narrative: VcFundNarrativeExtract | null): Record<string, unknown> {
  const x = (narrative?.indicators ?? null) as Record<string, unknown> | null;
  return x ?? {};
}

export function deriveFinancialPerformance(params: {
  fund: PortfolioFundRow;
  latestSnapshot: VcFundSnapshot | null;
  capitalCalls: VcCapitalCall[];
  distributions: VcDistribution[];
}): DimensionResult {
  const { fund, latestSnapshot, capitalCalls, distributions } = params;
  const factors: DimensionReasoning['factors'] = [];
  let score = 50;
  let confidence: Level = 'high';

  const called = capitalCalls.reduce((s, c) => s + Number(c.call_amount ?? 0), 0);
  const distributed = distributions.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const nav = latestSnapshot ? Number(latestSnapshot.nav ?? 0) : 0;
  const asOf = latestSnapshot?.snapshot_date ?? new Date().toISOString().slice(0, 10);
  const pct = fund.dbj_pro_rata_pct ?? null;
  const flows = buildCashFlowsForXirr(capitalCalls, distributions, nav, asOf, pct);
  const m = computeFundPerformanceMetrics(!!fund.is_pvc, called, distributed, nav, flows.dates, flows.amounts, pct);
  const irrPct = m.calculated_irr != null ? Number((m.calculated_irr * 100).toFixed(2)) : null;
  const hurdle = fund.target_irr_pct != null ? Number(fund.target_irr_pct) : null;

  let adj = 0;
  if (irrPct == null || hurdle == null) {
    confidence = 'low';
    factors.push({ label: 'IRR vs hurdle', value: 'Missing', adjustment: 0, detail: 'Could not compare IRR against hurdle' });
  } else if (irrPct < 0) {
    adj = -20;
    factors.push({ label: 'IRR vs hurdle', value: `${irrPct}% vs ${hurdle}%`, adjustment: adj, detail: 'Negative IRR' });
  } else if (irrPct > hurdle) {
    adj = 20;
    factors.push({ label: 'IRR vs hurdle', value: `${irrPct}% vs ${hurdle}%`, adjustment: adj, detail: 'Above target' });
  } else {
    factors.push({ label: 'IRR vs hurdle', value: `${irrPct}% vs ${hurdle}%`, adjustment: 0, detail: 'Below target but non-negative' });
  }
  score += adj;

  const dpi = m.dpi ?? null;
  adj = 0;
  if (dpi != null) {
    if (dpi > 1) adj = 15;
    else if (dpi >= 0.5) adj = 5;
    else if (dpi === 0) {
      const ageY = (new Date(asOf).getTime() - new Date(`${fund.commitment_date}T12:00:00`).getTime()) / (365.25 * 86400000);
      if (ageY > 3) adj = -10;
    }
  }
  factors.push({
    label: 'DPI',
    value: dpi == null ? 'N/A' : `${dpi.toFixed(2)}x`,
    adjustment: adj,
    detail: 'Distribution realization',
  });
  score += adj;

  const tvpi = m.tvpi;
  adj = 0;
  if (tvpi == null) {
    confidence = confidence === 'low' ? 'low' : 'medium';
  } else if (tvpi > 1.5) adj = 10;
  else if (tvpi >= 1.0) adj = 5;
  else adj = -10;
  factors.push({ label: 'TVPI', value: tvpi == null ? 'N/A' : `${tvpi.toFixed(2)}x`, adjustment: adj, detail: 'Value multiple' });
  score += adj;

  adj = 0;
  const deployedPct = fund.dbj_commitment > 0 ? (called / Number(fund.dbj_commitment)) * 100 : 0;
  if (deployedPct > 80) adj = 5;
  else if (deployedPct < 50) {
    const ageY = (new Date(asOf).getTime() - new Date(`${fund.commitment_date}T12:00:00`).getTime()) / (365.25 * 86400000);
    if (ageY > 3) adj = -5;
  }
  factors.push({ label: 'Deployment', value: `${deployedPct.toFixed(1)}% called`, adjustment: adj, detail: 'Capital deployment pace' });
  score += adj;

  const cl = clampScore(score);
  return {
    score: cl.score,
    reasoning: { factors, base_score: 50, final_score: cl.score, clamped: cl.clamped },
    source_snippets: [],
    confidence,
  };
}

export function deriveDevelopmentImpact(params: {
  fund: PortfolioFundRow;
  narrativeExtract: VcFundNarrativeExtract | null;
}): DimensionResult {
  const { fund, narrativeExtract } = params;
  const ind = indicators(narrativeExtract);
  const factors: DimensionReasoning['factors'] = [];
  let score = 50;
  let confidence: Level = 'high';

  const jf = ind.jamaica_focus as boolean | null | undefined;
  let adj = 0;
  if (jf === true) adj = 15;
  else if (jf === false) adj = -10;
  else confidence = 'medium';
  factors.push({ label: 'Jamaica focus', value: jf == null ? 'Unknown' : String(jf), adjustment: adj, detail: 'Narrative indicator' });
  score += adj;

  const sf = ind.sme_focus as boolean | null | undefined;
  adj = 0;
  if (sf === true) adj = 15;
  else if (sf === false) adj = -10;
  else confidence = 'medium';
  factors.push({ label: 'SME focus', value: sf == null ? 'Unknown' : String(sf), adjustment: adj, detail: 'Narrative indicator' });
  score += adj;

  const sectors = (fund.sector_focus ?? []).map((s) => s.toLowerCase());
  const priorities = ['sme', 'small business', 'jamaica', 'financial inclusion', 'agri', 'manufacturing', 'logistics', 'tech'];
  const hit = sectors.filter((s) => priorities.some((p) => s.includes(p))).length;
  adj = hit >= 2 ? 10 : hit === 1 ? 5 : -5;
  factors.push({ label: 'Sector alignment', value: sectors.length ? sectors.join(', ') : 'None', adjustment: adj, detail: 'DBJ priority overlap' });
  score += adj;

  const impactCount = (fund.impact_objectives ?? []).length;
  adj = impactCount >= 3 ? 10 : impactCount >= 1 ? 5 : 0;
  factors.push({ label: 'Impact objectives', value: `${impactCount}`, adjustment: adj, detail: 'Configured objectives count' });
  score += adj;

  const cl = clampScore(score);
  return {
    score: cl.score,
    reasoning: { factors, base_score: 50, final_score: cl.score, clamped: cl.clamped },
    source_snippets: snippetList(narrativeExtract, ['impact_update', 'outlook']),
    confidence,
  };
}

export function deriveFundManagement(params: {
  fund: PortfolioFundRow;
  narrativeExtract: VcFundNarrativeExtract | null;
  complianceScore: number;
}): DimensionResult {
  const { fund, narrativeExtract, complianceScore } = params;
  const ind = indicators(narrativeExtract);
  const factors: DimensionReasoning['factors'] = [];
  let score = 50;
  let confidence: Level = 'high';

  const teamSize = typeof ind.team_size === 'number' ? ind.team_size : null;
  let adj = 0;
  if (teamSize == null) confidence = 'medium';
  else if (teamSize >= 5) adj = 10;
  else if (teamSize < 3) adj = -15;
  factors.push({ label: 'Team size', value: teamSize == null ? 'Unknown' : `${teamSize}`, adjustment: adj, detail: 'Investment team capacity' });
  score += adj;

  const turnover = (ind.team_turnover as string | null | undefined) ?? null;
  adj = turnover === 'none' ? 10 : turnover === 'resolved' ? 5 : turnover === 'ongoing' ? -10 : turnover === 'severe' ? -20 : 0;
  factors.push({ label: 'Team turnover', value: turnover ?? 'Unknown', adjustment: adj, detail: 'Stability of team' });
  if (!turnover) confidence = 'medium';
  score += adj;

  const hasIc = (fund.contacts as unknown[] | null | undefined)?.length ? true : false;
  adj = hasIc ? 10 : -15;
  factors.push({ label: 'Governance coverage', value: hasIc ? 'Contacts present' : 'No committee signal', adjustment: adj, detail: 'Proxy governance indicator' });
  score += adj;

  adj = complianceScore > 80 ? 5 : 0;
  factors.push({ label: 'Reporting quality', value: `${complianceScore.toFixed(1)}%`, adjustment: adj, detail: 'Compliance bridge' });
  score += adj;

  const cl = clampScore(score);
  return {
    score: cl.score,
    reasoning: { factors, base_score: 50, final_score: cl.score, clamped: cl.clamped },
    source_snippets: snippetList(narrativeExtract, ['team_update', 'compliance_update']),
    confidence,
  };
}

export function deriveComplianceGovernance(params: { obligations: VcReportingObligation[] }): DimensionResult {
  const c = deriveComplianceScore(params.obligations);
  const byType = ['quarterly_financial', 'quarterly_investment_mgmt', 'audited_annual', 'inhouse_quarterly'].map((t) => ({
    t,
    rows: params.obligations.filter((o) => o.report_type === t),
  }));
  const factors: DimensionReasoning['factors'] = byType.map(({ t, rows }) => {
    const total = rows.length;
    const good = rows.filter((r) => ['submitted', 'under_review', 'accepted'].includes(r.status)).length;
    const pct = total === 0 ? 0 : (good / total) * 100;
    return {
      label: t,
      value: `${good}/${total} (${pct.toFixed(1)}%)`,
      adjustment: 0,
      detail: 'Compliance rate by report type',
    };
  });
  return {
    score: Math.round(c * 100) / 100,
    reasoning: { factors, base_score: Math.round(c * 100) / 100, final_score: Math.round(c * 100) / 100, clamped: false },
    source_snippets: [],
    confidence: 'high',
  };
}

export function derivePortfolioHealth(params: {
  fund: PortfolioFundRow;
  capitalCallItems: VcCapitalCallItem[];
  capitalCalls: VcCapitalCall[];
  distributions: VcDistribution[];
  latestSnapshot: VcFundSnapshot | null;
  narrativeExtract: VcFundNarrativeExtract | null;
}): DimensionResult {
  const { fund, capitalCallItems, capitalCalls, distributions, latestSnapshot, narrativeExtract } = params;
  const ind = indicators(narrativeExtract);
  const factors: DimensionReasoning['factors'] = [];
  let score = 50;

  const uniqueInvestees = new Set(
    capitalCallItems.filter((i) => i.purpose_category === 'investment' && i.investee_company?.trim()).map((i) => i.investee_company!.trim().toLowerCase()),
  );
  let adj = uniqueInvestees.size >= 4 ? 15 : uniqueInvestees.size >= 2 ? 5 : uniqueInvestees.size === 1 ? -5 : -20;
  factors.push({ label: 'Active investments', value: `${uniqueInvestees.size} companies`, adjustment: adj, detail: 'Diversification proxy' });
  score += adj;

  const called = capitalCalls.reduce((s, c) => s + Number(c.call_amount ?? 0), 0);
  const deployedPct = fund.dbj_commitment > 0 ? (called / Number(fund.dbj_commitment)) * 100 : 0;
  const ageYears = (new Date((latestSnapshot?.snapshot_date ?? new Date().toISOString().slice(0, 10)) + 'T12:00:00').getTime() - new Date(`${fund.commitment_date}T12:00:00`).getTime()) / (365.25 * 86400000);
  adj = 0;
  if (deployedPct < 40 && ageYears > 3) adj = -10;
  else if (deployedPct > 95) adj = -5;
  else adj = 10;
  factors.push({ label: 'Deployment pace', value: `${deployedPct.toFixed(1)}% called`, adjustment: adj, detail: 'Pace versus lifecycle age' });
  score += adj;

  const distributed = distributions.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const dpi = called > 0 ? distributed / called : 0;
  adj = dpi > 0 ? 10 : ageYears > 4 ? -15 : 0;
  factors.push({ label: 'Distributions started', value: `DPI ${dpi.toFixed(2)}x`, adjustment: adj, detail: 'Realization status' });
  score += adj;

  const pipelineCount = typeof ind.pipeline_count === 'number' ? ind.pipeline_count : null;
  adj = pipelineCount == null ? 0 : pipelineCount >= 10 ? 5 : pipelineCount >= 5 ? 0 : -5;
  factors.push({ label: 'Pipeline strength', value: pipelineCount == null ? 'Unknown' : `${pipelineCount}`, adjustment: adj, detail: 'Narrative indicator' });
  score += adj;

  const cl = clampScore(score);
  return {
    score: cl.score,
    reasoning: { factors, base_score: 50, final_score: cl.score, clamped: cl.clamped },
    source_snippets: snippetList(narrativeExtract, ['pipeline_development', 'risk_assessment']),
    confidence: pipelineCount == null ? 'medium' : 'high',
  };
}

export async function deriveAssessment(params: {
  fund: PortfolioFundRow;
  latestSnapshot: VcFundSnapshot | null;
  capitalCalls: VcCapitalCall[];
  capitalCallItems: VcCapitalCallItem[];
  distributions: VcDistribution[];
  obligations: VcReportingObligation[];
  narrativeExtract: VcFundNarrativeExtract | null;
  config: VcAssessmentConfig;
  assessmentDate: string;
  contractualObligation?: boolean;
}) {
  const stage = deriveFundLifecycleStage(params.fund.commitment_date, params.assessmentDate, !!params.fund.is_pvc);
  const effectiveWeights = computeEffectiveWeights(params.config, stage);
  const totalCalled = params.capitalCalls.reduce((sum, c) => sum + Number(c.call_amount ?? 0), 0);
  const investmentStage = deriveInvestmentStage(totalCalled, Number(params.fund.dbj_commitment ?? 0));

  const compliance = deriveComplianceGovernance({ obligations: params.obligations });
  const financial = deriveFinancialPerformance({
    fund: params.fund,
    latestSnapshot: params.latestSnapshot,
    capitalCalls: params.capitalCalls,
    distributions: params.distributions,
  });
  const impact = deriveDevelopmentImpact({ fund: params.fund, narrativeExtract: params.narrativeExtract });
  const management = deriveFundManagement({
    fund: params.fund,
    narrativeExtract: params.narrativeExtract,
    complianceScore: compliance.score,
  });
  const portfolio = derivePortfolioHealth({
    fund: params.fund,
    capitalCallItems: params.capitalCallItems,
    capitalCalls: params.capitalCalls,
    distributions: params.distributions,
    latestSnapshot: params.latestSnapshot,
    narrativeExtract: params.narrativeExtract,
  });

  const dimensions: Record<DimensionKey, DimensionResult> = {
    financial_performance: financial,
    development_impact: impact,
    fund_management: management,
    compliance_governance: compliance,
    portfolio_health: portfolio,
  };

  const weightedTotal = computeWeightedScore(
    {
      financial_performance: financial.score,
      development_impact: impact.score,
      fund_management: management.score,
      compliance_governance: compliance.score,
      portfolio_health: portfolio.score,
    },
    effectiveWeights,
  )!;
  const category = deriveCategory(weightedTotal, params.config);
  const recommendation = deriveRecommendation(category, !!params.contractualObligation);

  return {
    dimensions,
    lifecycleStage: stage,
    investmentStage,
    effectiveWeights,
    weightedTotal,
    category,
    recommendation,
  };
}
