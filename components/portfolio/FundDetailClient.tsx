'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Upload } from 'lucide-react';

import { FundAssessmentsTab } from '@/components/portfolio/FundAssessmentsTab';
import { FundPctuProfileEditor } from '@/components/portfolio/FundPctuProfileEditor';
import { FundCapitalCallsTab } from '@/components/portfolio/FundCapitalCallsTab';
import { FundDistributionsTab } from '@/components/portfolio/FundDistributionsTab';
import { FundPerformanceTab } from '@/components/portfolio/FundPerformanceTab';
import { MarkReceivedSlideOver } from '@/components/portfolio/MarkReceivedSlideOver';
import { UnifiedExtractionReviewModal, type UnifiedExtractApiResponse } from '@/components/portfolio/UnifiedExtractionReviewModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { complianceRateByType, summarizeCompliance } from '@/lib/portfolio/compliance';
import { fundCategoryBadgeClassName, fundCategoryLabel } from '@/lib/portfolio/fund-category';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';

type Obligation = {
  id: string;
  report_type: string;
  period_label: string;
  period_year: number;
  period_month: number;
  due_date: string;
  status: string;
  submitted_date: string | null;
  submitted_by: string | null;
  reviewed_date: string | null;
  document_path: string | null;
  document_name: string | null;
  snapshot_extracted?: boolean;
  snapshot_id?: string | null;
  days_overdue?: number;
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
];

const REPORT_LABELS: Record<string, string> = {
  quarterly_financial: 'Quarterly Financial',
  quarterly_investment_mgmt: 'Quarterly Inv. Mgmt',
  audited_annual: 'Annual Audit',
  inhouse_quarterly: 'In-house Quarterly',
};

