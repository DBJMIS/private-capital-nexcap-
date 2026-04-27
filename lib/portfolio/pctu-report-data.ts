import 'server-only';

import { createServerClient } from '@/lib/supabase/server';
import { num } from '@/lib/portfolio/capital-calls';
import { summarizeCompliance, type ObligationLite } from '@/lib/portfolio/compliance';
import {
  applyDbjNavShareForMetrics,
  calledThroughDate,
  metricsForSnapshot,
  pickLatestSnapshot,
  type FundPerformanceMetrics,
} from '@/lib/portfolio/fund-performance-metrics';
import { parsePctuProfile } from '@/lib/portfolio/pctu-profile-parse';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type {
  PctuMoney,
  PctuReportNarrativeAllocations,
  PctuReportNarrativeCapitalAccount,
  PctuReportNarrativeFundMeta,
  PctuReportNarrativeLpRow,
  PctuReportNarrativePipeline,
  PctuReportPayload,
} from '@/lib/portfolio/pctu-report-types';
import type { Json } from '@/types/database';
import type {
  VcCapitalCall,
  VcCapitalCallItem,
  VcDistribution,
  VcFundNarrativeExtract,
  VcFundSnapshot,
  VcQuarterlyAssessment,
} from '@/types/database';

const QUARTER_RANGE: Record<number, string> = {
  1: 'January - March',
  2: 'April - June',
  3: 'July - September',
  4: 'October - December',
};

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DIVESTMENT_RETURN_TYPES = new Set<string>(['capital_gain', 'return_of_capital']);

function money(currency: string, amount: number): PctuMoney {
  return { currency, amount: Number.isFinite(amount) ? amount : 0 };
}

function unknownStr(v: string | null | undefined): string {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length > 0 ? t : 'Unknown';
}

