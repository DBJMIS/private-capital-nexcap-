'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, FileText, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AvatarInitials } from '@/components/ui/AvatarInitials';
import { dsTable, dsType } from '@/components/ui/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CfpDetailPayload, CfpApplicationListRow } from '@/lib/cfp/detail-data';
import { formatCfpDate, formatCfpDateRange } from '@/lib/cfp/format-dates';
import { formatShortDate } from '@/lib/format-date';
import { CfpStatusBadge } from '@/components/cfp/CfpStatusBadge';
import { EditCfpModal } from '@/components/cfp/EditCfpModal';
import { PanelMemberModal } from '@/components/cfp/PanelMemberModal';
import { DBJ_INVESTMENT_CRITERIA } from '@/lib/cfp/dbj-criteria';
import { EvaluationMatrix, type EvaluationMatrixMember } from '@/components/cfp/EvaluationMatrix';

type TabKey = 'overview' | 'applications' | 'panel';

type PanelRow = {
  id: string;
  member_name: string;
  member_organisation: string | null;
  member_email: string | null;
  member_type: string;
  is_fund_manager: boolean;
  excluded_application_ids: string[] | null;
  nda_signed: boolean;
  nda_signed_date: string | null;
};

const CARD = 'rounded-xl border border-gray-200 bg-white p-6';
const CARD_TITLE = 'text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4';

function parseMilestones(raw: unknown): { date: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      date: String((m as Record<string, unknown>).date ?? ''),
      label: String((m as Record<string, unknown>).label ?? ''),
    }))
    .filter((m) => m.date || m.label);
}

function isReadOnlyCfp(status: string) {
  const s = status.toLowerCase();
  return s === 'closed' || s === 'archived';
}

