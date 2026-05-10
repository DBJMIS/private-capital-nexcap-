'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { daysFromNow, formatPortalDate, formatReportType } from '@/lib/portal/format-helpers';
import type { PortalComplianceObligationDto, PortalComplianceResponse } from '@/types/portal-compliance';

const TABLER_ICONS_CSS =
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.26.0/dist/tabler-icons.min.css';

const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_TERTIARY = '#9CA3AF';
const BG_PRIMARY = '#FFFFFF';
const BG_SECONDARY = '#F3F4F6';
const BORDER_SECONDARY = '#EBEAE6';

function parseJsonMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const msg = (body as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim().length > 0 ? msg.trim() : null;
}

type ActiveTab = 'action_required' | 'upcoming' | 'history' | 'all';

type ComplianceSortOrder = 'urgency' | 'date_asc' | 'date_desc' | 'type';

function isOverdueItem(o: PortalComplianceObligationDto): boolean {
  return o.status === 'overdue' || o.days_overdue > 0;
}

function isActionRequiredTab(o: PortalComplianceObligationDto): boolean {
  if (['submitted', 'accepted', 'waived'].includes(o.status)) return false;
  if (isOverdueItem(o)) return true;
  return daysFromNow(o.due_date) <= 30;
}

function isUpcomingWindowTab(o: PortalComplianceObligationDto): boolean {
  const ex = new Set<string>(['submitted', 'accepted', 'waived', 'overdue']);
  if (ex.has(o.status)) return false;
  if (o.days_overdue > 0) return false;
  const d = daysFromNow(o.due_date);
  return d > 30 && d <= 90;
}

function isHistoryTab(o: PortalComplianceObligationDto): boolean {
  return ['submitted', 'under_review', 'accepted', 'waived'].includes(o.status);
}

function filterByActiveTab(list: PortalComplianceObligationDto[], tab: ActiveTab): PortalComplianceObligationDto[] {
  if (tab === 'all') return [...list];
  if (tab === 'action_required') return list.filter(isActionRequiredTab);
  if (tab === 'upcoming') return list.filter(isUpcomingWindowTab);
  if (tab === 'history') return list.filter(isHistoryTab);
  return list;
}

function overdueUrgencyScore(o: PortalComplianceObligationDto): number {
  if (o.days_overdue > 0) return o.days_overdue;
  const d = daysFromNow(o.due_date);
  if (d < 0) return Math.abs(d);
  return 0;
}

function actionRequiredUrgencySort(a: PortalComplianceObligationDto, b: PortalComplianceObligationDto): number {
  const aOver = isOverdueItem(a);
  const bOver = isOverdueItem(b);
  if (aOver && !bOver) return -1;
  if (!aOver && bOver) return 1;
  if (aOver && bOver) return overdueUrgencyScore(b) - overdueUrgencyScore(a);
  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
}

function historySort(a: PortalComplianceObligationDto, b: PortalComplianceObligationDto): number {
  const ta = a.submitted_date?.trim()
    ? new Date(a.submitted_date.slice(0, 10)).getTime()
    : new Date(a.due_date.slice(0, 10)).getTime();
  const tb = b.submitted_date?.trim()
    ? new Date(b.submitted_date.slice(0, 10)).getTime()
    : new Date(b.due_date.slice(0, 10)).getTime();
  return tb - ta;
}

function allTabBucket(o: PortalComplianceObligationDto): number {
  if (o.status === 'accepted') return 4;
  if (o.status === 'waived') return 5;
  if (o.status === 'submitted' || o.status === 'under_review') return 3;
  const d = daysFromNow(o.due_date);
  if (isOverdueItem(o) || d < 0) return 0;
  if (d >= 0 && d <= 30) return 1;
  return 2;
}

function allTabSort(a: PortalComplianceObligationDto, b: PortalComplianceObligationDto): number {
  const ba = allTabBucket(a);
  const bb = allTabBucket(b);
  if (ba !== bb) return ba - bb;
  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
}

function ComplianceSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-24 rounded-xl bg-gray-200" />
      <div className="h-16 rounded-lg bg-gray-100" />
      <div className="h-10 rounded-lg bg-gray-100" />
      <div className="h-32 rounded-xl bg-gray-50" />
    </div>
  );
}

function tabCountsFromList(obligations: PortalComplianceObligationDto[]) {
  return {
    action_required: obligations.filter(isActionRequiredTab).length,
    upcoming: obligations.filter(isUpcomingWindowTab).length,
    history: obligations.filter(isHistoryTab).length,
    all: obligations.length,
  };
}

export default function PortalFundCompliancePage() {
  const params = useParams();
  const appId = typeof params?.id === 'string' ? params.id : '';

  const [data, setData] = useState<PortalComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('action_required');
  const [feedbackOpenById, setFeedbackOpenById] = useState<Record<string, boolean>>({});
  const [sortOrder, setSortOrder] = useState<ComplianceSortOrder>('urgency');

  useEffect(() => {
    const id = 'tabler-icons-webfont-compliance';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = TABLER_ICONS_CSS;
    document.head.appendChild(link);
  }, []);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setPageErr(null);
    try {
      const res = await fetch(`/api/portal/funds/${encodeURIComponent(appId)}/compliance`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setData(null);
        setPageErr(parseJsonMessage(json) ?? 'Could not load compliance data.');
        return;
      }
      setData(json as PortalComplianceResponse);
    } catch {
      setData(null);
      setPageErr('Network error.');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const portfolio = data?.portfolio_fund ?? null;
  const obligations = data?.obligations ?? [];
  const summary = data?.summary ?? null;

  const overdueCount = summary?.overdue ?? 0;
  const dueSoonCount = summary?.due_soon ?? 0;
  const acceptedCount = summary?.accepted ?? 0;
  const totalCount = summary?.total ?? 0;

  const baseFiltered = useMemo(() => filterByActiveTab(obligations, activeTab), [obligations, activeTab]);

  const displayedObligations = useMemo(() => {
    const list = [...baseFiltered];
    if (activeTab === 'history') {
      list.sort(historySort);
      return list;
    }
    if (activeTab === 'all') {
      list.sort(allTabSort);
      return list;
    }
    if (activeTab === 'action_required') {
      if (sortOrder === 'urgency') list.sort(actionRequiredUrgencySort);
      else if (sortOrder === 'date_asc') list.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      else if (sortOrder === 'date_desc') list.sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
      else list.sort((a, b) => a.report_type.localeCompare(b.report_type));
      return list;
    }
    if (activeTab === 'upcoming') {
      if (sortOrder === 'urgency' || sortOrder === 'date_asc') {
        list.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      } else if (sortOrder === 'date_desc') {
        list.sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
      } else {
        list.sort((a, b) => a.report_type.localeCompare(b.report_type));
      }
      return list;
    }
    return list;
  }, [baseFiltered, activeTab, sortOrder]);

  const tabBadge = useMemo(() => tabCountsFromList(obligations), [obligations]);

  useEffect(() => {
    setSortOrder('urgency');
  }, [activeTab]);

  if (!appId) return null;

  return (
    <div className="w-full">
      <div className="mb-4 flex justify-end">
        <Link href={`/portal/funds/${appId}`} style={{ fontSize: 14, fontWeight: 500, color: '#1D9E75' }} className="hover:underline">
          ← Back to Overview
        </Link>
      </div>

      {loading ? <ComplianceSkeleton /> : null}

      {!loading && pageErr ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{pageErr}</div>
      ) : null}

      {!loading && !pageErr && !portfolio ? (
        <div
          className="mx-auto flex max-w-md flex-col items-center rounded-xl border bg-white text-center shadow-sm"
          style={{ borderWidth: '0.5px', borderColor: BORDER_SECONDARY, padding: 48 }}
        >
          <i className="ti ti-shield" style={{ fontSize: 48, color: TEXT_TERTIARY }} aria-hidden />
          <p style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: TEXT_PRIMARY }}>Compliance not yet available</p>
          <p style={{ marginTop: 8, fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
            Your compliance obligations will appear here once your fund commitment is confirmed by DBJ.
          </p>
        </div>
      ) : null}

      {!loading && !pageErr && portfolio && summary ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: '#111827',
                margin: 0,
              }}
            >
              Compliance
            </h1>
            <p
              style={{
                fontSize: 13,
                color: '#6B7280',
                margin: '4px 0 0',
              }}
            >
              Your reporting obligations and deadlines with DBJ
            </p>
          </div>
          <div className="overflow-hidden bg-white shadow-sm" style={{ borderRadius: 12, border: `0.5px solid ${BORDER_SECONDARY}` }}>
          <div
            style={{
              padding: '20px 24px',
              borderBottom: `0.5px solid ${BORDER_SECONDARY}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: TEXT_TERTIARY,
                  marginBottom: 4,
                }}
              >
                Compliance
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, color: TEXT_PRIMARY }}>{portfolio.fund_name}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {overdueCount > 0 ? (
                <div
                  style={{
                    background: '#FCEBEB',
                    color: '#A32D2D',
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: '0.5px solid #F09595',
                  }}
                >
                  {overdueCount} overdue
                </div>
              ) : null}
              {acceptedCount > 0 ? (
                <div
                  style={{
                    background: '#E1F5EE',
                    color: '#0F6E56',
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: '0.5px solid #5DCAA5',
                  }}
                >
                  {acceptedCount} accepted
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="flex flex-col border-b sm:flex-row"
            style={{ borderBottomWidth: '0.5px', borderBottomColor: BORDER_SECONDARY }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderRight: '0.5px solid #EBEAE6',
                backgroundColor: overdueCount > 0 ? '#FCEBEB' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flex: '1 1 0',
              }}
              className="border-b border-[#EBEAE6] sm:border-b-0 sm:border-r sm:border-r-[#EBEAE6]"
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: overdueCount > 0 ? '#F7C1C1' : '#F1EFE8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i
                  className="ti ti-alert-circle"
                  style={{
                    fontSize: 18,
                    color: overdueCount > 0 ? '#791F1F' : '#9CA3AF',
                  }}
                  aria-hidden="true"
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: overdueCount > 0 ? '#A32D2D' : '#9CA3AF',
                    marginBottom: 4,
                  }}
                >
                  Overdue
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: overdueCount > 0 ? '#791F1F' : '#111827',
                    lineHeight: 1,
                  }}
                >
                  {overdueCount}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: overdueCount > 0 ? '#A32D2D' : '#9CA3AF',
                    marginTop: 3,
                  }}
                >
                  {overdueCount > 0 ? 'Immediate action required' : 'None outstanding'}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '16px 20px',
                borderRight: '0.5px solid #EBEAE6',
                backgroundColor: dueSoonCount > 0 ? '#FAEEDA' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flex: '1 1 0',
              }}
              className="border-b border-[#EBEAE6] sm:border-b-0 sm:border-r sm:border-r-[#EBEAE6]"
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: dueSoonCount > 0 ? '#FAC775' : '#F1EFE8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i
                  className="ti ti-calendar-due"
                  style={{
                    fontSize: 18,
                    color: dueSoonCount > 0 ? '#633806' : '#9CA3AF',
                  }}
                  aria-hidden="true"
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: dueSoonCount > 0 ? '#854F0B' : '#9CA3AF',
                    marginBottom: 4,
                  }}
                >
                  Due within 30 days
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: dueSoonCount > 0 ? '#633806' : '#111827',
                    lineHeight: 1,
                  }}
                >
                  {dueSoonCount}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: dueSoonCount > 0 ? '#854F0B' : '#9CA3AF',
                    marginTop: 3,
                  }}
                >
                  {dueSoonCount > 0 ? 'Upload to Reports section' : 'No upcoming deadlines'}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '16px 20px',
                borderRight: '0.5px solid #EBEAE6',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flex: '1 1 0',
              }}
              className="border-b border-[#EBEAE6] sm:border-b-0 sm:border-r sm:border-r-[#EBEAE6]"
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#E6F1FB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-clock" style={{ fontSize: 18, color: '#185FA5' }} aria-hidden="true" />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#9CA3AF',
                    marginBottom: 4,
                  }}
                >
                  Awaiting review
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#111827', lineHeight: 1 }}>{summary.submitted}</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>Submitted to DBJ</div>
              </div>
            </div>
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: acceptedCount > 0 ? '#E1F5EE' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flex: '1 1 0',
              }}
              className="sm:border-b-0"
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: acceptedCount > 0 ? '#9FE1CB' : '#F1EFE8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i
                  className="ti ti-circle-check"
                  style={{
                    fontSize: 18,
                    color: acceptedCount > 0 ? '#085041' : '#9CA3AF',
                  }}
                  aria-hidden="true"
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: acceptedCount > 0 ? '#0F6E56' : '#9CA3AF',
                    marginBottom: 4,
                  }}
                >
                  Accepted by DBJ
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: acceptedCount > 0 ? '#085041' : '#111827',
                    lineHeight: 1,
                  }}
                >
                  {acceptedCount}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: acceptedCount > 0 ? '#0F6E56' : '#9CA3AF',
                    marginTop: 3,
                  }}
                >
                  {acceptedCount > 0 ? `${acceptedCount} of ${totalCount} complete` : 'None accepted yet'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '0 24px', borderBottom: `0.5px solid ${BORDER_SECONDARY}`, display: 'flex', flexWrap: 'wrap' }}>
            {(
              [
                ['action_required', 'Action Required', tabBadge.action_required, 'red'] as const,
                ['upcoming', 'Upcoming', tabBadge.upcoming, 'amber'] as const,
                ['history', 'History', tabBadge.history, 'gray'] as const,
                ['all', 'All', tabBadge.all, 'gray'] as const,
              ] as const
            ).map(([id, label, count, tone]) => {
              const active = activeTab === id;
              const badgeBg =
                tone === 'red' && count > 0
                  ? '#FCEBEB'
                  : tone === 'amber' && count > 0
                    ? '#FAEEDA'
                    : BG_SECONDARY;
              const badgeColor =
                tone === 'red' && count > 0 ? '#A32D2D' : tone === 'amber' && count > 0 ? '#854F0B' : TEXT_SECONDARY;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  style={{
                    padding: '12px 0',
                    marginRight: 24,
                    fontSize: 13,
                    cursor: 'pointer',
                    borderBottom: active ? '2px solid #1D9E75' : '2px solid transparent',
                    color: active ? '#1D9E75' : TEXT_SECONDARY,
                    fontWeight: active ? 500 : 400,
                    background: 'none',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                  }}
                >
                  {label}
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      marginLeft: 4,
                      background: badgeBg,
                      color: badgeColor,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {(activeTab === 'action_required' || activeTab === 'upcoming') && obligations.length > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 24px',
                borderBottom: `0.5px solid ${BORDER_SECONDARY}`,
                backgroundColor: '#FAFAF9',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                {displayedObligations.length} obligation{displayedObligations.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Sort</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as ComplianceSortOrder)}
                  style={{
                    fontSize: 12,
                    color: '#374151',
                    border: '0.5px solid #D3D1C7',
                    borderRadius: 7,
                    padding: '5px 10px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="urgency">Most urgent first</option>
                  <option value="date_asc">Due date (earliest first)</option>
                  <option value="date_desc">Due date (latest first)</option>
                  <option value="type">Report type</option>
                </select>
              </div>
            </div>
          ) : null}

          {obligations.length === 0 ? (
            <div className="flex flex-col items-center text-center" style={{ padding: 48 }}>
              <i className="ti ti-shield" style={{ fontSize: 48, color: TEXT_TERTIARY }} aria-hidden />
              <p style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: TEXT_PRIMARY }}>No obligations yet</p>
              <p style={{ marginTop: 8, fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                Your compliance obligations will appear here once your fund is active in the portfolio.
              </p>
            </div>
          ) : activeTab === 'action_required' && baseFiltered.length === 0 ? (
            <ActionRequiredEmptyState />
          ) : displayedObligations.length === 0 ? (
            <TabEmptyState tab={activeTab} />
          ) : (
            <>
              <div
                className="hidden md:grid md:items-center md:gap-4"
                style={{
                  gridTemplateColumns: '32px 1fr auto auto',
                  padding: '10px 24px',
                  borderBottom: `0.5px solid ${BORDER_SECONDARY}`,
                }}
              >
                <div />
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TEXT_TERTIARY, fontWeight: 500 }}>
                  Report
                </div>
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: TEXT_TERTIARY,
                    fontWeight: 500,
                    textAlign: 'right',
                  }}
                >
                  Due date
                </div>
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: TEXT_TERTIARY,
                    fontWeight: 500,
                    textAlign: 'right',
                    minWidth: 80,
                  }}
                >
                  Status
                </div>
              </div>

              <ul className="m-0 list-none p-0">
                {displayedObligations.map((o, idx) => (
                  <ComplianceObligationRow
                    key={o.id}
                    obligation={o}
                    isLast={idx === displayedObligations.length - 1}
                    feedbackOpen={!!feedbackOpenById[o.id]}
                    onToggleFeedback={() => setFeedbackOpenById((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
                  />
                ))}
              </ul>
            </>
          )}

          <div style={{ padding: '12px 24px 16px', borderTop: `0.5px solid ${BORDER_SECONDARY}`, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: TEXT_TERTIARY, fontStyle: 'italic', textAlign: 'center' }}>
              Read-only view · To submit reports visit the Reports section · Contact your DBJ relationship manager for questions
            </div>
          </div>
        </div>
        </>
      ) : null}
    </div>
  );
}

function TabEmptyState({ tab }: { tab: ActiveTab }) {
  if (tab === 'history') {
    return (
      <div className="flex flex-col items-center text-center" style={{ padding: 32 }}>
        <i className="ti ti-check" style={{ fontSize: 32, color: '#1D9E75' }} aria-hidden />
        <p style={{ marginTop: 12, fontSize: 14, color: TEXT_SECONDARY }}>No history items in this view.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: 32 }}>
      <i className="ti ti-shield" style={{ fontSize: 32, color: TEXT_TERTIARY }} aria-hidden />
      <p style={{ marginTop: 12, fontSize: 14, color: TEXT_SECONDARY }}>
        {tab === 'upcoming'
          ? 'No obligations in the 31–90 day window.'
          : tab === 'all'
            ? 'Nothing matches this filter.'
            : 'Nothing to show here.'}
      </p>
    </div>
  );
}

function ActionRequiredEmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#E1F5EE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <i className="ti ti-check" style={{ fontSize: 24, color: '#1D9E75' }} aria-hidden />
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#111827', marginBottom: 6 }}>No action required</div>
      <div style={{ fontSize: 13, color: '#6B7280', maxWidth: 280 }}>
        You have no overdue or upcoming obligations due within 30 days.
      </div>
    </div>
  );
}

type RowVisual = 'overdue' | 'due_soon' | 'accepted' | 'submitted' | 'waived' | 'upcoming';

function rowVisual(o: PortalComplianceObligationDto): RowVisual {
  if (o.status === 'waived') return 'waived';
  if (o.status === 'accepted') return 'accepted';
  if (o.status === 'submitted' || o.status === 'under_review') return 'submitted';
  if (isOverdueItem(o) || (daysFromNow(o.due_date) < 0 && !['submitted', 'accepted', 'waived', 'under_review'].includes(o.status)))
    return 'overdue';
  const d = daysFromNow(o.due_date);
  if (d >= 0 && d <= 30) return 'due_soon';
  return 'upcoming';
}

function reportIconClass(reportType: string): string {
  switch (reportType) {
    case 'quarterly_financial':
      return 'ti ti-chart-bar';
    case 'quarterly_investment_mgmt':
      return 'ti ti-file-analytics';
    case 'audited_annual':
      return 'ti ti-building-bank';
    case 'inhouse_quarterly':
      return 'ti ti-file-description';
    default:
      return 'ti ti-file-text';
  }
}

function iconColors(reportType: string, visual: RowVisual): { bg: string; color: string } {
  if (visual === 'accepted') return { bg: '#9FE1CB', color: '#085041' };
  if (visual === 'overdue') return { bg: '#F7C1C1', color: '#791F1F' };
  switch (reportType) {
    case 'quarterly_financial':
    case 'inhouse_quarterly':
      return { bg: '#E1F5EE', color: '#0F6E56' };
    case 'quarterly_investment_mgmt':
      return { bg: '#E6F1FB', color: '#185FA5' };
    case 'audited_annual':
      return { bg: '#EEEDFE', color: '#534AB7' };
    default:
      return { bg: '#E1F5EE', color: '#0F6E56' };
  }
}

function statusPill(visual: RowVisual): { bg: string; color: string; border: string; label: string } {
  switch (visual) {
    case 'overdue':
      return { bg: '#FCEBEB', color: '#791F1F', border: '0.5px solid #F09595', label: 'Overdue' };
    case 'due_soon':
      return { bg: '#FAEEDA', color: '#633806', border: '0.5px solid #EF9F27', label: 'Due soon' };
    case 'submitted':
      return { bg: '#E6F1FB', color: '#0C447C', border: '0.5px solid #85B7EB', label: 'Submitted' };
    case 'accepted':
      return { bg: '#E1F5EE', color: '#085041', border: '0.5px solid #5DCAA5', label: 'Accepted' };
    case 'waived':
      return { bg: '#F1EFE8', color: '#5F5E5A', border: '0.5px solid #D3D1C7', label: 'Waived' };
    default:
      return {
        bg: BG_SECONDARY,
        color: TEXT_TERTIARY,
        border: `0.5px solid ${BORDER_SECONDARY}`,
        label: 'Upcoming',
      };
  }
}

function line2Text(o: PortalComplianceObligationDto, visual: RowVisual): string {
  const period = o.period_label;
  if (visual === 'submitted' || visual === 'accepted') {
    const sd = o.submitted_date?.trim();
    if (sd) return `${period} · Submitted ${formatPortalDate(sd.slice(0, 10))}`;
    return period;
  }
  if (visual === 'overdue') {
    const dAway = daysFromNow(o.due_date);
    const n = o.days_overdue > 0 ? o.days_overdue : dAway < 0 ? Math.abs(dAway) : 0;
    return n > 0 ? `${period} · ${n} days overdue` : `${period} · Overdue`;
  }
  const dIn = Math.max(0, daysFromNow(o.due_date));
  return `${period} · Due in ${dIn} days`;
}

function ComplianceObligationRow({
  obligation: o,
  isLast,
  feedbackOpen,
  onToggleFeedback,
}: {
  obligation: PortalComplianceObligationDto;
  isLast: boolean;
  feedbackOpen: boolean;
  onToggleFeedback: () => void;
}) {
  const visual = rowVisual(o);
  const ic = iconColors(o.report_type, visual);
  const pill = statusPill(visual);
  const hasFeedback = !!(o.review_notes && o.review_notes.trim().length > 0);

  let rowBg = BG_PRIMARY;
  if (visual === 'overdue') rowBg = '#FCEBEB';
  else if (visual === 'due_soon') rowBg = '#FAEEDA';
  else if (visual === 'accepted') rowBg = '#E1F5EE';

  let line1 = TEXT_PRIMARY;
  let line2 = TEXT_SECONDARY;
  let dateColor = TEXT_SECONDARY;
  let dateWeight: 400 | 500 = 400;
  let rowOpacity = 1;
  if (visual === 'overdue') {
    line1 = '#501313';
    line2 = '#A32D2D';
    dateColor = '#A32D2D';
    dateWeight = 500;
  } else if (visual === 'due_soon') {
    line1 = '#412402';
    line2 = '#854F0B';
    dateColor = '#854F0B';
    dateWeight = 500;
  } else if (visual === 'accepted') {
    line1 = '#085041';
    line2 = '#0F6E56';
    dateColor = '#0F6E56';
  }
  if (visual === 'waived') rowOpacity = 0.6;

  const dueStr = formatPortalDate(o.due_date.slice(0, 10));

  return (
    <li style={{ borderBottom: isLast ? undefined : `0.5px solid ${BORDER_SECONDARY}` }}>
      <div
        className="grid grid-cols-[32px_1fr] gap-x-4 gap-y-1 px-6 py-[14px] md:grid-cols-[32px_1fr_auto_auto] md:grid-rows-1 md:items-center md:gap-4"
        style={{ background: rowBg, opacity: rowOpacity }}
      >
        <div className="row-start-1 row-span-3 self-start pt-0.5 md:row-span-1 md:self-center md:pt-0">
          <div className="flex h-8 w-8 items-center justify-center" style={{ borderRadius: 7, background: ic.bg, color: ic.color }}>
            <i className={reportIconClass(o.report_type)} style={{ fontSize: 16 }} aria-hidden />
          </div>
        </div>

        <div className="col-start-2 row-start-1 row-span-3 min-w-0 md:col-start-2 md:row-start-1 md:row-span-1">
          <div style={{ fontSize: 13, fontWeight: 500, color: line1 }}>{formatReportType(o.report_type)}</div>
          <div style={{ fontSize: 11, marginTop: 2, color: line2 }}>
            {line2Text(o, visual)}
            {hasFeedback ? (
              <button
                type="button"
                onClick={onToggleFeedback}
                style={{
                  background: '#E6F1FB',
                  color: '#185FA5',
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  marginLeft: 4,
                  border: 'none',
                  fontWeight: 500,
                }}
              >
                DBJ feedback
              </button>
            ) : null}
          </div>
        </div>

        <div
          className="col-start-2 row-start-4 md:col-start-3 md:row-start-1 md:text-right"
          style={{ fontSize: 13, fontWeight: dateWeight, color: dateColor }}
        >
          {dueStr}
        </div>

        <div className="col-start-2 row-start-5 text-left md:col-start-4 md:row-start-1 md:text-right" style={{ minWidth: 80 }}>
          <span
            style={{
              display: 'inline-flex',
              fontSize: 11,
              fontWeight: 500,
              padding: '3px 8px',
              borderRadius: 20,
              whiteSpace: 'nowrap',
              background: pill.bg,
              color: pill.color,
              border: pill.border,
            }}
          >
            {pill.label}
          </span>
        </div>
      </div>

      {hasFeedback && feedbackOpen ? (
        <div
          style={{
            padding: '8px 12px',
            margin: '4px 24px 0 48px',
            background: '#E6F1FB',
            borderRadius: 8,
            border: '0.5px solid #85B7EB',
            fontSize: 12,
            color: '#0C447C',
            lineHeight: 1.5,
          }}
        >
          {o.review_notes!.trim()}
        </div>
      ) : null}
    </li>
  );
}
