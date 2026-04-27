'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  FileX,
  Loader2,
  Mail,
  StickyNote,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COMPLIANCE_BADGE } from '@/lib/portfolio/compliance-badges';
import type { ComplianceFundWithObligations, ComplianceNestedObligation, ComplianceSummaryRow } from '@/lib/portfolio/compliance-fund-rows';
import { cn } from '@/lib/utils';

type TabKey = 'overview' | 'overdue' | 'activity';

const REPORT_SHORT: Record<string, string> = {
  quarterly_financial: 'Quarterly Fin.',
  quarterly_investment_mgmt: 'Quarterly Inv.',
  audited_annual: 'Annual Audit',
  inhouse_quarterly: 'In-house',
};

function rowAccent(status: string): string {
  if (status === 'fully_compliant') return 'border-l-4 border-teal-500';
  if (status === 'audits_outstanding') return 'border-l-4 border-amber-500';
  if (status === 'reports_outstanding') return 'border-l-4 border-amber-400';
  if (status === 'non_compliant') return 'border-l-4 border-red-500';
  if (status === 'partially_compliant') return 'border-l-4 border-blue-400';
  return 'border-l-4 border-gray-200';
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

function overdueObligations(obs: ComplianceNestedObligation[]) {
  return obs.filter((o) => o.status === 'overdue');
}

function auditOverdueObligations(obs: ComplianceNestedObligation[]) {
  return obs.filter((o) => o.status === 'overdue' && o.report_type === 'audited_annual');
}

type OverdueApiRow = {
  id: string;
  fund_id: string;
  fund_name: string;
  currency: string;
  report_type: string;
  period_label: string;
  due_date: string;
  days_overdue: number;
  escalation_level: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
};

type ActivityRow = Record<string, unknown> & {
  obligation_period_label?: string;
  obligation_report_type?: string;
  fund_name?: string;
  fund_currency?: string;
};

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const hrs = Math.floor(diff / 3600000);
  if (diff < 60000) return 'Just now';
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDue(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escalationLabel(level: string | null) {
  if (!level) return '—';
  const map: Record<string, string> = {
    analyst: 'Analyst',
    supervisor: 'Supervisor',
    unit_head: 'Unit Head',
  };
  return map[level] ?? level;
}

function actionDescription(a: ActivityRow): string {
  const t = String(a.action_type);
  const recipient = a.recipient ? String(a.recipient) : '';
  if (t === 'marked_received') return 'Report marked as received';
  if (t === 'marked_accepted') return 'Report accepted';
  if (t === 'reminder_sent') return `Reminder sent to ${recipient || 'recipient'}`;
  if (t === 'escalated') return `Escalated to ${recipient || 'recipient'}`;
  if (t === 'document_uploaded') return 'Document uploaded';
  if (t === 'note_added') return 'Note added';
  if (t === 'status_changed') return 'Status changed';
  return t;
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

export function ComplianceDashboardClient({
  initialRows,
  initialFunds,
}: {
  initialRows: ComplianceSummaryRow[];
  initialFunds: ComplianceFundWithObligations[];
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [rows] = useState(initialRows);
  const [funds] = useState(initialFunds);

  const [overdueRows, setOverdueRows] = useState<OverdueApiRow[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFundFilter, setActivityFundFilter] = useState<string>('all');

  const [overdueFundFilter, setOverdueFundFilter] = useState('all');
  const [overdueTypeFilter, setOverdueTypeFilter] = useState('all');
  const [overdueSort, setOverdueSort] = useState<'days' | 'fund' | 'due'>('days');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderFund, setReminderFund] = useState<ComplianceFundWithObligations | null>(null);
  const [reminderObligationIds, setReminderObligationIds] = useState<string[]>([]);
  const [reminderName, setReminderName] = useState('');
  const [reminderEmail, setReminderEmail] = useState('');

  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateFund, setEscalateFund] = useState<ComplianceFundWithObligations | null>(null);
  const [escalateObligationIds, setEscalateObligationIds] = useState<string[]>([]);
  const [escLevel, setEscLevel] = useState<'analyst' | 'supervisor' | 'unit_head'>('supervisor');
  const [escName, setEscName] = useState('');
  const [escEmail, setEscEmail] = useState('');
  const [escNotes, setEscNotes] = useState('');

  const [recvOpen, setRecvOpen] = useState(false);
  const [recvRow, setRecvRow] = useState<OverdueApiRow | null>(null);
  const [recvDate, setRecvDate] = useState('');
  const [recvBy, setRecvBy] = useState('');

  const modalOpen = reminderOpen || escalateOpen || recvOpen;
  useBodyScrollLock(modalOpen);

  const loadOverdue = useCallback(async () => {
    setOverdueLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/portfolio/compliance/overdue');
      const j = (await res.json()) as { obligations?: OverdueApiRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setOverdueRows(j.obligations ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setOverdueLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setErr(null);
    try {
      const q = activityFundFilter === 'all' ? '' : `?fund_id=${encodeURIComponent(activityFundFilter)}`;
      const res = await fetch(`/api/portfolio/compliance/actions${q}`);
      const j = (await res.json()) as { actions?: ActivityRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setActivity(j.actions ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActivityLoading(false);
    }
  }, [activityFundFilter]);

  useEffect(() => {
    if (tab === 'overdue') void loadOverdue();
  }, [tab, loadOverdue]);

  useEffect(() => {
    if (tab === 'activity') void loadActivity();
  }, [tab, loadActivity]);

  const fully = rows.filter((r) => r.compliance_status === 'fully_compliant');
  const auditsOut = rows.filter((r) => r.compliance_status === 'audits_outstanding');
  const reportsOut = rows.filter((r) => r.compliance_status === 'reports_outstanding');
  const totalOverdue = rows.reduce((a, r) => a + r.overdue, 0);
  const needsAttention = rows.filter(
    (r) => r.compliance_status !== 'fully_compliant' && r.compliance_status !== 'no_data',
  );

  const fundById = useMemo(() => new Map(funds.map((f) => [f.id, f])), [funds]);

  const openReminderForFund = (fundId: string, obligationIds?: string[]) => {
    const f = fundById.get(fundId);
    if (!f) return;
    const overdue = overdueObligations(f.vc_reporting_obligations ?? []);
    const ids = obligationIds?.length ? obligationIds : overdue.map((o) => o.id);
    setReminderFund(f);
    setReminderObligationIds(ids);
    setReminderName('');
    setReminderEmail('');
    setReminderOpen(true);
  };

  const openEscalateForFund = (fundId: string) => {
    const f = fundById.get(fundId);
    if (!f) return;
    const overdue = auditOverdueObligations(f.vc_reporting_obligations ?? []);
    const ids = overdue.length ? overdue.map((o) => o.id) : overdueObligations(f.vc_reporting_obligations ?? []).map((o) => o.id);
    setEscalateFund(f);
    setEscalateObligationIds(ids);
    setEscLevel('supervisor');
    setEscName('');
    setEscEmail('');
    setEscNotes('');
    setEscalateOpen(true);
  };

  const reminderPreview = useMemo(() => {
    if (!reminderFund) return '';
    const overdue = (reminderFund.vc_reporting_obligations ?? []).filter((o) => reminderObligationIds.includes(o.id));
    const lines = overdue
      .map((o) => `- ${o.period_label} (${REPORT_SHORT[o.report_type] ?? o.report_type}) — ${o.days_overdue ?? 0} days overdue`)
      .join('\n');
    return `Dear ${reminderFund.manager_name || 'Fund Manager'},

This is a reminder that the following reports are outstanding for ${reminderFund.fund_name}:

${lines}

Please submit these reports at your earliest convenience.

Regards,
DBJ Private Capital Team`;
  }, [reminderFund, reminderObligationIds]);

  const saveReminder = async () => {
    if (!reminderName.trim() || !reminderEmail.trim() || reminderObligationIds.length === 0) return;
    const recipient = `${reminderName.trim()} <${reminderEmail.trim()}>`;
    setBusy(true);
    setErr(null);
    try {
      for (const oid of reminderObligationIds) {
        const res = await fetch(`/api/portfolio/obligations/${oid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_reminder', reminder_recipient: recipient }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      }
      setReminderOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveEscalation = async () => {
    if (!escName.trim() || !escEmail.trim() || escalateObligationIds.length === 0) return;
    const to = `${escName.trim()} <${escEmail.trim()}>`;
    setBusy(true);
    setErr(null);
    try {
      for (const oid of escalateObligationIds) {
        const res = await fetch(`/api/portfolio/obligations/${oid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'escalate',
            escalation_level: escLevel,
            escalated_to: to,
            notes: escNotes.trim() || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      }
      setEscalateOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveMarkReceived = async () => {
    if (!recvRow || !recvDate.trim() || !recvBy.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/obligations/${recvRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_received',
          submitted_date: recvDate.trim(),
          submitted_by: recvBy.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setRecvOpen(false);
      await loadOverdue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const filteredOverdue = useMemo(() => {
    let list = [...overdueRows];
    if (overdueFundFilter !== 'all') list = list.filter((r) => r.fund_id === overdueFundFilter);
    if (overdueTypeFilter !== 'all') list = list.filter((r) => r.report_type === overdueTypeFilter);
    if (overdueSort === 'days') list.sort((a, b) => b.days_overdue - a.days_overdue);
    else if (overdueSort === 'fund') list.sort((a, b) => a.fund_name.localeCompare(b.fund_name));
    else list.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    return list;
  }, [overdueRows, overdueFundFilter, overdueTypeFilter, overdueSort]);

  const rowBg = (days: number) => {
    if (days > 365) return 'bg-red-50';
    if (days > 90) return 'bg-orange-50/50';
    if (days > 30) return 'bg-amber-50/30';
    return 'bg-white';
  };

  return (
    <div className="w-full space-y-8">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45] sm:text-3xl">Compliance Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">Based on PCTU reporting obligations</p>
        </div>
        <Button type="button" variant="outline" className="shrink-0 border-gray-300 text-[#0B1F45]" disabled>
          Export
        </Button>
      </div>

      <div className="flex gap-6 border-b border-gray-200">
        {(
          [
            ['overview', 'Overview'],
            ['overdue', 'Overdue'],
            ['activity', 'Activity Log'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              '-mb-px border-b-2 pb-3 text-sm',
              tab === k ? 'border-[#0B1F45] font-medium text-[#0B1F45]' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-teal-50/30 p-5 pt-6 shadow-sm">
              <div className="absolute left-0 right-0 top-0 h-1 bg-teal-500" />
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15">
                <CheckCircle2 className="h-4 w-4 text-teal-600/80" aria-hidden />
              </div>
              <p className="text-3xl font-bold text-[#0B1F45]">{fully.length}</p>
              <p className="mt-1 text-sm text-gray-500">Fully Compliant</p>
              <p className="mt-2 text-xs text-gray-400">Funds meeting obligations</p>
            </div>
            <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-amber-50/30 p-5 pt-6 shadow-sm">
              <div className="absolute left-0 right-0 top-0 h-1 bg-amber-500" />
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15">
                <AlertTriangle className="h-4 w-4 text-amber-700/80" aria-hidden />
              </div>
              <p className="text-3xl font-bold text-[#0B1F45]">{auditsOut.length}</p>
              <p className="mt-1 text-sm text-gray-500">Audits Outstanding</p>
              <p className="mt-2 text-xs text-gray-400">Annual audit filings</p>
            </div>
            <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-orange-50/30 p-5 pt-6 shadow-sm">
              <div className="absolute left-0 right-0 top-0 h-1 bg-orange-500" />
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/15">
                <FileX className="h-4 w-4 text-orange-700/80" aria-hidden />
              </div>
              <p className="text-3xl font-bold text-[#0B1F45]">{reportsOut.length}</p>
              <p className="mt-1 text-sm text-gray-500">Reports Outstanding</p>
              <p className="mt-2 text-xs text-gray-400">Non-audit items</p>
            </div>
            <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-red-50/30 p-5 pt-6 shadow-sm">
              <div className="absolute left-0 right-0 top-0 h-1 bg-red-500" />
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15">
                <AlertCircle className="h-4 w-4 text-red-600/80" aria-hidden />
              </div>
              <p className="text-3xl font-bold text-[#0B1F45]">{totalOverdue}</p>
              <p className="mt-1 text-sm text-gray-500">Total Overdue</p>
              <p className="mt-2 text-xs text-gray-400">Obligations past due</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Fund</th>
                    <th className="px-5 py-3">Manager</th>
                    <th className="px-5 py-3">Currency</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Accepted</th>
                    <th className="px-5 py-3">Outstanding</th>
                    <th className="px-5 py-3">Overdue</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-gray-500">
                        No active funds.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const badge = COMPLIANCE_BADGE[r.compliance_status] ?? COMPLIANCE_BADGE.no_data;
                      const iconsDisabled = r.outstanding === 0;
                      return (
                        <tr key={r.fund_id} className={cn('transition-colors hover:bg-gray-50/80', rowAccent(r.compliance_status))}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-[#0B1F45]">{r.fund_name}</p>
                          </td>
                          <td className="px-5 py-3 text-gray-600">{r.manager_name || '—'}</td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                'inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
                                r.currency === 'JMD'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-blue-200 bg-blue-50 text-blue-700',
                              )}
                            >
                              {r.currency}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-600">{r.total_obligations}</td>
                          <td className="px-5 py-3 font-medium text-teal-600">{r.accepted}</td>
                          <td className={cn('px-5 py-3 font-medium', r.outstanding > 0 ? 'text-amber-600' : 'text-gray-400')}>
                            {r.outstanding > 0 ? r.outstanding : '—'}
                          </td>
                          <td className={cn('px-5 py-3 font-medium', r.overdue > 0 ? 'text-red-600' : 'text-gray-400')}>
                            {r.overdue > 0 ? r.overdue : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', badge.className)}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex flex-nowrap items-center justify-end gap-[6px]">
                              <button
                                type="button"
                                aria-label="Send reminder"
                                aria-disabled={iconsDisabled}
                                tabIndex={iconsDisabled ? -1 : 0}
                                className={cn(
                                  'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border-[0.5px] border-[#e0e2ea] bg-transparent text-gray-600 transition-colors',
                                  !iconsDisabled &&
                                    'hover:bg-[#f0f4ff] hover:border-[#3A6FD8] hover:text-[#3A6FD8]',
                                  iconsDisabled && 'pointer-events-none opacity-[0.35]',
                                )}
                                onClick={() => {
                                  if (iconsDisabled) return;
                                  openReminderForFund(r.fund_id);
                                }}
                              >
                                <Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label="Escalate"
                                aria-disabled={iconsDisabled}
                                tabIndex={iconsDisabled ? -1 : 0}
                                className={cn(
                                  'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border-[0.5px] border-[#e0e2ea] bg-transparent text-gray-600 transition-colors',
                                  !iconsDisabled &&
                                    'hover:bg-[#FEF0EE] hover:border-[#D85A30] hover:text-[#D85A30]',
                                  iconsDisabled && 'pointer-events-none opacity-[0.35]',
                                )}
                                onClick={() => {
                                  if (iconsDisabled) return;
                                  openEscalateForFund(r.fund_id);
                                }}
                              >
                                <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                              </button>
                              <span className="inline-block h-[18px] w-[0.5px] shrink-0 bg-[#e0e2ea]" aria-hidden />
                              <Link
                                href={`/portfolio/funds/${r.fund_id}`}
                                className="shrink-0 text-[12px] leading-none text-[#3A6FD8] hover:underline"
                              >
                                View →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-teal-100 bg-teal-50 p-5">
              <p className="text-sm font-semibold text-teal-800">Fully Compliant</p>
              <p className="mt-2 text-4xl font-bold text-teal-700">{fully.length}</p>
              <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto text-sm text-teal-700">
                {fully.map((r) => (
                  <li key={r.fund_id}>
                    <Link href={`/portfolio/funds/${r.fund_id}`} className="hover:underline">
                      {r.fund_name}
                    </Link>
                  </li>
                ))}
                {fully.length === 0 ? <li className="text-teal-600/70">None</li> : null}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-5">
              <p className="text-sm font-semibold text-amber-900">Needs Attention</p>
              <p className="mt-2 text-4xl font-bold text-amber-700">{needsAttention.length}</p>
              <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto text-sm text-amber-800">
                {needsAttention.map((r) => (
                  <li key={r.fund_id}>
                    <Link href={`/portfolio/funds/${r.fund_id}`} className="hover:underline">
                      {r.fund_name}
                    </Link>
                  </li>
                ))}
                {needsAttention.length === 0 ? <li className="text-amber-700/70">None</li> : null}
              </ul>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-900">Total Overdue Items</p>
              <p className="mt-2 text-4xl font-bold text-red-700">{totalOverdue}</p>
              <p className="mt-4 text-sm text-red-500">Reporting obligations past due date</p>
            </div>
          </div>
        </>
      ) : null}

      {tab === 'overdue' ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#0B1F45]">Overdue Reporting Obligations</h2>
            <p className="text-sm text-red-600">
              {overdueLoading ? 'Loading…' : `${filteredOverdue.length} obligations past due date`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={overdueFundFilter}
              onChange={(e) => setOverdueFundFilter(e.target.value)}
            >
              <option value="all">All funds</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fund_name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={overdueTypeFilter}
              onChange={(e) => setOverdueTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              {Object.entries(REPORT_SHORT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={overdueSort}
              onChange={(e) => setOverdueSort(e.target.value as typeof overdueSort)}
            >
              <option value="days">Most Overdue</option>
              <option value="fund">Fund Name</option>
              <option value="due">Due Date</option>
            </select>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Fund</th>
                    <th className="px-4 py-3">Report Period</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Days Overdue</th>
                    <th className="px-4 py-3">Escalated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overdueLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                      </td>
                    </tr>
                  ) : filteredOverdue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                        No overdue obligations.
                      </td>
                    </tr>
                  ) : (
                    filteredOverdue.map((o) => (
                      <tr key={o.id} className={rowBg(o.days_overdue)}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#0B1F45]">{o.fund_name}</p>
                          <span className="mt-1 inline-flex rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{o.currency}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{o.period_label}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                            {REPORT_SHORT[o.report_type] ?? o.report_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600">{fmtDue(o.due_date)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-600">{o.days_overdue} days</td>
                        <td className="px-4 py-3">
                          {o.escalated_at ? (
                            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                              {escalationLabel(o.escalation_level)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              type="button"
                              className="bg-[#0B1F45] hover:bg-[#162d5e]"
                              onClick={() => {
                                setRecvRow(o);
                                setRecvDate(todayIso());
                                setRecvBy('');
                                setRecvOpen(true);
                              }}
                            >
                              Mark Received
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              className="border-amber-300 text-amber-800"
                              onClick={() => {
                                const fund = fundById.get(o.fund_id);
                                if (fund) {
                                  setReminderFund(fund);
                                  setReminderObligationIds([o.id]);
                                  setReminderName('');
                                  setReminderEmail('');
                                  setReminderOpen(true);
                                }
                              }}
                            >
                              Send Reminder
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              className="border-red-300 text-red-800"
                              onClick={() => {
                                const fund = fundById.get(o.fund_id);
                                if (fund) {
                                  setEscalateFund(fund);
                                  setEscalateObligationIds([o.id]);
                                  setEscLevel('supervisor');
                                  setEscName('');
                                  setEscEmail('');
                                  setEscNotes('');
                                  setEscalateOpen(true);
                                }
                              }}
                            >
                              Escalate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#0B1F45]">Compliance Activity</h2>
            <p className="text-sm text-gray-400">All actions taken on reporting obligations</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Fund</Label>
            <select
              className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={activityFundFilter}
              onChange={(e) => setActivityFundFilter(e.target.value)}
            >
              <option value="all">All funds</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fund_name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white">
            {activityLoading ? (
              <div className="flex justify-center py-16 text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : activity.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Clock className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
                <p className="mt-3 text-sm font-medium text-gray-600">No compliance actions recorded yet</p>
                <p className="mt-1 text-xs text-gray-400">
                  Actions appear here when obligations are marked received, reminders sent, or reports escalated
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 px-4">
                {activity.map((a) => {
                  const t = String(a.action_type);
                  const iconWrap =
                    t === 'marked_received'
                      ? 'bg-blue-100 text-blue-700'
                      : t === 'marked_accepted'
                        ? 'bg-teal-100 text-teal-700'
                        : t === 'reminder_sent'
                          ? 'bg-amber-100 text-amber-700'
                          : t === 'escalated'
                            ? 'bg-red-100 text-red-700'
                            : t === 'document_uploaded'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600';
                  const Icon =
                    t === 'marked_received'
                      ? Clock
                      : t === 'marked_accepted'
                        ? Check
                        : t === 'reminder_sent'
                          ? Bell
                          : t === 'escalated'
                            ? AlertCircle
                            : t === 'document_uploaded'
                              ? FileText
                              : StickyNote;
                  return (
                    <div key={String(a.id)} className="flex items-start gap-3 py-4">
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', iconWrap)}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#0B1F45]">{actionDescription(a)}</p>
                        <p className="text-xs text-gray-400">
                          {String(a.fund_name ?? '')} — {String(a.obligation_period_label ?? '')}{' '}
                          {REPORT_SHORT[String(a.obligation_report_type)] ?? String(a.obligation_report_type ?? '')}
                        </p>
                        {a.notes ? <p className="mt-1 text-xs italic text-gray-500">{String(a.notes)}</p> : null}
                      </div>
                      <div className="shrink-0 text-right text-xs text-gray-400">
                        <p>{String(a.actor_name ?? '')}</p>
                        <p>{formatRelative(String(a.created_at))}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {reminderOpen && reminderFund ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setReminderOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#0B1F45]">Send Reminder — {reminderFund.fund_name}</h3>
              <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={() => setReminderOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-xs text-gray-700">
              {(reminderFund.vc_reporting_obligations ?? [])
                .filter((o) => reminderObligationIds.includes(o.id))
                .map((o) => (
                  <li key={o.id}>
                    {o.period_label} — {REPORT_SHORT[o.report_type] ?? o.report_type} — {o.days_overdue ?? 0} days overdue
                  </li>
                ))}
            </ul>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Recipient name</Label>
                <Input className="mt-1" value={reminderName} onChange={(e) => setReminderName(e.target.value)} required />
              </div>
              <div>
                <Label>Recipient email</Label>
                <Input type="email" className="mt-1" value={reminderEmail} onChange={(e) => setReminderEmail(e.target.value)} required />
              </div>
              <div>
                <Label>Message preview</Label>
                <Textarea className="mt-1 font-mono text-xs" rows={10} readOnly value={reminderPreview} />
              </div>
              <p className="text-xs italic text-gray-400">
                This records the reminder in the system. Send the actual email separately.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setReminderOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0B1F45]" disabled={busy || !reminderName.trim() || !reminderEmail.trim()} onClick={() => void saveReminder()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Record Reminder Sent
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {escalateOpen && escalateFund ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setEscalateOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#0B1F45]">Escalate — {escalateFund.fund_name}</h3>
              <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={() => setEscalateOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {escalateObligationIds.length} obligation(s) — overdue audit / reporting items
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Escalate to</Label>
                <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={escLevel} onChange={(e) => setEscLevel(e.target.value as typeof escLevel)}>
                  <option value="analyst">Analyst</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="unit_head">Unit Head</option>
                </select>
              </div>
              <div>
                <Label>Name</Label>
                <Input className="mt-1" value={escName} onChange={(e) => setEscName(e.target.value)} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" className="mt-1" value={escEmail} onChange={(e) => setEscEmail(e.target.value)} required />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea className="mt-1" rows={3} value={escNotes} onChange={(e) => setEscNotes(e.target.value)} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEscalateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0B1F45]" disabled={busy || !escName.trim() || !escEmail.trim()} onClick={() => void saveEscalation()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Record Escalation
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {recvOpen && recvRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setRecvOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold text-[#0B1F45]">Mark as Received</h3>
            <p className="text-sm text-gray-500">
              {recvRow.fund_name} — {recvRow.period_label}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Submitted date</Label>
                <Input type="date" className="mt-1" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} />
              </div>
              <div>
                <Label>Submitted by</Label>
                <Input className="mt-1" value={recvBy} onChange={(e) => setRecvBy(e.target.value)} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setRecvOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0B1F45]" disabled={busy || !recvDate || !recvBy.trim()} onClick={() => void saveMarkReceived()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