function noonTs(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00`).getTime();
}

function calendarDayDiff(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / 86_400_000);
}

function timelinePhase(opening: string, closing: string): {
  phase: 'before' | 'active' | 'after';
  progressPct: number;
  message: string;
} {
  const open = noonTs(opening);
  const close = noonTs(closing);
  const now = Date.now();
  if (now < open) {
    const days = Math.max(0, calendarDayDiff(now, open));
    return { phase: 'before', progressPct: 0, message: days === 0 ? 'Opens today' : `Opens in ${days} day${days === 1 ? '' : 's'}` };
  }
  if (now > close) {
    const days = Math.max(0, calendarDayDiff(close, now));
    return { phase: 'after', progressPct: 100, message: `Closed ${days} day${days === 1 ? '' : 's'} ago` };
  }
  const span = close - open;
  const pct = span <= 0 ? 100 : Math.min(100, Math.max(0, ((now - open) / span) * 100));
  const remaining = Math.max(0, calendarDayDiff(now, close));
  return {
    phase: 'active',
    progressPct: pct,
    message: `${remaining} day${remaining === 1 ? '' : 's'} remaining`,
  };
}

function showViewDdLink(a: CfpApplicationListRow): boolean {
  if (!a.questionnaire_id) return false;
  const s = a.status.toLowerCase();
  return s === 'due_diligence' || s === 'approved' || s === 'funded';
}

function scoreTone(score: number): string {
  if (score >= 70) return 'text-[#0F8A6E]';
  if (score >= 40) return 'text-[#C8973A]';
  return 'text-[#0B1F45]';
}

type Props = {
  initial: CfpDetailPayload;
  canWrite: boolean;
};

export function CfpDetailView({ initial, canWrite }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<TabKey>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [panelModal, setPanelModal] = useState<{ mode: 'create' | 'edit'; member: PanelRow | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [appStatusFilter, setAppStatusFilter] = useState<string>('all');
  const [panelRemoveMemberId, setPanelRemoveMemberId] = useState<string | null>(null);
  const [panelRemoveBusy, setPanelRemoveBusy] = useState(false);
  const [appsSubView, setAppsSubView] = useState<'list' | 'matrix'>('list');

  const refresh = useCallback(async () => {
    const id = String(data.cfp.id);
    const res = await fetch(`/api/cfp/${id}`, { cache: 'no-store' });
    const j = (await res.json()) as CfpDetailPayload & { error?: string };
    if (res.ok && !j.error) setData(j as CfpDetailPayload);
  }, [data.cfp.id]);

  const cfp = data.cfp as {
    id: string;
    title: string;
    description: string | null;
    opening_date: string;
    closing_date: string;
    status: string;
    investment_criteria: unknown;
    timeline_milestones: unknown;
    created_at: string;
    created_by: string;
  };

  const lockedLifecycle = isReadOnlyCfp(cfp.status);
  const readOnly = lockedLifecycle || !canWrite;
  const milestones = useMemo(() => parseMilestones(cfp.timeline_milestones), [cfp.timeline_milestones]);
  const timeline = useMemo(
    () => timelinePhase(cfp.opening_date, cfp.closing_date),
    [cfp.opening_date, cfp.closing_date],
  );

  const criteriaObj = (cfp.investment_criteria && typeof cfp.investment_criteria === 'object'
    ? cfp.investment_criteria
    : {}) as Record<string, unknown>;

  const activate = async () => {
    setBusy('activate');
    try {
      const res = await fetch(`/api/cfp/${cfp.id}/activate`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBusy(null);
        alert(j.error ?? 'Activation failed');
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const closeCfp = async () => {
    setBusy('close');
    try {
      const res = await fetch(`/api/cfp/${cfp.id}/close`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBusy(null);
        alert(j.error ?? 'Close failed');
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const confirmRemovePanelMember = async () => {
    if (!panelRemoveMemberId) return;
    setPanelRemoveBusy(true);
    try {
      const res = await fetch(`/api/cfp/${cfp.id}/panel-members/${panelRemoveMemberId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        alert(j.error ?? 'Remove failed');
        return;
      }
      setPanelRemoveMemberId(null);
      await refresh();
    } finally {
      setPanelRemoveBusy(false);
    }
  };

  const panelRows = (data.panel_members ?? []) as PanelRow[];
  const matrixMembers: EvaluationMatrixMember[] = useMemo(
    () =>
      panelRows
        .filter((m) => !m.is_fund_manager)
        .map((m) => ({ id: m.id, member_name: m.member_name, member_type: m.member_type })),
    [panelRows],
  );
  const appCount = data.stats.applications_received;
  const panelCount = data.stats.panel_members;

  const statusOptions = useMemo(() => {
    const set = new Set(data.applications.map((a) => a.status).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [data.applications]);

  const filteredApplications = useMemo(() => {
    if (appStatusFilter === 'all') return data.applications;
    return data.applications.filter((a) => a.status === appStatusFilter);
  }, [data.applications, appStatusFilter]);

  const statStrip = [
    { label: 'Applications Received', value: data.stats.applications_received },
    { label: 'Pre-Qualified', value: data.stats.pre_qualified },
    { label: 'In DD', value: data.stats.in_due_diligence },
    { label: 'Panel Members', value: data.stats.panel_members },
  ];

  return (
    <div className="w-full min-w-0 pb-10">
      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="px-5 pt-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-stretch lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-snug text-[#0B1F45]">{cfp.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                <CfpStatusBadge status={cfp.status} />
                <span className="text-gray-300">·</span>
                <span>{formatCfpDateRange(cfp.opening_date, cfp.closing_date)}</span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 self-start lg:self-center lg:justify-end">
              {canWrite && cfp.status === 'draft' ? (
                <>
                  <Button
                    type="button"
                    className="bg-[#0F8A6E] text-white hover:bg-[#0c735d]"
                    disabled={!!busy}
                    onClick={() => void activate()}
                  >
                    {busy === 'activate' ? 'Activating…' : 'Activate CFP'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                </>
              ) : null}
              {canWrite && cfp.status === 'active' ? (
                <>
                  <Button type="button" variant="outline" disabled={!!busy} onClick={() => void closeCfp()}>
                    {busy === 'close' ? 'Closing…' : 'Close CFP'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                </>
              ) : null}
              {canWrite && cfp.status !== 'draft' && cfp.status !== 'active' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={lockedLifecycle}
                  className={lockedLifecycle ? 'pointer-events-none opacity-50' : ''}
                  title={lockedLifecycle ? 'This CFP is closed' : undefined}
                  onClick={() => !lockedLifecycle && setEditOpen(true)}
                >
                  Edit
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-gray-100 pb-6 pt-6 sm:flex-row sm:items-stretch sm:gap-0">
            {statStrip.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center text-center sm:px-4',
                  i > 0 && 'sm:border-l sm:border-gray-100',
                )}
              >
                <p className="text-2xl font-bold leading-none text-[#0B1F45]">{s.value}</p>
                <p className="mt-2 text-xs font-medium text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="border-t border-gray-200 px-5 sm:px-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="CFP tabs">
            {(
              [
                ['overview', 'Overview', null],
                ['applications', 'Applications', appCount],
                ['panel', 'Panel Members', panelCount],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                  tab === key ? 'border-[#C8973A] text-[#0B1F45]' : 'border-transparent text-gray-500 hover:text-[#0B1F45]',
                )}
                onClick={() => setTab(key)}
              >
                {label}
                {count != null ? ` (${count})` : ''}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="w-full space-y-6 pt-2">
        {lockedLifecycle ? (
          <div className="rounded-xl border border-gray-200 bg-amber-50/80 px-4 py-3 text-sm text-gray-800 shadow-sm">
            This CFP is closed. No new applications are accepted.
          </div>
        ) : null}

        {tab === 'overview' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section className={CARD}>
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
                  <h2 className={CARD_TITLE}>CFP description</h2>
                  {canWrite && !lockedLifecycle ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#0F8A6E] hover:underline"
                      onClick={() => setEditOpen(true)}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
                {cfp.description?.trim() ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{cfp.description.trim()}</p>
                ) : (
                  <p className="text-sm italic text-gray-400">No description added</p>
                )}
              </section>

              <section className={CARD}>
                <h2 className={CARD_TITLE}>Timeline</h2>
                <div className="rounded-xl border border-gray-100 bg-[#FAFAFA] p-5">
                  <div className="flex items-start justify-between gap-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Opening</p>
                      <p className="mt-1 font-semibold text-[#0B1F45]">{formatCfpDate(cfp.opening_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Closing</p>
                      <p className="mt-1 font-semibold text-[#0B1F45]">{formatCfpDate(cfp.closing_date)}</p>
                    </div>
                  </div>
                  <div className="relative mt-6">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-[#C8973A] transition-all"
                        style={{ width: `${timeline.progressPct}%` }}
                      />
                    </div>
                    {timeline.phase === 'active' ? (
                      <div
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0B1F45] shadow"
                        style={{ left: `${timeline.progressPct}%` }}
                        title="Today"
                      />
                    ) : null}
                  </div>
                  <p className="mt-4 text-center text-sm font-medium text-gray-700">{timeline.message}</p>
                </div>
                {milestones.length ? (
                  <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
                    {milestones.map((m, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span className="font-medium text-[#0B1F45]">{m.label || '—'}</span>
                        <span>{m.date ? formatCfpDate(m.date) : '—'}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className={CARD}>
                <h2 className={CARD_TITLE}>Key details</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <DetailPair label="Created by" value={data.created_by_name} />
                  <DetailPair label="Created" value={new Date(cfp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Status</dt>
                    <dd className="mt-1">
                      <CfpStatusBadge status={cfp.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">CFP ID</dt>
                    <dd className="mt-1">
                      <CopyableId id={cfp.id} />
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="space-y-6 lg:col-span-1">
              <section className={CARD}>
                <div className="mb-4 flex items-center justify-between gap-2 border-b border-gray-100 pb-4">
                  <h2 className={CARD_TITLE}>Investment criteria</h2>
                  {canWrite && !lockedLifecycle ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                <div className="divide-y divide-gray-100">
                  <InvestmentCriterionRow
                    icon="🏦"
                    label="Min fund size"
                    value={`USD ${formatUsdFull(criteriaObj.fund_target_size_min_usd)}`}
                  />
                  <InvestmentCriterionRow
                    icon="📊"
                    label="DBJ participation"
                    value={`Up to ${criteriaObj.dbj_participation_max_pct ?? '—'}% / max USD ${formatNum(criteriaObj.dbj_participation_max_usd)}`}
                  />
                  <InvestmentCriterionRow
                    icon="💼"
                    label="Manager commitment"
                    value={`Minimum ${criteriaObj.manager_commitment_min_pct ?? '—'}%`}
                  />
                  <InvestmentCriterionRow
                    icon="🇯🇲"
                    label="Jamaica allocation"
                    value={`Minimum ${criteriaObj.jamaica_allocation_min_pct ?? '—'}%`}
                  />
                  <InvestmentCriterionRow
                    icon="🏛"
                    label="Private capital"
                    value={`Minimum ${criteriaObj.private_capital_min_pct ?? '—'}%`}
                  />
                  <InvestmentCriterionRow
                    icon="⏱"
                    label="Fund duration"
                    value={`Minimum ${criteriaObj.fund_duration_min_years ?? '—'} years`}
                  />
                </div>
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className={cn(CARD_TITLE, 'mb-3')}>Focus sectors</p>
                  <SectorTags items={criteriaObj.focus_sectors} fallback={DBJ_INVESTMENT_CRITERIA.focus_sectors} />
                </div>
                {(Array.isArray(criteriaObj.legal_structures) && (criteriaObj.legal_structures as unknown[]).length > 0) ||
                (Array.isArray(criteriaObj.stage_focus) && (criteriaObj.stage_focus as unknown[]).length > 0) ? (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-xs text-gray-600">
                    <CriteriaMini label="Legal structures" items={criteriaObj.legal_structures} fallback={DBJ_INVESTMENT_CRITERIA.legal_structures} />
                    <CriteriaMini label="Stage focus" items={criteriaObj.stage_focus} fallback={DBJ_INVESTMENT_CRITERIA.stage_focus} />
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}

        {tab === 'applications' ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-[#0B1F45]">
                Applications ({filteredApplications.length}
                {appStatusFilter !== 'all' ? ` of ${data.applications.length}` : ''})
              </h2>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setAppsSubView('list')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      appsSubView === 'list' ? 'bg-white text-[#0B1F45] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    Applications List
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppsSubView('matrix')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      appsSubView === 'matrix' ? 'bg-white text-[#0B1F45] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    Evaluation Matrix
                  </button>
                </div>
                {appsSubView === 'list' ? (
                  <div className="w-full sm:w-56">
                    <Select value={appStatusFilter} onValueChange={setAppStatusFilter}>
                      <SelectTrigger aria-label="Filter by status">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </div>

            {appsSubView === 'matrix' ? (
              <EvaluationMatrix cfpId={cfp.id} applications={data.applications} panelMembers={matrixMembers} />
            ) : null}

            {appsSubView === 'list' ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {data.applications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <FileText className="h-10 w-10 text-gray-300" aria-hidden />
                  <p className="mt-4 text-base font-semibold text-[#0B1F45]">No applications received yet</p>
                  <p className={cn('mt-2 max-w-md text-sm', dsType.muted)}>
                    Share this CFP with fund managers to begin receiving applications.
                  </p>
                </div>
              ) : filteredApplications.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-gray-500">No applications match this filter.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className={dsTable.thead}>
                      <tr>
                        <th className={dsTable.th}>Fund name</th>
                        <th className={dsTable.th}>Manager</th>
                        <th className={dsTable.th}>Submitted</th>
                        <th className={dsTable.th}>Status</th>
                        <th className={dsTable.th}>Score</th>
                        <th className={cn(dsTable.th, 'text-right')}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {filteredApplications.map((a) => (
                        <tr key={a.id} className={dsTable.tr}>
                          <td className={dsTable.td}>
                            <span className="font-medium text-[#0B1F45]">{a.fund_name}</span>
                          </td>
                          <td className={dsTable.td}>{a.manager_name}</td>
                          <td className={cn(dsTable.td, 'text-gray-500')}>
                            {a.submitted_at ? formatShortDate(a.submitted_at) : '—'}
                          </td>
                          <td className={dsTable.td}>
                            <StatusBadge status={a.status} />
                          </td>
                          <td className={dsTable.td}>
                            {a.assessment_score != null ? (
                              <span className={cn('text-lg font-bold', scoreTone(Number(a.assessment_score)))}>
                                {Number(a.assessment_score).toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className={cn(dsTable.td, 'text-right')}>
                            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm font-semibold">
                              <Link href={`/fund-applications/${a.id}`} className="text-[#0B1F45] hover:underline">
                                View →
                              </Link>
                              {a.status === 'pre_screening' || a.status === 'submitted' ? (
                                <Link href={`/applications/${a.id}/prequalification`} className="text-[#0F8A6E] hover:underline">
                                  Pre-qualify →
                                </Link>
                              ) : null}
                              {showViewDdLink(a) ? (
                                <Link href={`/questionnaires/${a.questionnaire_id}`} className="text-[#C8973A] hover:underline">
                                  View DD →
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'panel' ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Panel Members ({panelRows.length})</h2>
              {canWrite ? (
                <Button
                  type="button"
                  className="bg-[#0B1F45] text-white hover:bg-[#162d5e]"
                  onClick={() => setPanelModal({ mode: 'create', member: null })}
                >
                  + Add Panel Member
                </Button>
              ) : null}
            </div>

            {panelRows.length === 0 ? (
              <div className={cn(CARD, 'flex flex-col items-center justify-center py-16 text-center')}>
                <Users className="h-10 w-10 text-gray-300" aria-hidden />
                <p className="mt-4 text-base font-semibold text-[#0B1F45]">No panel members added</p>
                <p className={cn('mt-2 max-w-md text-sm', dsType.muted)}>Add investors and stakeholders to the panel.</p>
                {canWrite ? (
                  <Button
                    type="button"
                    className="mt-6 bg-[#0B1F45] text-white hover:bg-[#162d5e]"
                    onClick={() => setPanelModal({ mode: 'create', member: null })}
                  >
                    + Add Panel Member
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-4">
                {panelRows.map((m) => {
                  const excluded = m.is_fund_manager ? m.excluded_application_ids?.length ?? 0 : 0;
                  return (
                    <li key={m.id} className={CARD}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <AvatarInitials name={m.member_name} className="!h-11 !w-11 !bg-[#0B1F45] !text-white" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-[#0B1F45]">{m.member_name}</p>
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                  m.member_type === 'observer' ? 'bg-gray-100 text-gray-600' : 'bg-[#0B1F45] text-white',
                                )}
                              >
                                {m.member_type === 'observer' ? 'Observer' : 'Voting'}
                              </span>
                              {m.nda_signed ? (
                                <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                                  NDA ✓
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                  NDA Pending
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-600">{m.member_organisation || '—'}</p>
                            {m.member_email ? (
                              <p className="mt-0.5 truncate text-sm text-gray-500">{m.member_email}</p>
                            ) : null}
                            {excluded > 0 ? (
                              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                                Excluded from {excluded} application{excluded === 1 ? '' : 's'}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {canWrite ? (
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={() => setPanelModal({ mode: 'edit', member: m })}>
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-red-700 hover:bg-red-50"
                              onClick={() => setPanelRemoveMemberId(m.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <EditCfpModal open={editOpen} cfp={cfp} readOnly={readOnly} onClose={() => setEditOpen(false)} onSaved={() => void refresh()} />

      {panelModal ? (
        <PanelMemberModal
          open
          mode={panelModal.mode}
          cfpId={cfp.id}
          member={panelModal.member}
          applications={data.applications}
          onClose={() => setPanelModal(null)}
          onSaved={() => void refresh()}
        />
      ) : null}

      <ConfirmModal
        isOpen={panelRemoveMemberId !== null}
        title="Remove panel member?"
        message="This removes the panel member from this Call for Proposals. Applications already scored are not changed."
        confirmLabel="Remove"
        confirmVariant="danger"
        isLoading={panelRemoveBusy}
        onConfirm={() => void confirmRemovePanelMember()}
        onCancel={() => setPanelRemoveMemberId(null)}
      />
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${id.slice(0, 8)}…${id.slice(-4)}`;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800 hover:bg-gray-100"
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {short}
      <Copy className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      {copied ? <span className="text-teal-700">Copied</span> : null}
    </button>
  );
}

function InvestmentCriterionRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-3 py-4 first:pt-0">
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold text-[#0B1F45]">{value}</p>
      </div>
    </div>
  );
}

function SectorTags({ items, fallback }: { items: unknown; fallback: readonly string[] }) {
  const list = Array.isArray(items) && (items as unknown[]).length ? (items as string[]) : [...fallback];
  if (!list.length) return <p className="text-sm italic text-gray-400">None specified</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((s) => (
        <span key={s} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {s}
        </span>
      ))}
    </div>
  );
}

function CriteriaMini({
  label,
  items,
  fallback,
}: {
  label: string;
  items: unknown;
  fallback: readonly string[];
}) {
  const list = Array.isArray(items) ? (items as string[]) : [];
  const show = list.length ? list : [...fallback];
  if (!show.length) return null;
  return (
    <p>
      <span className="font-semibold text-gray-700">{label}: </span>
      {show.join(', ')}
    </p>
  );
}

function formatUsdFull(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatNum(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-GB');
}
