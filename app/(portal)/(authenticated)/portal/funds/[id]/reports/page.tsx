'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PortalReportingListResponse, PortalReportingObligationDto } from '@/types/portal-reports';
import { cn } from '@/lib/utils';
import { daysFromNow, formatPortalDate, formatReportType } from '@/lib/portal/format-helpers';

const TABLER_ICONS_CSS =
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.26.0/dist/tabler-icons.min.css';

const TEXT_SECONDARY = '#6B7280';
const TEXT_TERTIARY = '#9CA3AF';
const TEXT_PRIMARY = '#111827';

function parseJsonMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const msg = (body as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim().length > 0 ? msg.trim() : null;
}

function isOverdueCount(o: PortalReportingObligationDto): boolean {
  return o.status === 'overdue' || o.days_overdue > 0;
}

function isDueSoonHeaderCount(o: PortalReportingObligationDto): boolean {
  if (isOverdueCount(o)) return false;
  const ex = new Set(['submitted', 'accepted', 'waived']);
  if (ex.has(o.status)) return false;
  const d = daysFromNow(o.due_date);
  return d >= 0 && d <= 30;
}

function isOverdueForTabs(o: PortalReportingObligationDto): boolean {
  return o.status === 'overdue' || o.days_overdue > 0 || daysFromNow(o.due_date) < 0;
}

function isActionRequiredTab(o: PortalReportingObligationDto): boolean {
  const terminal = new Set(['submitted', 'accepted', 'waived', 'under_review']);
  if (terminal.has(o.status)) return false;
  if (isOverdueForTabs(o)) return true;
  const d = daysFromNow(o.due_date);
  return d >= 0 && d <= 30;
}

function isUpcomingTab(o: PortalReportingObligationDto): boolean {
  const terminal = new Set(['submitted', 'accepted', 'waived', 'under_review']);
  if (terminal.has(o.status)) return false;
  return daysFromNow(o.due_date) > 30;
}

function isSubmittedTab(o: PortalReportingObligationDto): boolean {
  return o.status === 'submitted' || o.status === 'under_review';
}

function isAcceptedTab(o: PortalReportingObligationDto): boolean {
  return o.status === 'accepted' || o.status === 'waived';
}

type ReportTab = 'all' | 'action' | 'upcoming' | 'submitted' | 'accepted';

type SortOrder = 'date_desc' | 'date_asc' | 'status' | 'type';

function filterByTab(list: PortalReportingObligationDto[], tab: ReportTab): PortalReportingObligationDto[] {
  if (tab === 'all') return list;
  if (tab === 'action') return list.filter(isActionRequiredTab);
  if (tab === 'upcoming') return list.filter(isUpcomingTab);
  if (tab === 'submitted') return list.filter(isSubmittedTab);
  if (tab === 'accepted') return list.filter(isAcceptedTab);
  return list;
}

function UploadIcon32() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden className="mx-auto text-[#00A99D]">
      <path
        d="M12 4v14M8 10l4-4 4 4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.5">
      <circle className="opacity-25" cx="12" cy="12" r="10" />
      <path className="opacity-90" d="M4 12a8 8 018-8v4a4 4 014 4H4z" fill="currentColor" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function isUploadAllowed(status: string): boolean {
  return !['accepted', 'waived', 'submitted', 'under_review'].includes(status);
}

function obligationRowKind(
  o: PortalReportingObligationDto,
): 'overdue' | 'dueSoon' | 'upcoming' | 'submitted' | 'accepted' | 'waived' {
  if (o.status === 'accepted') return 'accepted';
  if (o.status === 'waived') return 'waived';
  if (o.status === 'submitted' || o.status === 'under_review') return 'submitted';
  const d = daysFromNow(o.due_date);
  if (o.days_overdue > 0 || o.status === 'overdue' || d < 0) return 'overdue';
  if (d >= 0 && d <= 30) return 'dueSoon';
  return 'upcoming';
}

function reportTypeIcon(reportType: string): { icon: string; bg: string; color: string } {
  switch (reportType) {
    case 'quarterly_financial':
      return { icon: 'ti ti-chart-bar', bg: '#E1F5EE', color: '#0F6E56' };
    case 'quarterly_investment_mgmt':
      return { icon: 'ti ti-file-analytics', bg: '#E6F1FB', color: '#185FA5' };
    case 'audited_annual':
      return { icon: 'ti ti-building-bank', bg: '#EEEDFE', color: '#534AB7' };
    case 'inhouse_quarterly':
      return { icon: 'ti ti-file-description', bg: '#FAEEDA', color: '#633806' };
    default:
      return { icon: 'ti ti-file-text', bg: '#F3F4F6', color: '#4B5563' };
  }
}

function ReportsSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-24 rounded-xl bg-gray-200" />
      <div className="h-16 rounded-lg bg-gray-100" />
      <div className="h-10 rounded-lg bg-gray-100" />
      <div className="h-24 rounded-xl bg-gray-50" />
    </div>
  );
}

export default function PortalFundReportsPage() {
  const params = useParams();
  const appId = typeof params?.id === 'string' ? params.id : '';
  const [data, setData] = useState<PortalReportingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>('all');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('date_desc');

  useEffect(() => {
    const id = 'tabler-icons-webfont-reports';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = TABLER_ICONS_CSS;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!successBanner) return;
    const t = window.setTimeout(() => setSuccessBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [successBanner]);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setPageErr(null);
    try {
      const res = await fetch(`/api/portal/funds/${encodeURIComponent(appId)}/reports`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setData(null);
        setPageErr(parseJsonMessage(json) ?? 'Could not load reports.');
        return;
      }
      setData(json as PortalReportingListResponse);
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

  const obligations = data?.obligations ?? [];

  const { overdueCount, dueSoonCount, totalCount, overdueStatCount, acceptedCount, pendingCount } = useMemo(() => {
    let overdueCount = 0;
    let dueSoonCount = 0;
    for (const o of obligations) {
      if (isOverdueCount(o)) overdueCount += 1;
      else if (isDueSoonHeaderCount(o)) dueSoonCount += 1;
    }
    const total = obligations.length;
    const overdueStat = obligations.filter(isOverdueCount).length;
    const accepted = obligations.filter((o) => o.status === 'accepted').length;
    const pending = obligations.filter((o) => {
      if (isOverdueCount(o)) return false;
      if (o.status === 'accepted' || o.status === 'waived') return false;
      return true;
    }).length;
    return {
      overdueCount,
      dueSoonCount,
      totalCount: total,
      overdueStatCount: overdueStat,
      acceptedCount: accepted,
      pendingCount: pending,
    };
  }, [obligations]);

  const tabCounts = useMemo(() => {
    return {
      all: obligations.length,
      action: obligations.filter(isActionRequiredTab).length,
      upcoming: obligations.filter(isUpcomingTab).length,
      submitted: obligations.filter(isSubmittedTab).length,
      accepted: obligations.filter(isAcceptedTab).length,
    };
  }, [obligations]);

  const filteredObligations = useMemo(() => filterByTab(obligations, reportTab), [obligations, reportTab]);

  useEffect(() => {
    setReportTypeFilter('all');
  }, [reportTab]);

  const displayedObligations = useMemo(() => {
    let list = [...filteredObligations];

    if (reportTypeFilter !== 'all') {
      list = list.filter((o) => o.report_type === reportTypeFilter);
    }

    const statusOrder: Record<string, number> = {
      overdue: 0,
      due: 1,
      pending: 2,
      submitted: 3,
      under_review: 4,
      accepted: 5,
      waived: 6,
    };

    list.sort((a, b) => {
      switch (sortOrder) {
        case 'date_asc':
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case 'date_desc':
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        case 'status':
          return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        case 'type':
          return a.report_type.localeCompare(b.report_type);
        default:
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
      }
    });

    return list;
  }, [filteredObligations, reportTypeFilter, sortOrder]);

  const historyRows = useMemo(() => {
    return (data?.obligations ?? [])
      .filter((o) => ['submitted', 'under_review', 'accepted', 'waived'].includes(o.status))
      .sort((a, b) => {
        const ta = a.submitted_date?.slice(0, 10) ?? '';
        const tb = b.submitted_date?.slice(0, 10) ?? '';
        return tb.localeCompare(ta);
      });
  }, [data?.obligations]);

  const [modalObligation, setModalObligation] = useState<PortalReportingObligationDto | null>(null);

  if (!appId) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex justify-end">
        <Link href={`/portal/funds/${appId}`} className="text-sm font-medium text-[#1D9E75] hover:underline">
          ← Back to Overview
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', margin: 0 }}>Reports</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
          Upload your quarterly and annual reports for DBJ review
        </p>
      </div>

      {successBanner ? (
        <div
          role="status"
          className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {successBanner}
        </div>
      ) : null}

      {loading ? <ReportsSkeleton /> : null}

      {!loading && pageErr ? <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{pageErr}</div> : null}

      {!loading && !pageErr && data && !data.portfolio_fund ? (
        <div
          className="mx-auto flex max-w-md flex-col items-center rounded-xl border bg-white text-center shadow-sm"
          style={{ borderWidth: '0.5px', borderColor: '#EBEAE6', padding: 48 }}
        >
          <i className="ti ti-file-off" style={{ fontSize: 48, color: TEXT_TERTIARY }} aria-hidden />
          <p className="mt-4" style={{ fontSize: 16, fontWeight: 500, color: TEXT_PRIMARY }}>
            Reports not yet available
          </p>
          <p className="mt-2 text-sm" style={{ color: TEXT_SECONDARY }}>
            Reporting obligations will appear here once your fund commitment is confirmed by DBJ.
          </p>
        </div>
      ) : null}

      {!loading && !pageErr && data?.portfolio_fund ? (
        <div
          className="overflow-hidden bg-white shadow-sm"
          style={{ borderRadius: 12, border: '0.5px solid #EBEAE6' }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '0.5px solid #EBEAE6',
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
                Reports
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, color: TEXT_PRIMARY }}>{data.portfolio_fund.fund_name}</div>
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
              {dueSoonCount > 0 ? (
                <div
                  style={{
                    background: '#FAEEDA',
                    color: '#854F0B',
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: '0.5px solid #EF9F27',
                  }}
                >
                  {dueSoonCount} due soon
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '0.5px solid #EBEAE6' }}>
            <div style={{ padding: '16px 20px', borderRight: '0.5px solid #EBEAE6', backgroundColor: 'white' }}>
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
                Total obligations
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#111827' }}>{totalCount}</div>
            </div>

            <div
              style={{
                padding: '16px 20px',
                borderRight: '0.5px solid #EBEAE6',
                backgroundColor: overdueStatCount > 0 ? '#FCEBEB' : 'white',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: overdueStatCount > 0 ? '#A32D2D' : '#9CA3AF',
                  marginBottom: 4,
                }}
              >
                Overdue
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: overdueStatCount > 0 ? '#791F1F' : '#111827' }}>{overdueStatCount}</div>
            </div>

            <div
              style={{
                padding: '16px 20px',
                borderRight: '0.5px solid #EBEAE6',
                backgroundColor: acceptedCount > 0 ? '#E1F5EE' : 'white',
              }}
            >
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
                Accepted
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: acceptedCount > 0 ? '#085041' : '#111827' }}>{acceptedCount}</div>
            </div>

            <div style={{ padding: '16px 20px', backgroundColor: 'white' }}>
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
                Pending
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#111827' }}>{pendingCount}</div>
            </div>
          </div>

          <div style={{ padding: '0 24px', borderBottom: '0.5px solid #EBEAE6', display: 'flex', flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All', tabCounts.all, 'default'] as const,
                ['action', 'Action Required', tabCounts.action, 'red'] as const,
                ['upcoming', 'Upcoming', tabCounts.upcoming, 'neutral'] as const,
                ['submitted', 'Submitted', tabCounts.submitted, 'default'] as const,
                ['accepted', 'Accepted', tabCounts.accepted, 'green'] as const,
              ] as const
            ).map(([id, label, count, badgeTone]) => {
              const active = reportTab === id;
              const badgeStyle: CSSProperties =
                badgeTone === 'red' && count > 0
                  ? { background: '#FCEBEB', color: '#A32D2D' }
                  : badgeTone === 'neutral'
                    ? { background: '#F3F4F6', color: TEXT_SECONDARY }
                    : badgeTone === 'green'
                      ? { background: '#E1F5EE', color: '#0F6E56' }
                      : { background: '#F3F4F6', color: TEXT_TERTIARY };
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReportTab(id)}
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
                  className="hover:opacity-90"
                >
                  {label}
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      marginLeft: 4,
                      ...badgeStyle,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 24px',
              borderBottom: '0.5px solid #EBEAE6',
              backgroundColor: '#FAFAF9',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={reportTypeFilter}
                onChange={(e) => setReportTypeFilter(e.target.value)}
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
                <option value="all">All report types</option>
                <option value="quarterly_financial">Quarterly Financial</option>
                <option value="quarterly_investment_mgmt">Investment Management</option>
                <option value="audited_annual">Annual Audited</option>
                <option value="inhouse_quarterly">In-House Quarterly</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>Sort by</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
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
                <option value="date_desc">Due date (newest first)</option>
                <option value="date_asc">Due date (oldest first)</option>
                <option value="status">Status</option>
                <option value="type">Report type</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '16px 24px 24px' }}>
            {displayedObligations.length === 0 ? (
              <TabEmptyState tab={reportTab} />
            ) : (
              <ul className="m-0 list-none p-0">
                {displayedObligations.map((o) => (
                  <ReportObligationRow key={o.id} obligation={o} onUpload={() => setModalObligation(o)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !pageErr && data?.portfolio_fund && historyRows.length ? (
        <section className="mt-8">
          <button
            type="button"
            className="flex w-full items-center gap-2 border-b text-left"
            style={{ borderColor: '#EBEAE6', paddingBottom: 8 }}
            onClick={() => setHistoryOpen((s) => !s)}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY }}>Submission history</span>
            <span
              style={{
                fontSize: 11,
                padding: '1px 6px',
                borderRadius: 10,
                background: '#F3F4F6',
                color: TEXT_TERTIARY,
              }}
            >
              {historyRows.length}
            </span>
            <i
              className={historyOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down'}
              style={{ fontSize: 16, color: TEXT_SECONDARY, marginLeft: 'auto' }}
              aria-hidden
            />
          </button>
          {historyOpen ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {(['Report', 'Period', 'Submitted', 'Status', '\u00a0'] as const).map((h) => (
                      <th
                        key={h}
                        style={{
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: TEXT_TERTIARY,
                          fontWeight: 500,
                          paddingBottom: 8,
                          borderBottom: '0.5px solid #EBEAE6',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row, i) => (
                    <tr
                      key={row.id}
                      style={{
                        fontSize: 13,
                        borderBottom: i < historyRows.length - 1 ? '0.5px solid #EBEAE6' : undefined,
                      }}
                    >
                      <td style={{ padding: '10px 0', color: TEXT_PRIMARY }}>{formatReportType(row.report_type)}</td>
                      <td style={{ padding: '10px 0', color: TEXT_SECONDARY }}>{row.period_label}</td>
                      <td style={{ padding: '10px 0', color: TEXT_SECONDARY }}>
                        {row.submitted_date ? formatPortalDate(row.submitted_date.slice(0, 10)) : '—'}
                      </td>
                      <td style={{ padding: '10px 0' }}>
                        <HistoryStatusPill status={row.status} />
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        {row.document_url ? (
                          <a href={row.document_url} target="_blank" rel="noopener noreferrer" aria-label="Download" className="inline-flex">
                            <i className="ti ti-download" style={{ fontSize: 16, color: '#1D9E75', cursor: 'pointer' }} />
                          </a>
                        ) : (
                          <span style={{ color: TEXT_TERTIARY }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {modalObligation ? (
        <UploadModal
          fundApplicationId={appId}
          obligation={modalObligation}
          onClose={() => setModalObligation(null)}
          onSuccess={() => {
            setSuccessBanner('Report submitted successfully. DBJ has been notified.');
            setModalObligation(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function HistoryStatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  let bg = '#F3F4F6';
  let color = TEXT_SECONDARY;
  if (normalized === 'accepted') {
    bg = '#9FE1CB';
    color = '#085041';
  } else if (normalized === 'waived') {
    bg = '#F3F4F6';
    color = TEXT_TERTIARY;
  } else if (['submitted', 'under_review'].includes(normalized)) {
    bg = '#D1FAE5';
    color = '#065F46';
  }
  const label =
    normalized === 'under_review' ? 'Under review' : normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ');
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: 9999,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 500,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}

function TabEmptyState({ tab }: { tab: ReportTab }) {
  if (tab === 'accepted' || tab === 'submitted') {
    return (
      <div className="flex flex-col items-center py-8 text-center" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <i className="ti ti-check" style={{ fontSize: 32, color: '#1D9E75' }} aria-hidden />
        <p className="mt-3 text-sm" style={{ color: TEXT_SECONDARY }}>
          {tab === 'accepted' ? 'No accepted or waived obligations in this view.' : 'No submitted reports awaiting review here.'}
        </p>
      </div>
    );
  }
  if (tab === 'upcoming') {
    return (
      <div className="flex flex-col items-center py-8 text-center" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <i className="ti ti-calendar" style={{ fontSize: 32, color: TEXT_SECONDARY }} aria-hidden />
        <p className="mt-3 text-sm" style={{ color: TEXT_SECONDARY }}>
          No upcoming obligations beyond 30 days in this filter.
        </p>
      </div>
    );
  }
  if (tab === 'action') {
    return (
      <div className="flex flex-col items-center py-8 text-center" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <i className="ti ti-check" style={{ fontSize: 32, color: '#1D9E75' }} aria-hidden />
        <p className="mt-3 text-sm" style={{ color: TEXT_SECONDARY }}>
          Nothing needs immediate action right now.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-8 text-center" style={{ paddingTop: 32, paddingBottom: 32 }}>
      <i className="ti ti-file-off" style={{ fontSize: 32, color: TEXT_TERTIARY }} aria-hidden />
      <p className="mt-3 text-sm" style={{ color: TEXT_SECONDARY }}>
        No obligations match this filter.
      </p>
    </div>
  );
}

function ReportObligationRow({ obligation: o, onUpload }: { obligation: PortalReportingObligationDto; onUpload: () => void }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const kind = obligationRowKind(o);
  const ic = reportTypeIcon(o.report_type);
  const dAway = daysFromNow(o.due_date);
  const overdueDays =
    typeof o.days_overdue === 'number' && o.days_overdue > 0 ? o.days_overdue : dAway < 0 ? Math.abs(dAway) : 0;
  const dueFmt = formatPortalDate(o.due_date.slice(0, 10));

  let rowStyle: CSSProperties = {
    border: '0.5px solid #EBEAE6',
    borderRadius: 12,
    padding: '16px 20px',
    background: '#FFFFFF',
  };
  let nameColor = TEXT_PRIMARY;
  let periodColor = TEXT_SECONDARY;
  let periodExtra = '';
  let dateText = dueFmt;
  let dateStyle: CSSProperties = { fontSize: 13, color: TEXT_SECONDARY, fontWeight: 400 };

  if (kind === 'overdue') {
    rowStyle = {
      ...rowStyle,
      background: '#FCEBEB',
      borderColor: '#F09595',
    };
    nameColor = '#501313';
    periodColor = '#A32D2D';
    periodExtra = overdueDays > 0 ? ` · ${overdueDays} days overdue` : ' · Overdue';
    dateStyle = { fontSize: 13, color: '#A32D2D', fontWeight: 500 };
  } else if (kind === 'dueSoon') {
    rowStyle = {
      ...rowStyle,
      background: '#FAEEDA',
      borderColor: '#EF9F27',
    };
    nameColor = '#412402';
    periodColor = '#854F0B';
    periodExtra = ` · Due in ${dAway} days`;
    dateStyle = { fontSize: 13, color: '#854F0B', fontWeight: 500 };
  } else if (kind === 'upcoming') {
    periodExtra = ` · Due in ${dAway} days`;
  } else if (kind === 'submitted') {
    dateText = o.submitted_date?.trim() ? `Submitted ${formatPortalDate(o.submitted_date.slice(0, 10))}` : 'Submitted';
    dateStyle = { fontSize: 12, color: '#1D9E75', fontWeight: 400 };
  } else if (kind === 'accepted') {
    rowStyle = {
      ...rowStyle,
      background: '#E1F5EE',
      borderColor: '#5DCAA5',
    };
    nameColor = '#085041';
    periodColor = '#0F6E56';
  } else if (kind === 'waived') {
    rowStyle = { ...rowStyle, opacity: 0.6 };
  }

  return (
    <li className="mb-2 flex flex-col gap-3 last:mb-0 sm:mb-2 sm:flex-row sm:items-center sm:justify-between" style={rowStyle}>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center"
          style={{ borderRadius: 8, background: ic.bg, color: ic.color }}
        >
          <i className={ic.icon} style={{ fontSize: 18 }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 sm:ml-4">
          <div style={{ fontSize: 13, fontWeight: 500, color: nameColor }}>{formatReportType(o.report_type)}</div>
          <div style={{ fontSize: 12, marginTop: 2, color: periodColor }}>
            {o.period_label}
            {periodExtra}
          </div>
          {o.review_notes?.trim() && ['submitted', 'under_review', 'accepted'].includes(o.status) ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setFeedbackOpen((v) => !v)}
                style={{ fontSize: 11, color: '#2563EB', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                DBJ feedback
              </button>
              {feedbackOpen ? (
                <div
                  className="mt-1 whitespace-pre-wrap rounded-md px-2 py-2 text-xs"
                  style={{ background: '#F9FAFB', color: TEXT_SECONDARY, border: '0.5px solid #EBEAE6' }}
                >
                  {o.review_notes.trim()}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end" style={{ gap: 10 }}>
        <div style={dateStyle}>{dateText}</div>
        <div className="flex flex-wrap items-center gap-2">
          {kind === 'submitted' && o.document_url ? (
            <a href={o.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500 }}>
              View
            </a>
          ) : null}
          {kind === 'accepted' && o.document_url ? (
            <a href={o.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500 }}>
              View
            </a>
          ) : null}
          {kind === 'accepted' ? (
            <span
              style={{
                display: 'inline-flex',
                borderRadius: 9999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                background: '#9FE1CB',
                color: '#085041',
              }}
            >
              Accepted
            </span>
          ) : null}
          {kind === 'waived' ? <span style={{ fontSize: 12, color: TEXT_TERTIARY }}>Waived</span> : null}
          {isUploadAllowed(o.status) ? (
            <button
              type="button"
              onClick={onUpload}
              style={
                kind === 'overdue'
                  ? {
                      background: '#E24B4A',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }
                  : kind === 'dueSoon'
                    ? {
                        background: '#1D9E75',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }
                    : {
                        background: '#FFFFFF',
                        color: '#1D9E75',
                        border: '0.5px solid #1D9E75',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }
              }
            >
              Upload
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function UploadModal(props: {
  fundApplicationId: string;
  obligation: PortalReportingObligationDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { fundApplicationId, obligation, onClose, onSuccess } = props;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = formatReportType(obligation.report_type);

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('obligation_id', obligation.id);
    fd.set('file', file);
    try {
      const res = await fetch(`/api/portal/funds/${encodeURIComponent(fundApplicationId)}/reports/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(parseJsonMessage(json) ?? `Upload failed (${res.status}).`);
        setBusy(false);
        return;
      }
      setBusy(false);
      onSuccess();
    } catch {
      setErr('Network error.');
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    setFile(next ?? null);
    setErr(null);
  }

  const dueFmt = formatPortalDate(obligation.due_date.slice(0, 10));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="presentation">
      <button type="button" className="absolute inset-0" aria-label="Close upload dialog backdrop" onClick={() => (busy ? undefined : onClose())} />
      <div
        role="dialog"
        aria-labelledby="portal-upload-title"
        className={cn(
          'relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-6 shadow-xl sm:rounded-2xl',
        )}
      >
        <button
          type="button"
          disabled={busy}
          className="absolute right-3 top-3 rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden stroke="currentColor" strokeWidth={2}>
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <h2 id="portal-upload-title" className="pr-10 text-lg font-semibold text-gray-900">
          Upload {title}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {obligation.period_label} · Due {dueFmt}
        </p>

        {err ? <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p> : null}

        <div className="mt-6 space-y-3">
          <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => onPick(e)} />
          <div
            className={cn(
              'cursor-pointer rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center hover:bg-gray-100',
              busy && 'pointer-events-none opacity-60',
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(ev) => {
              ev.preventDefault();
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              const f = ev.dataTransfer.files?.[0];
              if (f) {
                setFile(f);
                setErr(null);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && inputRef.current) inputRef.current.click();
            }}
          >
            <UploadIcon32 />
            <p className="mt-3 text-sm text-gray-600">Drop your file here or click to browse</p>
            <p className="mt-1 text-xs text-gray-400">PDF or Word document · Max 20MB</p>
          </div>

          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-800">
                {file.name}{' '}
                <span className="block text-[11px] text-gray-400 md:inline">{formatBytes(file.size)}</span>
              </span>
              <button type="button" className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100" onClick={() => setFile(null)} aria-label="Remove file">
                <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled={!file || busy}
          onClick={() => void submit()}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#00A99D] text-sm font-semibold text-white hover:bg-[#009488] disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner /> Uploading…
            </>
          ) : (
            'Submit Report'
          )}
        </button>
      </div>
    </div>
  );
}
