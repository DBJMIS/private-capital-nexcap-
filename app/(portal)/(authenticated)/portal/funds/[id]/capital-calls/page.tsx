'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatPortalCurrency, formatPortalDate } from '@/lib/portal/format-helpers';
import type { PortalCapitalCallDto, PortalCapitalCallsResponse } from '@/types/portal-capital-calls';

const TABLER_ICONS_CSS =
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.26.0/dist/tabler-icons.min.css';

const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_TERTIARY = '#9CA3AF';

function parseJsonMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const msg = (body as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim().length > 0 ? msg.trim() : null;
}

type CallTab = 'all' | 'paid' | 'outstanding' | 'overdue';

function tabFilter(calls: PortalCapitalCallDto[], tab: CallTab): PortalCapitalCallDto[] {
  if (tab === 'all') return calls;
  if (tab === 'paid') return calls.filter((c) => c.status === 'paid');
  if (tab === 'outstanding') return calls.filter((c) => c.status === 'unpaid' || c.status === 'partial');
  if (tab === 'overdue') return calls.filter((c) => c.status === 'overdue');
  return calls;
}

function CapitalCallsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-24 rounded-xl bg-gray-200" />
      <div className="h-16 rounded-lg bg-gray-100" />
      <div className="h-10 rounded-lg bg-gray-100" />
      <div className="h-32 rounded-xl bg-gray-50" />
    </div>
  );
}

function receiptIconStyle(status: string): { bg: string; color: string } {
  switch (status) {
    case 'paid':
      return { bg: '#E1F5EE', color: '#0F6E56' };
    case 'unpaid':
    case 'partial':
      return { bg: '#FAEEDA', color: '#633806' };
    case 'overdue':
      return { bg: '#FCEBEB', color: '#A32D2D' };
    case 'cancelled':
      return { bg: '#F1EFE8', color: '#5F5E5A' };
    default:
      return { bg: '#F1EFE8', color: '#5F5E5A' };
  }
}

function rowBackground(status: string): string {
  switch (status) {
    case 'paid':
      return '#FFFFFF';
    case 'unpaid':
      return '#FAEEDA';
    case 'overdue':
      return '#FCEBEB';
    case 'partial':
      return '#E6F1FB';
    case 'cancelled':
      return '#FFFFFF';
    default:
      return '#FFFFFF';
  }
}

function rowOpacity(status: string): number {
  return status === 'cancelled' ? 0.6 : 1;
}

function textColors(status: string): { line1: string; line2: string } {
  switch (status) {
    case 'paid':
      return { line1: TEXT_PRIMARY, line2: TEXT_SECONDARY };
    case 'unpaid':
    case 'partial':
      return { line1: '#412402', line2: '#854F0B' };
    case 'overdue':
      return { line1: '#501313', line2: '#A32D2D' };
    case 'cancelled':
      return { line1: TEXT_TERTIARY, line2: TEXT_TERTIARY };
    default:
      return { line1: TEXT_PRIMARY, line2: TEXT_SECONDARY };
  }
}

function statusPillStyle(status: string): { bg: string; color: string; border: string; label: string } {
  switch (status) {
    case 'paid':
      return { bg: '#E1F5EE', color: '#085041', border: '0.5px solid #5DCAA5', label: 'Paid' };
    case 'unpaid':
      return { bg: '#FAEEDA', color: '#633806', border: '0.5px solid #EF9F27', label: 'Payment due' };
    case 'partial':
      return { bg: '#E6F1FB', color: '#0C447C', border: '0.5px solid #85B7EB', label: 'Partial' };
    case 'overdue':
      return { bg: '#FCEBEB', color: '#791F1F', border: '0.5px solid #F09595', label: 'Overdue' };
    case 'cancelled':
      return { bg: '#F1EFE8', color: '#5F5E5A', border: '0.5px solid #D3D1C7', label: 'Cancelled' };
    default:
      return { bg: '#F3F4F6', color: TEXT_SECONDARY, border: '0.5px solid #EBEAE6', label: status };
  }
}