function labelMoneyDisplay(m: PctuMoney | null): string {
  if (!m || !Number.isFinite(m.amount)) return 'Unknown';
  return `${m.currency} ${m.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function readNarrativeMoney(raw: unknown): PctuMoney | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const cur = typeof o.currency === 'string' ? o.currency : '';
  const amt = typeof o.amount === 'number' ? o.amount : Number(o.amount);
  if (!cur || !Number.isFinite(amt)) return null;
  return { currency: cur, amount: amt };
}

function buildNarrativeFundMeta(
  narrative: VcFundNarrativeExtract | null,
  fund: PortfolioFundRow,
  currency: string,
): PctuReportNarrativeFundMeta {
  const fpRaw = narrative?.fund_profile;
  const fp = fpRaw && typeof fpRaw === 'object' && !Array.isArray(fpRaw) ? (fpRaw as Record<string, unknown>) : null;
  const vintage = fp?.fund_vintage;
  const fund_vintage = typeof vintage === 'number' && Number.isFinite(vintage) ? String(vintage) : 'Unknown';
  const narrSize = readNarrativeMoney(fp?.fund_size);
  const totalCommitNum = num(fund.total_fund_commitment);
  const fund_size =
    narrSize != null
      ? labelMoneyDisplay(narrSize)
      : totalCommitNum > 0
        ? labelMoneyDisplay(money(currency, totalCommitNum))
        : 'Unknown';
  const first_close = unknownStr(typeof fp?.first_close === 'string' ? fp.first_close : null);
  const fl = fp?.fund_life_years;
  const fund_life_years = typeof fl === 'number' && Number.isFinite(fl) ? String(fl) : 'Unknown';
  const final_close = unknownStr(typeof fp?.final_close === 'string' ? fp.final_close : null);
  const yeNarr = typeof fp?.year_end === 'string' ? fp.year_end.trim() : '';
  const yem = fund.year_end_month;
  const year_end =
    yeNarr.length > 0 ? yeNarr : yem >= 1 && yem <= 12 ? (MONTH_LONG[yem - 1] ?? 'Unknown') : 'Unknown';
  const fund_strategy_summary = unknownStr(typeof fp?.fund_strategy_summary === 'string' ? fp.fund_strategy_summary : null);
  return { fund_vintage, fund_size, first_close, fund_life_years, final_close, year_end, fund_strategy_summary };
}

function buildNarrativeAllocations(narrative: VcFundNarrativeExtract | null): PctuReportNarrativeAllocations {
  const raw = narrative?.allocations;
  const a = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const sectors: PctuReportNarrativeAllocations['sectors'] = [];
  const geographic: PctuReportNarrativeAllocations['geographic'] = [];
  if (a && Array.isArray(a.sector)) {
    for (const row of a.sector) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const p = typeof r.percentage === 'number' ? r.percentage : Number(r.percentage);
      if (!name || !Number.isFinite(p)) continue;
      sectors.push({ label: name, percentage: `${p}%` });
    }
  }
  if (a && Array.isArray(a.geographic)) {
    for (const row of a.geographic) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const country = typeof r.country === 'string' ? r.country.trim() : '';
      const p = typeof r.percentage === 'number' ? r.percentage : Number(r.percentage);
      if (!country || !Number.isFinite(p)) continue;
      geographic.push({ label: country, percentage: `${p}%` });
    }
  }
  return { sectors, geographic };
}

function buildNarrativeLps(narrative: VcFundNarrativeExtract | null): PctuReportNarrativeLpRow[] {
  const raw = narrative?.fund_lps;
  if (!Array.isArray(raw)) return [];
  const out: PctuReportNarrativeLpRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name.length) continue;
    const pct = typeof r.percentage === 'number' ? r.percentage : Number(r.percentage);
    const m = readNarrativeMoney(r.commitment);
    out.push({
      name,
      commitment: m ? labelMoneyDisplay(m) : 'Unknown',
      percentage: Number.isFinite(pct) ? `${pct}%` : 'Unknown',
    });
  }
  return out;
}

function buildNarrativePipeline(narrative: VcFundNarrativeExtract | null): PctuReportNarrativePipeline {
  const raw = narrative?.pipeline_stats;
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const dc = o?.deal_count;
  const deal_count = typeof dc === 'number' && Number.isFinite(dc) ? String(dc) : 'Unknown';
  const pipeline_value = labelMoneyDisplay(readNarrativeMoney(o?.pipeline_value));
  const ls = o?.largest_sectors;
  let largest_sectors = 'Unknown';
  if (Array.isArray(ls)) {
    const xs = ls.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
    if (xs.length) largest_sectors = xs.join(', ');
  }
  const ts = o?.term_sheets_issued;
  const term_sheets_issued = typeof ts === 'number' && Number.isFinite(ts) ? String(ts) : 'Unknown';
  const term_sheets_value = labelMoneyDisplay(readNarrativeMoney(o?.term_sheets_value));
  return { deal_count, pipeline_value, largest_sectors, term_sheets_issued, term_sheets_value };
}

function buildNarrativeCapitalAccount(narrative: VcFundNarrativeExtract | null): PctuReportNarrativeCapitalAccount {
  const raw = narrative?.capital_account_detail;
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const f = (k: string) => labelMoneyDisplay(readNarrativeMoney(o?.[k]));
  return {
    portfolio_drawdowns: f('portfolio_drawdowns'),
    fee_drawdowns: f('fee_drawdowns'),
    management_fees: f('management_fees'),
    administrative_fees: f('administrative_fees'),
    other_fund_fees: f('other_fund_fees'),
  };
}

function parseYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getTime();
}

function buildReportTitle(assessmentPeriod: string): { report_title: string; period_label: string } {
  const period_label = assessmentPeriod.trim();
  const m = period_label.match(/^Q([1-4])[\s-]+(\d{4})$/i);
  if (m) {
    const q = Number(m[1]);
    const y = m[2];
    const range = QUARTER_RANGE[q] ?? period_label;
    return {
      report_title: `Quarterly Funds Review Report (${range} ${y})`,
      period_label,
    };
  }
  return {
    report_title: `Quarterly Funds Review Report (${period_label})`,
    period_label,
  };
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.includes('T') ? iso.slice(0, 10) : iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function complianceEngineNarrative(rows: ObligationLite[]): string {
  const s = summarizeCompliance(rows);
  const st = s.compliance_status.replace(/_/g, ' ');
  return `Reporting obligations: ${s.total_obligations} total; ${s.outstanding} outstanding; ${s.overdue} overdue; overall status: ${st}.`;
}

function sumItemsByCategory(items: VcCapitalCallItem[], categories: Set<string>): number {
  let sum = 0;
  for (const it of items) {
    if (categories.has(it.purpose_category)) {
      sum += num(it.amount);
    }
  }
  return sum;
}

/**
 * Loads and normalizes all data required for the PCTU quarterly review HTML/PDF.
 * Enforces tenant isolation and approved-assessment-only policy.
 */
export async function assemblePctuReportData(
  tenantId: string,
  fundId: string,
  assessmentId: string,
): Promise<PctuReportPayload> {
  const supabase = createServerClient();

  const { data: assessmentRow, error: aErr } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .maybeSingle();

  if (aErr) throw new Error(aErr.message);
  if (!assessmentRow) throw new Error('Assessment not found');

  const assessment = assessmentRow as VcQuarterlyAssessment;
  if (assessment.status !== 'approved') {
    throw new Error('Report can only be generated for approved assessments');
  }

  const asOfDate = assessment.assessment_date;

  const [
    fundRes,
    callsRes,
    distRes,
    snapsRes,
    obsRes,
  ] = await Promise.all([
    supabase.from('vc_portfolio_funds').select('*').eq('tenant_id', tenantId).eq('id', fundId).maybeSingle(),
    supabase.from('vc_capital_calls').select('*').eq('tenant_id', tenantId).eq('fund_id', fundId).order('notice_number', { ascending: true }),
    supabase.from('vc_distributions').select('*').eq('tenant_id', tenantId).eq('fund_id', fundId).order('distribution_date', { ascending: true }),
    supabase.from('vc_fund_snapshots').select('*').eq('tenant_id', tenantId).eq('fund_id', fundId),
    supabase.from('vc_reporting_obligations').select('report_type, status, due_date').eq('tenant_id', tenantId).eq('fund_id', fundId),
  ]);

  if (fundRes.error) throw new Error(fundRes.error.message);
  if (!fundRes.data) throw new Error('Fund not found');
  if (callsRes.error) throw new Error(callsRes.error.message);
  if (distRes.error) throw new Error(distRes.error.message);
  if (snapsRes.error) throw new Error(snapsRes.error.message);
  if (obsRes.error) throw new Error(obsRes.error.message);

  const fund = fundRes.data as PortfolioFundRow & { pctu_profile?: Json | null };
  const calls = (callsRes.data ?? []) as VcCapitalCall[];
  const distributions = (distRes.data ?? []) as VcDistribution[];
  const allSnapshots = (snapsRes.data ?? []) as VcFundSnapshot[];
  const obligationRows = (obsRes.data ?? []) as ObligationLite[];

  const snapshotsAtDate = allSnapshots.filter((s) => parseYmd(s.snapshot_date) <= parseYmd(asOfDate));
  const snapshot = pickLatestSnapshot(snapshotsAtDate);

  let narrative: VcFundNarrativeExtract | null = null;
  if (assessment.narrative_extract_id) {
    const { data: nx, error: nxErr } = await supabase
      .from('vc_fund_narrative_extracts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', assessment.narrative_extract_id)
      .maybeSingle();
    if (nxErr) throw new Error(nxErr.message);
    narrative = nx as VcFundNarrativeExtract | null;
  }

  const callIds = calls.map((c) => c.id);
  let items: VcCapitalCallItem[] = [];
  if (callIds.length > 0) {
    const { data: itemRows, error: iErr } = await supabase
      .from('vc_capital_call_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('capital_call_id', callIds);
    if (iErr) throw new Error(iErr.message);
    items = (itemRows ?? []) as VcCapitalCallItem[];
  }

  const currency = fund.currency === 'JMD' ? 'JMD' : 'USD';
  const profile = parsePctuProfile(fund.pctu_profile ?? null);

  const investmentSet = new Set<string>(['investment']);
  const managementSet = new Set<string>(['management_fee']);
  const adminSet = new Set<string>(['administration_fee']);
  const otherFeeSet = new Set<string>([
    'organisation_expenses',
    'legal_fees',
    'director_fees',
    'regulatory_expenses',
    'other_fees',
  ]);
  const feeCategories = new Set<string>([...managementSet, ...adminSet, ...otherFeeSet]);

  const portfolio_draw = sumItemsByCategory(items, investmentSet);
  const management_fees = sumItemsByCategory(items, managementSet);
  const administrative_fees = sumItemsByCategory(items, adminSet);
  const other_fund_fees = sumItemsByCategory(items, otherFeeSet);
  let fee_drawdowns = 0;
  for (const it of items) {
    if (feeCategories.has(it.purpose_category)) fee_drawdowns += num(it.amount);
  }

  let total_drawdown_inception = portfolio_draw + fee_drawdowns;
  if (items.length === 0 && calls.length > 0) {
    total_drawdown_inception = calls.filter((c) => c.status !== 'cancelled').reduce((s, c) => s + num(c.call_amount), 0);
  }

  const totalCommitNum = num(fund.total_fund_commitment);
  const remainingFund = Math.max(0, totalCommitNum - total_drawdown_inception);

  const dbjCommit = num(fund.dbj_commitment);
  const dbjDrawdown = calledThroughDate(calls, asOfDate);
  const dbjRemaining = Math.max(0, dbjCommit - dbjDrawdown);

  const investees = new Set<string>();
  let portfolioInvestSum = 0;
  const investmentLines = items.filter((it) => it.purpose_category === 'investment');
  for (const it of investmentLines) {
    portfolioInvestSum += num(it.amount);
    const co = typeof it.investee_company === 'string' ? it.investee_company.trim() : '';
    if (co.length > 0) investees.add(co);
  }
  const investment_count = investees.size > 0 ? investees.size : investmentLines.length;

  const divestRows = distributions.filter((d) => DIVESTMENT_RETURN_TYPES.has(d.return_type));
  const divestment_count = divestRows.length;
  const divestmentSum = divestRows.reduce((s, d) => s + num(d.amount), 0);
  const total_divestment_value = divestment_count === 0 ? null : money(currency, divestmentSum);

  const isPvc = !!fund.is_pvc;
  const dbjProRataPct = fund.dbj_pro_rata_pct ?? null;
  let metrics: FundPerformanceMetrics = { dpi: null, rvpi: null, tvpi: null, moic: null, calculated_irr: null };
  let navFull: number | null = null;
  let reported_irr: number | null = null;
  if (snapshot != null) {
    navFull = num(snapshot.nav);
    metrics = metricsForSnapshot(isPvc, calls, distributions, snapshot, dbjProRataPct);
    reported_irr = snapshot.reported_irr != null && Number.isFinite(Number(snapshot.reported_irr)) ? Number(snapshot.reported_irr) : null;
  }
  const navMoney = navFull != null && Number.isFinite(navFull) ? money(currency, navFull) : null;
  const dbjNav =
    navFull != null && Number.isFinite(navFull) ? money(currency, applyDbjNavShareForMetrics(navFull, dbjProRataPct)) : null;

  const engineLine = complianceEngineNarrative(obligationRows);
  const complianceParts = [narrative?.compliance_update?.trim(), narrative?.risk_assessment?.trim(), engineLine].filter(
    (x): x is string => !!x && x.length > 0,
  );
  const compliance_matters = complianceParts.length > 0 ? complianceParts.join('\n\n') : null;

  const profileDirectors = profile.directors.map((d) => d.name).filter((n) => n.length > 0);

  const ids = [assessment.assessed_by, assessment.approved_by].filter((x): x is string => !!x);
  let nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs, error: pErr } = await supabase.from('vc_profiles').select('id, full_name').in('id', ids);
    if (!pErr && profs) {
      nameById = new Map(profs.map((p) => [p.id as string, String((p as { full_name: string | null }).full_name ?? '—')]));
    }
  }

  const { report_title, period_label } = buildReportTitle(assessment.assessment_period);
  const datePreparedSource = assessment.approved_at ?? assessment.assessment_date;

  const header = {
    report_title,
    period_label,
    date_prepared: formatDisplayDate(datePreparedSource),
    fund_name: fund.fund_name,
  };

  const fund_profile = {
    business_registration: profile.business_registration,
    investment_type: profile.investment_type,
    principals: profile.principals.map((p) => ({
      name: p.name,
      role: p.role,
      note: [p.notes, p.departed_date ? `Departed: ${p.departed_date}` : null].filter(Boolean).join(' — ') || undefined,
    })),
    directors: profileDirectors,
    investment_committee: {
      has_ic: profile.investment_committee.has_ic,
      structure_note: profile.investment_committee.structure_note,
      members: profile.investment_committee.members,
    },
  };

  const fund_capital_account = {
    total_commitments: money(currency, totalCommitNum),
    portfolio_drawdowns: money(currency, portfolio_draw),
    fee_drawdowns: money(currency, fee_drawdowns),
    management_fees: money(currency, management_fees),
    administrative_fees: money(currency, administrative_fees),
    other_fund_fees: money(currency, other_fund_fees),
    total_drawdown_inception: money(currency, total_drawdown_inception),
    remaining_commitment: money(currency, remainingFund),
  };

  const dbj_capital_account = {
    total_commitment: money(currency, dbjCommit),
    total_drawdown: money(currency, dbjDrawdown),
    remaining_commitment: money(currency, dbjRemaining),
  };

  const portfolio_overview = {
    investment_count,
    total_portfolio_investment: money(currency, portfolioInvestSum),
    divestment_count,
    total_divestment_value,
  };

  const fund_financial_performance = {
    nav: navMoney,
    nav_per_share: null,
    dbj_share: dbjNav,
    dpi: metrics.dpi,
    tvpi: metrics.tvpi,
    calculated_irr: metrics.calculated_irr,
    reported_irr,
  };

  const updates_and_risk = {
    quarterly_update: assessment.ai_summary?.trim() || null,
    fund_management_team_narrative: narrative?.team_update?.trim() || null,
    management_team_table: profile.management_team.map((m) => ({ name: m.name, role: m.role, bio: m.bio })),
    fundraising_update: narrative?.fundraising_update?.trim() || null,
    pipeline_development: narrative?.pipeline_development?.trim() || null,
    compliance_matters,
    impact: narrative?.impact_update?.trim() || null,
    outlook: narrative?.outlook?.trim() || null,
  };

  const assessment_footer = {
    weighted_total: assessment.weighted_total_score != null ? Number(assessment.weighted_total_score) : 0,
    category: (assessment.category ?? '—').replace(/_/g, ' '),
    recommendation: (assessment.divestment_recommendation ?? '—').replace(/_/g, ' '),
    assessed_by: assessment.assessed_by ? (nameById.get(assessment.assessed_by) ?? '—') : '—',
    approved_by: assessment.approved_by ? (nameById.get(assessment.approved_by) ?? '—') : '—',
    approved_at: formatDisplayDate(assessment.approved_at ?? assessment.assessment_date),
  };

  const narrative_fund_meta = buildNarrativeFundMeta(narrative, fund, currency);
  const narrative_allocations = buildNarrativeAllocations(narrative);
  const narrative_fund_lps = buildNarrativeLps(narrative);
  const narrative_pipeline = buildNarrativePipeline(narrative);
  const narrative_capital_account = buildNarrativeCapitalAccount(narrative);

  return {
    header,
    fund_profile,
    fund_capital_account,
    dbj_capital_account,
    portfolio_overview,
    fund_financial_performance,
    esg_considerations: profile.esg_notes,
    updates_and_risk,
    assessment_footer,
    narrative_fund_meta,
    narrative_allocations,
    narrative_fund_lps,
    narrative_pipeline,
    narrative_capital_account,
  };
}