function fmtMoney(currency: string, n: number) {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function statusBadge(st: string) {
  const s = st.toLowerCase();
  const map: Record<string, string> = {
    pending: 'bg-[#EEF3FB] text-gray-700 border border-[#D0DBED]',
    due: 'bg-amber-50 text-amber-900 border border-amber-200',
    submitted: 'bg-blue-50 text-blue-800 border border-blue-200',
    under_review: 'bg-blue-50 text-blue-800 border border-blue-200',
    accepted: 'bg-emerald-50 text-[#0F8A6E] border border-emerald-200',
    outstanding: 'bg-orange-50 text-orange-900 border border-orange-200',
    overdue: 'bg-red-50 text-red-800 border border-red-200',
    waived: 'bg-[#EEF3FB] text-gray-600 border border-[#D0DBED]',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    due: 'Due Soon',
    submitted: 'Submitted',
    under_review: 'Under Review',
    accepted: 'Accepted',
    outstanding: 'Outstanding',
    overdue: 'Overdue',
    waived: 'Waived',
  };
  return { className: map[s] ?? map.pending!, label: labels[s] ?? s };
}

function formatMonthYear(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function fundTenureSuffix(fund: PortfolioFundRow): string | null {
  if (fund.is_pvc) return null;
  const end = fund.fund_end_date;
  if (!end) return null;
  const endD = new Date(`${end}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (endD < now) return '(Expired)';
  const years = (endD.getTime() - now.getTime()) / (365.25 * 86400000);
  const rounded = Math.round(years * 10) / 10;
  return `(${rounded} years remaining)`;
}

function daysUntilDue(due: string): { text: string; tone: 'gray' | 'amber' | 'red' } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T12:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff > 0) return { text: `+${diff} days`, tone: 'gray' };
  if (diff === 0) return { text: 'Due today', tone: 'amber' };
  return { text: `${diff} days overdue`, tone: 'red' };
}

type Tab = 'overview' | 'reporting' | 'calls' | 'distributions' | 'performance' | 'assessments' | 'documents' | 'settings';

export function FundDetailClient({
  fund: initialFund,
  obligations: initialObligations,
  canWrite,
  canDeleteSnapshots,
}: {
  fund: PortfolioFundRow;
  obligations: Record<string, unknown>[];
  canWrite: boolean;
  canDeleteSnapshots: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fund, setFund] = useState(initialFund);
  const [rows, setRows] = useState<Obligation[]>(() => initialObligations as Obligation[]);
  const [tab, setTab] = useState<Tab>('overview');
  const [year, setYear] = useState<number | 'all'>('all');
  const [rType, setRType] = useState<string>('all');
  const [rStatus, setRStatus] = useState<string>('all');
  const [obligationSort, setObligationSort] = useState<'due_desc' | 'due_asc'>('due_desc');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [markReceivedOb, setMarkReceivedOb] = useState<Obligation | null>(null);
  const [extractionSuggestObligationId, setExtractionSuggestObligationId] = useState<string | null>(null);
  const [unifiedExtractData, setUnifiedExtractData] = useState<UnifiedExtractApiResponse | null>(null);
  const [extractAllBusy, setExtractAllBusy] = useState(false);
  const [extractAllErr, setExtractAllErr] = useState<string | null>(null);

  const [revOpen, setRevOpen] = useState<Obligation | null>(null);
  const [revNotes, setRevNotes] = useState('');

  const lite = useMemo(
    () => rows.map((r) => ({ report_type: r.report_type, status: r.status, due_date: r.due_date })),
    [rows],
  );
  const summary = useMemo(() => summarizeCompliance(lite), [lite]);
  const yNow = new Date().getFullYear();

  const dueSoon = rows.filter((r) => r.status === 'due').length;
  const overdueC = rows.filter((r) => r.status === 'overdue').length;
  const outC = rows.filter((r) => r.status === 'outstanding').length;
  const acceptedYtd = rows.filter((r) => r.status === 'accepted' && r.period_year === yNow).length;

  const recent = useMemo(() => {
    return [...rows].sort((a, b) => (a.due_date < b.due_date ? 1 : -1)).slice(0, 8);
  }, [rows]);

  const filtered = useMemo(() => {
    const arr = rows.filter((r) => {
      if (year !== 'all' && r.period_year !== year) return false;
      if (rType !== 'all' && r.report_type !== rType) return false;
      if (rStatus !== 'all' && r.status !== rStatus) return false;
      return true;
    });
    arr.sort((a, b) => {
      const c = a.due_date.localeCompare(b.due_date);
      if (c !== 0) return obligationSort === 'due_desc' ? -c : c;
      return a.id.localeCompare(b.id);
    });
    return arr;
  }, [rows, year, rType, rStatus, obligationSort]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    rows.forEach((r) => ys.add(r.period_year));
    const arr = [...ys].sort((a, b) => b - a);
    if (arr.length === 0) {
      for (let y = yNow + 1; y >= yNow - 4; y -= 1) arr.push(y);
    }
    return arr;
  }, [rows, yNow]);

  const docs = rows.filter((r) => r.document_path);

  const reload = async () => {
    const res = await fetch(`/api/portfolio/funds/${fund.id}/obligations`);
    const j = (await res.json()) as { obligations?: Obligation[]; error?: string };
    if (res.ok && j.obligations) setRows(j.obligations);
  };

  const refetchFund = async () => {
    const res = await fetch(`/api/portfolio/funds/${fund.id}`);
    const j = (await res.json()) as { fund?: PortfolioFundRow; error?: string };
    if (res.ok && j.fund) setFund(j.fund);
  };

  const regenerate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/regenerate`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async (decision: 'accept' | 'request_clarification') => {
    if (!revOpen) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/obligations/${revOpen.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, review_notes: revNotes.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setRevOpen(null);
      setRevNotes('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const quickUpload = async (o: Obligation, file: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setExtractionSuggestObligationId(null);
    setExtractAllErr(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const up = await fetch(`/api/portfolio/obligations/${o.id}/upload`, { method: 'POST', body: fd });
      const j = (await up.json()) as { suggest_extraction?: boolean; error?: string };
      if (!up.ok) throw new Error(j.error ?? 'Upload failed');
      if (j.suggest_extraction && canWrite) setExtractionSuggestObligationId(o.id);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const runExtractAll = async (obligationId: string) => {
    setExtractAllBusy(true);
    setExtractAllErr(null);
    try {
      const res = await fetch(`/api/portfolio/obligations/${obligationId}/extract-all`, { method: 'POST' });
      const j = (await res.json()) as UnifiedExtractApiResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Extraction failed');
      setExtractionSuggestObligationId(null);
      setUnifiedExtractData(j);
    } catch (e) {
      setExtractAllErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setExtractAllBusy(false);
    }
  };

  const saveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const chk = (name: string) => {
      const el = form.elements.namedItem(name);
      return el instanceof HTMLInputElement && el.type === 'checkbox' && el.checked;
    };
    const patch: Record<string, unknown> = {
      fund_name: String(fd.get('fund_name') ?? '').trim(),
      manager_name: String(fd.get('manager_name') ?? '').trim(),
      fund_representative: String(fd.get('fund_representative') ?? '').trim() || null,
      currency: fd.get('currency') === 'JMD' ? 'JMD' : 'USD',
      total_fund_commitment: Number(fd.get('total_fund_commitment')),
      dbj_commitment: Number(fd.get('dbj_commitment')),
      dbj_pro_rata_pct: Number(fd.get('dbj_pro_rata_pct')),
      year_end_month: Number(fd.get('year_end_month')),
      quarterly_report_due_days: Number(fd.get('quarterly_report_due_days')),
      audit_report_due_days: Number(fd.get('audit_report_due_days')),
      exchange_rate_jmd_usd: Number(fd.get('exchange_rate_jmd_usd')),
      listed: chk('listed'),
      requires_quarterly_financial: chk('requires_quarterly_financial'),
      requires_quarterly_inv_mgmt: chk('requires_quarterly_inv_mgmt'),
      requires_audited_annual: chk('requires_audited_annual'),
      requires_inhouse_quarterly: chk('requires_inhouse_quarterly'),
      notes: String(fd.get('notes') ?? '').trim() || null,
    };
    const contactsRaw = String(fd.get('contacts_json') ?? '[]');
    try {
      patch.contacts = JSON.parse(contactsRaw);
    } catch {
      patch.contacts = [];
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = (await res.json()) as { fund?: PortfolioFundRow; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      if (j.fund) setFund(j.fund);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = async (id: string) => {
    const res = await fetch(`/api/portfolio/obligations/${id}/document`);
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) {
      setErr(j.error ?? 'No download URL');
      return;
    }
    window.open(j.url, '_blank', 'noopener,noreferrer');
  };

  const tabs: { k: Tab; label: string }[] = [
    { k: 'overview', label: 'Overview' },
    { k: 'reporting', label: 'Reporting' },
    { k: 'calls', label: 'Capital Calls' },
    { k: 'distributions', label: 'Distributions' },
    { k: 'performance', label: 'Performance' },
    { k: 'assessments', label: 'Assessments' },
    { k: 'documents', label: 'Documents' },
    { k: 'settings', label: 'Settings' },
  ];

  useEffect(() => {
    const t = searchParams.get('tab');
    const map: Record<string, Tab> = {
      overview: 'overview',
      reporting: 'reporting',
      calls: 'calls',
      distributions: 'distributions',
      performance: 'performance',
      assessments: 'assessments',
      documents: 'documents',
      settings: 'settings',
    };
    if (t && map[t]) setTab(map[t]!);
  }, [searchParams]);

  const setTabNav = (k: Tab) => {
    setTab(k);
    router.replace(`/portfolio/funds/${fund.id}?tab=${k}`, { scroll: false });
  };

  const overall =
    summary.compliance_status === 'fully_compliant'
      ? 'Fully compliant'
      : summary.compliance_status === 'non_compliant'
        ? 'Non-compliant'
        : 'Partially compliant';

  return (
    <div className="space-y-6">
      <Link
        href="/portfolio/funds"
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-[#0B1F45]"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
        All Funds
      </Link>
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="grid gap-4 rounded-xl bg-[#0B1F45] p-6 text-white md:grid-cols-2">
        <div>
          <h1 className="text-2xl font-bold">{fund.fund_name}</h1>
          <p className="mt-1 text-sm text-white/60">{fund.manager_name}</p>
          <p className="mt-1 text-xs text-white/40">{fund.fund_representative ?? '—'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-white/50">DBJ Commitment</p>
            <p className="text-xl font-bold text-[#C8973A]">{fmtMoney(fund.currency, Number(fund.dbj_commitment))}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Pro-Rata %</p>
            <p className="text-lg font-semibold">{Number(fund.dbj_pro_rata_pct).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Year End</p>
            <p className="text-lg font-semibold">{MONTH_LONG[fund.year_end_month - 1]}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Status</p>
            <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium capitalize">
              {fund.fund_status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTabNav(t.k)}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium',
              tab === t.k ? 'bg-[#0B1F45] text-white' : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Reporting Status</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  { label: 'Due soon (≤14d)', value: dueSoon, tone: 'amber' as const },
                  { label: 'Overdue', value: overdueC, tone: 'red' as const },
                  { label: 'Outstanding', value: outC, tone: 'orange' as const },
                  { label: 'Accepted YTD', value: acceptedYtd, tone: 'teal' as const },
                ].map((c) => (
                  <div
                    key={c.label}
                    className={cn(
                      'rounded-lg border p-3 text-center',
                      c.tone === 'amber' && 'border-amber-200 bg-amber-50',
                      c.tone === 'red' && 'border-red-200 bg-red-50',
                      c.tone === 'orange' && 'border-orange-200 bg-orange-50',
                      c.tone === 'teal' && 'border-emerald-200 bg-emerald-50',
                    )}
                  >
                    <p className="text-2xl font-bold text-[#0B1F45]">{c.value}</p>
                    <p className="text-xs text-gray-600">{c.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs text-gray-500">
                    <tr>
                      <th className="py-2 pr-2">Period</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Due</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recent.map((r) => {
                      const sb = statusBadge(r.status);
                      return (
                        <tr key={r.id}>
                          <td className="py-2 pr-2">{r.period_label}</td>
                          <td className="py-2 pr-2">{REPORT_LABELS[r.report_type] ?? r.report_type}</td>
                          <td className="py-2 pr-2">{r.due_date}</td>
                          <td className="py-2 pr-2">
                            <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs', sb.className)}>{sb.label}</span>
                          </td>
                          <td className="py-2 text-right">
                            {r.status === 'outstanding' || r.status === 'overdue' ? (
                              <Button size="sm" variant="outline" type="button" onClick={() => setMarkReceivedOb(r)}>
                                Mark Received
                              </Button>
                            ) : r.status === 'submitted' || r.status === 'under_review' ? (
                              <Button size="sm" type="button" onClick={() => setRevOpen(r)}>
                                Review
                              </Button>
                            ) : r.status === 'accepted' && r.document_path ? (
                              <button type="button" className="text-sm text-[#0F8A6E] hover:underline" onClick={() => void downloadDoc(r.id)}>
                                View
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Link href="#reporting" onClick={() => setTabNav('reporting')} className="mt-3 inline-block text-sm font-medium text-[#0F8A6E] hover:underline">
                View All Reporting →
              </Link>
            </section>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Fund details</h2>

              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    Classification & horizon
                  </h3>
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Category</p>
                      <div className="mt-1.5">
                        <span className={fundCategoryBadgeClassName(fund.fund_category)}>{fundCategoryLabel(fund.fund_category)}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Fund tenure</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">
                        {fund.is_pvc ? (
                          <span className="text-teal-600">Permanent Capital Vehicle (PCV)</span>
                        ) : fund.fund_end_date ? (
                          <>
                            {formatMonthYear(fund.fund_end_date)}{' '}
                            <span className="text-gray-500">{fundTenureSuffix(fund) ?? ''}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    Economics & fees
                  </h3>
                  <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Target IRR</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">
                        {fund.target_irr_pct != null ? `${Number(fund.target_irr_pct).toFixed(1)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Management fee</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">
                        {fund.management_fee_pct != null ? `${Number(fund.management_fee_pct).toFixed(2)}%` : '—'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium text-gray-500">Performance fee</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">
                        {fund.performance_fee_pct != null ? `${Number(fund.performance_fee_pct)}%` : '—'}
                        {fund.performance_fee_pct != null && fund.hurdle_rate_pct != null
                          ? ` above ${Number(fund.hurdle_rate_pct)}% hurdle`
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    Strategy
                  </h3>
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Sector focus</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(fund.sector_focus ?? []).length === 0 ? (
                          <span className="text-sm text-gray-400">—</span>
                        ) : (
                          (fund.sector_focus ?? []).map((s) => (
                            <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {s}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Impact objectives</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(fund.impact_objectives ?? []).length === 0 ? (
                          <span className="text-sm text-gray-400">—</span>
                        ) : (
                          [...new Set(fund.impact_objectives ?? [])]
                            .sort((a, b) => a - b)
                            .map((id) => {
                              if (id === 1) {
                                return (
                                  <span
                                    key={id}
                                    className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                                  >
                                    Ecosystem Development
                                  </span>
                                );
                              }
                              if (id === 2) {
                                return (
                                  <span
                                    key={id}
                                    className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700"
                                  >
                                    Access to Finance
                                  </span>
                                );
                              }
                              if (id === 3) {
                                return (
                                  <span
                                    key={id}
                                    className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                                  >
                                    Investment Returns
                                  </span>
                                );
                              }
                              return null;
                            })
                            .filter((el): el is JSX.Element => el != null)
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    Terms & currency
                  </h3>
                  <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Currency</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">{fund.currency}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Listed</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">{fund.listed ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Commitment date</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">{fund.commitment_date}</p>
                    </div>
                    {fund.currency === 'JMD' ? (
                      <div>
                        <p className="text-xs font-medium text-gray-500">Exchange rate</p>
                        <p className="mt-0.5 text-sm text-[#0B1F45]">{Number(fund.exchange_rate_jmd_usd ?? 157)}</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h3 className="border-b border-gray-100 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    Reporting
                  </h3>
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Quarterly reports due</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">{fund.quarterly_report_due_days} days after quarter end</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Audit due</p>
                      <p className="mt-0.5 text-sm text-[#0B1F45]">{fund.audit_report_due_days} days after year end</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Report types</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {fund.requires_quarterly_financial ? (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">Quarterly Financial</span>
                        ) : null}
                        {fund.requires_quarterly_inv_mgmt ? (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">Inv. Mgmt</span>
                        ) : null}
                        {fund.requires_audited_annual ? (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">Audited Annual</span>
                        ) : null}
                        {fund.requires_inhouse_quarterly ? (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">In-house</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" className="mt-5 text-sm font-medium text-[#0F8A6E] hover:underline" onClick={() => setTabNav('settings')}>
                Edit Settings →
              </button>
            </section>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Compliance scorecard</h2>
              <div className="mt-3 space-y-3">
                {(
                  [
                    ['quarterly_financial', 'Quarterly Financial'],
                    ['quarterly_investment_mgmt', 'Quarterly Inv. Mgmt'],
                    ['audited_annual', 'Audited Annual'],
                    ['inhouse_quarterly', 'In-house Quarterly'],
                  ] as const
                ).map(([k, lab]) => {
                  const pct = complianceRateByType(lite, k);
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{lab}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-[#0F8A6E]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs font-semibold uppercase text-gray-400">Overall</p>
              <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-[#EEF3FB] px-3 py-1 text-sm font-medium text-[#0B1F45]">{overall}</span>
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'reporting' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Year</Label>
              <select
                className="mt-1 flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={year === 'all' ? 'all' : String(year)}
                onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Report type</Label>
              <select
                className="mt-1 flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={rType}
                onChange={(e) => setRType(e.target.value)}
              >
                <option value="all">All</option>
                <option value="quarterly_financial">Quarterly Financial</option>
                <option value="quarterly_investment_mgmt">Quarterly Inv. Mgmt</option>
                <option value="audited_annual">Annual Audit</option>
                <option value="inhouse_quarterly">In-house Quarterly</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="mt-1 flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={rStatus}
                onChange={(e) => setRStatus(e.target.value)}
              >
                <option value="all">All</option>
                {['pending', 'due', 'submitted', 'under_review', 'accepted', 'outstanding', 'overdue', 'waived'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Sort</Label>
              <select
                className="mt-1 flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={obligationSort}
                onChange={(e) => setObligationSort(e.target.value as 'due_desc' | 'due_asc')}
              >
                <option value="due_desc">Due date (newest first)</option>
                <option value="due_asc">Due date (oldest first)</option>
              </select>
            </div>
            {canWrite ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void regenerate()}>
                Regenerate Schedule
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-white text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Reviewed</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const dd = daysUntilDue(r.due_date);
                  const sb = statusBadge(r.status);
                  return (
                    <Fragment key={r.id}>
                    <tr>
                      <td className="px-3 py-2">{r.period_label}</td>
                      <td className="px-3 py-2">{REPORT_LABELS[r.report_type] ?? r.report_type}</td>
                      <td className="px-3 py-2">{r.due_date}</td>
                      <td className={cn('px-3 py-2', dd.tone === 'amber' && 'text-amber-700', dd.tone === 'red' && 'text-red-700', dd.tone === 'gray' && 'text-gray-500')}>
                        {dd.text}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs', sb.className)}>{sb.label}</span>
                      </td>
                      <td className="px-3 py-2">{r.submitted_date ?? '—'}</td>
                      <td className="px-3 py-2">{r.reviewed_date ?? '—'}</td>
                      <td className="space-x-1 px-3 py-2 text-right">
                        {canWrite && (r.status === 'outstanding' || r.status === 'overdue') ? (
                          <Button size="sm" type="button" onClick={() => setMarkReceivedOb(r)}>
                            Mark as Received
                          </Button>
                        ) : null}
                        {canWrite && (r.status === 'submitted' || r.status === 'under_review') ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => setRevOpen(r)}>
                            Review
                          </Button>
                        ) : null}
                        {r.status === 'accepted' && r.document_path ? (
                          <Button size="sm" variant="ghost" type="button" onClick={() => void downloadDoc(r.id)}>
                            View Document
                          </Button>
                        ) : null}
                        {canWrite ? (
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 hover:bg-gray-100">
                            <Upload className="h-4 w-4 text-gray-600" />
                            <input
                              type="file"
                              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) void quickUpload(r, f);
                              }}
                            />
                          </label>
                        ) : null}
                      </td>
                    </tr>
                    {extractionSuggestObligationId === r.id && canWrite ? (
                      <tr className="bg-[#F4F7FE]">
                        <td colSpan={8} className="px-3 py-3 text-sm text-[#0B1F45]">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-gray-700">
                              This financial report can pre-fill a performance snapshot and narrative indicators. Extraction uses AI; you confirm every field before anything is saved.
                            </p>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="bg-[#0B1F45] hover:bg-[#162d5e]"
                                disabled={extractAllBusy}
                                onClick={() => void runExtractAll(r.id)}
                              >
                                {extractAllBusy ? 'Extracting…' : 'Extract report data'}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setExtractionSuggestObligationId(null)}>
                                Dismiss
                              </Button>
                            </div>
                          </div>
                          {extractAllErr ? (
                            <p className="mt-2 text-xs text-red-700">
                              {extractAllErr}{' '}
                              <Link href={`/portfolio/funds/${fund.id}?tab=performance`} className="font-medium underline">
                                Open Performance tab
                              </Link>
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'calls' ? <FundCapitalCallsTab fund={fund} canWrite={canWrite} /> : null}
      {tab === 'distributions' ? <FundDistributionsTab fund={fund} canWrite={canWrite} /> : null}
      {tab === 'assessments' ? <FundAssessmentsTab fundId={fund.id} canWrite={canWrite} /> : null}
      {tab === 'performance' ? (
        <FundPerformanceTab fund={fund} canWrite={canWrite} canDelete={canDeleteSnapshots} />
      ) : null}

      {tab === 'documents' ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-white text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    No documents uploaded yet.
                  </td>
                </tr>
              ) : (
                docs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.document_name ?? '—'}</td>
                    <td className="px-3 py-2">{r.period_label}</td>
                    <td className="px-3 py-2">{REPORT_LABELS[r.report_type] ?? r.report_type}</td>
                    <td className="px-3 py-2">{r.submitted_date ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" type="button" onClick={() => void downloadDoc(r.id)}>
                        Download
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'settings' && canWrite ? (
        <>
        <form onSubmit={(e) => void saveSettings(e)} className="max-w-2xl space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fund_name">Fund name</Label>
              <Input id="fund_name" name="fund_name" defaultValue={fund.fund_name} className="mt-1" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="manager_name">Manager name</Label>
              <Input id="manager_name" name="manager_name" defaultValue={fund.manager_name} className="mt-1" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="fund_representative">Representative</Label>
              <Input id="fund_representative" name="fund_representative" defaultValue={fund.fund_representative ?? ''} className="mt-1" />
            </div>
            <div>
              <Label>Currency</Label>
              <select name="currency" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={fund.currency}>
                <option value="USD">USD</option>
                <option value="JMD">JMD</option>
              </select>
            </div>
            <div>
              <Label htmlFor="listed" className="flex items-center gap-2">
                <input id="listed" name="listed" type="checkbox" defaultChecked={fund.listed} className="rounded border-gray-300" />
                Listed
              </Label>
            </div>
            <div>
              <Label htmlFor="total_fund_commitment">Total fund commitment</Label>
              <Input id="total_fund_commitment" name="total_fund_commitment" type="number" step="any" defaultValue={String(fund.total_fund_commitment)} className="mt-1" required />
            </div>
            <div>
              <Label htmlFor="dbj_commitment">DBJ commitment</Label>
              <Input id="dbj_commitment" name="dbj_commitment" type="number" step="any" defaultValue={String(fund.dbj_commitment)} className="mt-1" required />
            </div>
            <div>
              <Label htmlFor="dbj_pro_rata_pct">DBJ pro-rata %</Label>
              <Input id="dbj_pro_rata_pct" name="dbj_pro_rata_pct" type="number" step="0.01" defaultValue={String(fund.dbj_pro_rata_pct)} className="mt-1" required />
            </div>
            <div>
              <Label htmlFor="year_end_month">Year end month</Label>
              <select
                id="year_end_month"
                name="year_end_month"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={fund.year_end_month}
              >
                {MONTH_LONG.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="quarterly_report_due_days">Quarterly report due days</Label>
              <Input id="quarterly_report_due_days" name="quarterly_report_due_days" type="number" defaultValue={fund.quarterly_report_due_days} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="audit_report_due_days">Audit report due days</Label>
              <Input id="audit_report_due_days" name="audit_report_due_days" type="number" defaultValue={fund.audit_report_due_days} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="exchange_rate_jmd_usd">Exchange rate (JMD/USD)</Label>
              <Input id="exchange_rate_jmd_usd" name="exchange_rate_jmd_usd" type="number" step="0.01" defaultValue={String(fund.exchange_rate_jmd_usd ?? 157)} className="mt-1" />
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input name="requires_quarterly_financial" type="checkbox" defaultChecked={fund.requires_quarterly_financial} />
              Quarterly Financial
            </label>
            <label className="flex items-center gap-2">
              <input name="requires_quarterly_inv_mgmt" type="checkbox" defaultChecked={fund.requires_quarterly_inv_mgmt} />
              Quarterly Investment Management
            </label>
            <label className="flex items-center gap-2">
              <input name="requires_audited_annual" type="checkbox" defaultChecked={fund.requires_audited_annual} />
              Audited Annual
            </label>
            <label className="flex items-center gap-2">
              <input name="requires_inhouse_quarterly" type="checkbox" defaultChecked={fund.requires_inhouse_quarterly} />
              In-house Quarterly
            </label>
          </div>
          <div>
            <Label htmlFor="contacts_json">Contacts (JSON array)</Label>
            <textarea
              id="contacts_json"
              name="contacts_json"
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              defaultValue={JSON.stringify(fund.contacts ?? [], null, 2)}
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea id="notes" name="notes" rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={fund.notes ?? ''} />
          </div>
          <Button type="submit" disabled={busy} className="bg-[#0B1F45] hover:bg-[#162d5e]">
            {busy ? 'Saving…' : 'Save Settings'}
          </Button>
        </form>
        <div className="max-w-2xl">
          <FundPctuProfileEditor
            fundId={fund.id}
            pctuProfileRaw={(fund.pctu_profile ?? null) as Json | null}
            resetKey={fund.updated_at}
            onSaved={() => void refetchFund()}
          />
        </div>
        </>
      ) : null}

      {tab === 'settings' && !canWrite ? <p className="text-sm text-gray-500">You do not have permission to edit fund settings.</p> : null}

      <MarkReceivedSlideOver
        open={!!markReceivedOb}
        obligation={markReceivedOb}
        fundName={fund.fund_name}
        onClose={() => setMarkReceivedOb(null)}
        onSaved={() => void reload()}
        onUnifiedExtractReady={(data) => setUnifiedExtractData(data)}
      />

      {unifiedExtractData ? (
        <UnifiedExtractionReviewModal
          open
          fundId={unifiedExtractData.fund_id}
          sourceObligationId={unifiedExtractData.obligation_id}
          data={unifiedExtractData}
          onClose={() => setUnifiedExtractData(null)}
          onSaved={() => {
            void reload();
          }}
        />
      ) : null}

      {revOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0B1F45]">Review submission</h3>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Review notes</Label>
                <textarea value={revNotes} onChange={(e) => setRevNotes(e.target.value)} className="mt-1 min-h-[100px] w-full rounded-md border px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRevOpen(null)}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveReview('request_clarification')}>
                Request Clarification
              </Button>
              <Button type="button" className="bg-[#0F8A6E]" disabled={busy} onClick={() => void saveReview('accept')}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