function amountSecondLine(call: PortalCapitalCallDto): { text: string; color: string } | null {
  if (call.status === 'paid' && call.date_paid) {
    return { text: `Paid ${formatPortalDate(call.date_paid)}`, color: '#1D9E75' };
  }
  if (call.status === 'cancelled') return null;
  if (!call.due_date) return null;
  const d = formatPortalDate(call.due_date);
  if (call.status === 'overdue') return { text: `Due ${d}`, color: '#A32D2D' };
  if (call.status === 'unpaid' || call.status === 'partial') return { text: `Due ${d}`, color: '#854F0B' };
  return { text: `Due ${d}`, color: TEXT_SECONDARY };
}

export default function PortalFundCapitalCallsPage() {
  const params = useParams();
  const appId = typeof params?.id === 'string' ? params.id : '';
  const [data, setData] = useState<PortalCapitalCallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [itemsOpenByCall, setItemsOpenByCall] = useState<Record<string, boolean>>({});
  const [callTab, setCallTab] = useState<CallTab>('all');

  useEffect(() => {
    const id = 'tabler-icons-webfont-capital-calls';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = TABLER_ICONS_CSS;
    document.head.appendChild(link);
  }, []);

  const toggleItems = useCallback((id: string) => {
    setItemsOpenByCall((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setPageErr(null);
    try {
      const res = await fetch(`/api/portal/funds/${encodeURIComponent(appId)}/capital-calls`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setData(null);
        setPageErr(parseJsonMessage(json) ?? 'Could not load capital calls.');
        return;
      }
      setData(json as PortalCapitalCallsResponse);
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
  const calls = data?.capital_calls ?? [];
  const summary = data?.summary;

  const tabCounts = useMemo(() => {
    return {
      all: calls.length,
      paid: calls.filter((c) => c.status === 'paid').length,
      outstanding: calls.filter((c) => c.status === 'unpaid' || c.status === 'partial').length,
      overdue: calls.filter((c) => c.status === 'overdue').length,
    };
  }, [calls]);

  const filteredCalls = useMemo(() => tabFilter(calls, callTab), [calls, callTab]);

  if (!appId) return null;

  const showStatsBar = !loading && !pageErr && portfolio != null && summary != null;
  const showMainCard = !loading && !pageErr && portfolio != null;

  return (
    <div className="w-full">
      <div className="mb-4 flex justify-end">
        <Link href={`/portal/funds/${appId}`} style={{ fontSize: 14, fontWeight: 500, color: '#1D9E75' }} className="hover:underline">
          ← Back to Overview
        </Link>
      </div>

      {loading ? <CapitalCallsSkeleton /> : null}

      {!loading && pageErr ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{pageErr}</div>
      ) : null}

      {!loading && !pageErr && data && !portfolio ? (
        <div
          className="mx-auto flex max-w-md flex-col items-center rounded-xl border bg-white text-center shadow-sm"
          style={{ borderWidth: '0.5px', borderColor: '#EBEAE6', padding: 48 }}
        >
          <i className="ti ti-receipt" style={{ fontSize: 48, color: TEXT_TERTIARY }} aria-hidden />
          <p style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: TEXT_PRIMARY }}>Capital calls not yet available</p>
          <p style={{ marginTop: 8, fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
            Capital call notices will appear here once your fund commitment is confirmed by DBJ.
          </p>
        </div>
      ) : null}

      {showMainCard ? (
        <div className="overflow-hidden bg-white shadow-sm" style={{ borderRadius: 12, border: '0.5px solid #EBEAE6' }}>
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
                Capital Calls
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, color: TEXT_PRIMARY }}>{portfolio!.fund_name}</div>
            </div>
            {calls.length > 0 ? (
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
                {calls.length} notice{calls.length !== 1 ? 's' : ''}
              </div>
            ) : null}
          </div>

          {showStatsBar && summary ? (
            <div className="flex flex-col sm:flex-row">
              <div
                className="flex-1 border-b-[0.5px] border-b-[#EBEAE6] px-5 py-4 sm:border-b-0 sm:border-r-[0.5px] sm:border-r-[#EBEAE6]"
                style={{ flex: '1 1 0' }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: TEXT_TERTIARY,
                    marginBottom: 4,
                  }}
                >
                  Total called to date
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: TEXT_PRIMARY }}>
                  {formatPortalCurrency(summary.total_called, summary.currency)}
                </div>
              </div>
              <div
                className="flex-1 border-b-[0.5px] border-b-[#EBEAE6] px-5 py-4 sm:border-b-0 sm:border-r-[0.5px] sm:border-r-[#EBEAE6]"
                style={{ flex: '1 1 0' }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: TEXT_TERTIARY,
                    marginBottom: 4,
                  }}
                >
                  DBJ commitment
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: TEXT_PRIMARY }}>
                  {portfolio!.dbj_commitment == null ? '—' : formatPortalCurrency(portfolio!.dbj_commitment, portfolio!.currency)}
                </div>
              </div>
              <div className="flex-1 px-5 py-4" style={{ background: '#E1F5EE', flex: '1 1 0' }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#0F6E56',
                    marginBottom: 4,
                  }}
                >
                  Remaining commitment
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: '#085041' }}>
                  {formatPortalCurrency(summary.total_remaining_commitment, summary.currency)}
                </div>
              </div>
            </div>
          ) : null}

          {showStatsBar ? (
            <div style={{ padding: '0 24px', borderBottom: '0.5px solid #EBEAE6', display: 'flex', flexWrap: 'wrap' }}>
              {(
                [
                  ['all', 'All', tabCounts.all, 'green'] as const,
                  ['paid', 'Paid', tabCounts.paid, 'green'] as const,
                  ['outstanding', 'Outstanding', tabCounts.outstanding, 'amber'] as const,
                  ['overdue', 'Overdue', tabCounts.overdue, 'red'] as const,
                ] as const
              ).map(([id, label, count, tone]) => {
                const active = callTab === id;
                const hideBadge = (tone === 'amber' || tone === 'red') && count === 0;
                const showBadge = !hideBadge;
                const badgeBg =
                  tone === 'green'
                    ? '#E1F5EE'
                    : tone === 'amber'
                      ? '#FAEEDA'
                      : '#FCEBEB';
                const badgeColor = tone === 'green' ? '#0F6E56' : tone === 'amber' ? '#854F0B' : '#A32D2D';
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCallTab(id)}
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
                    {showBadge ? (
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
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div style={{ padding: '16px 24px' }}>
            {calls.length === 0 ? (
              <div className="flex flex-col items-center text-center" style={{ paddingTop: 24, paddingBottom: 24 }}>
                <i className="ti ti-bell" style={{ fontSize: 48, color: TEXT_TERTIARY }} aria-hidden />
                <p style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: TEXT_PRIMARY }}>No capital calls yet</p>
                <p style={{ marginTop: 8, fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                  Capital call notices will appear here when issued by DBJ.
                </p>
              </div>
            ) : filteredCalls.length === 0 ? (
              <TabEmptyState tab={callTab} />
            ) : (
              <ul className="m-0 list-none p-0">
                {filteredCalls.map((call, idx) => (
                  <CapitalCallRow
                    key={call.id}
                    call={call}
                    isLast={idx === filteredCalls.length - 1}
                    itemsOpen={!!itemsOpenByCall[call.id]}
                    onToggleItems={() => toggleItems(call.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !pageErr && portfolio ? (
        <div
          style={{
            background: '#E6F1FB',
            border: '0.5px solid #85B7EB',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 16,
          }}
        >
          <i className="ti ti-info-circle" style={{ fontSize: 15, color: '#185FA5', flexShrink: 0 }} aria-hidden />
          <p style={{ fontSize: 12, color: '#0C447C', lineHeight: 1.5, margin: 0 }}>
            Capital call notices are issued by DBJ. For questions about a specific call, contact your DBJ relationship manager directly.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TabEmptyState({ tab }: { tab: CallTab }) {
  if (tab === 'paid') {
    return (
      <div className="flex flex-col items-center text-center" style={{ padding: 32 }}>
        <i className="ti ti-check" style={{ fontSize: 32, color: '#1D9E75' }} aria-hidden />
        <p style={{ marginTop: 12, fontSize: 14, color: TEXT_SECONDARY }}>No paid capital calls in this view.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: 32 }}>
      <i className="ti ti-receipt" style={{ fontSize: 32, color: TEXT_TERTIARY }} aria-hidden />
      <p style={{ marginTop: 12, fontSize: 14, color: TEXT_SECONDARY }}>
        {tab === 'outstanding' ? 'No outstanding capital calls.' : tab === 'overdue' ? 'No overdue capital calls.' : 'Nothing matches this filter.'}
      </p>
    </div>
  );
}

function CapitalCallRow({
  call,
  isLast,
  itemsOpen,
  onToggleItems,
}: {
  call: PortalCapitalCallDto;
  isLast: boolean;
  itemsOpen: boolean;
  onToggleItems: () => void;
}) {
  const ic = receiptIconStyle(call.status);
  const bg = rowBackground(call.status);
  const op = rowOpacity(call.status);
  const tc = textColors(call.status);
  const pill = statusPillStyle(call.status);
  const second = amountSecondLine(call);
  const hasItems = call.items.length > 0;
  const hasCumulative = call.total_called_to_date != null || call.remaining_commitment != null;

  return (
    <li
      style={{
        borderBottom: isLast ? undefined : '0.5px solid #EBEAE6',
        background: bg,
        opacity: op,
        paddingTop: 16,
        paddingBottom: 16,
      }}
    >
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[36px_1fr_auto_auto] sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-start gap-4 sm:contents">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ borderRadius: 8, background: ic.bg, color: ic.color }}>
            <i className="ti ti-receipt" style={{ fontSize: 18 }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 sm:min-w-0">
            <div style={{ fontSize: 13, fontWeight: 500, color: tc.line1 }}>
              {call.notice_number != null ? `Capital Call #${call.notice_number}` : 'Capital Call'}
            </div>
            <div style={{ fontSize: 12, marginTop: 2, color: tc.line2 }}>Notice issued {formatPortalDate(call.date_of_notice)}</div>
          </div>
        </div>

        <div
          className="flex w-full flex-col items-end gap-2 sm:w-auto sm:min-w-0 sm:items-end"
          style={{ textAlign: 'right' as const }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, color: TEXT_PRIMARY }}>{formatPortalCurrency(call.call_amount, call.currency)}</div>
          {second ? <div style={{ fontSize: 12, color: second.color }}>{second.text}</div> : null}
        </div>

        <div className="flex w-full justify-end sm:w-auto sm:justify-start">
          <span
            style={{
              display: 'inline-flex',
              whiteSpace: 'nowrap',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 500,
              background: pill.bg,
              color: pill.color,
              border: pill.border,
            }}
          >
            {pill.label}
          </span>
        </div>
      </div>

      {hasItems ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={onToggleItems}
            style={{
              fontSize: 12,
              color: '#1D9E75',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              fontWeight: 500,
            }}
            aria-expanded={itemsOpen}
          >
            ↓ {call.items.length} line items
          </button>
          {itemsOpen ? (
            <div style={{ paddingLeft: 52, borderTop: '0.5px solid #EBEAE6', marginTop: 8, paddingTop: 8 }}>
              {call.items.map((it, j) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    padding: '4px 0',
                    color: TEXT_SECONDARY,
                    borderBottom: j < call.items.length - 1 ? '0.5px solid #EBEAE6' : undefined,
                  }}
                >
                  <span style={{ paddingRight: 12 }}>{it.description}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{formatPortalCurrency(it.amount, call.currency)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasCumulative ? (
        <div
          style={{
            paddingTop: 8,
            marginTop: 8,
            borderTop: '0.5px solid #EBEAE6',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: TEXT_TERTIARY,
          }}
        >
          <span>
            {call.total_called_to_date != null
              ? `Called to date: ${formatPortalCurrency(call.total_called_to_date, call.currency)}`
              : '\u00a0'}
          </span>
          <span>
            {call.remaining_commitment != null
              ? `Remaining: ${formatPortalCurrency(call.remaining_commitment, call.currency)}`
              : '\u00a0'}
          </span>
        </div>
      ) : null}
    </li>
  );
}
