'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from 'lucide-react';

import { UnifiedExtractionReviewModal, type UnifiedExtractApiResponse } from '@/components/portfolio/UnifiedExtractionReviewModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Obligation = {
  id: string;
  fund_id: string;
  fund_name: string;
  report_type: string;
  period_label: string;
  due_date: string;
  status: string;
  document_path?: string | null;
  document_name?: string | null;
  snapshot_extracted?: boolean;
  snapshot_id?: string | null;
};

const REPORT_SHORT: Record<string, string> = {
  quarterly_financial: 'Fin',
  quarterly_investment_mgmt: 'Inv',
  audited_annual: 'AUD',
  inhouse_quarterly: 'IH',
};

function fundAbbrev(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.slice(0, 3) + parts[1]!.slice(0, 2)).toUpperCase();
  }
  return name.slice(0, 4).toUpperCase();
}

function calendarPillClass(status: string) {
  const s = status.toLowerCase();
  if (s === 'overdue') return 'bg-red-100 text-red-700';
  if (s === 'outstanding') return 'bg-orange-100 text-orange-700';
  if (s === 'due') return 'bg-amber-100 text-amber-700';
  if (s === 'submitted' || s === 'under_review') return 'bg-blue-100 text-blue-700';
  if (s === 'accepted' || s === 'waived') return 'bg-teal-100 text-teal-700';
  if (s === 'pending') return 'bg-gray-100 text-gray-600';
  return 'bg-gray-100 text-gray-600';
}

function statusPillSmall(status: string) {
  return cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium capitalize', calendarPillClass(status));
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekStartMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, delta: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  return x;
}

type View = 'month' | 'list';

function daysOverdue(dueDate: string): number {
  const due = new Date(`${dueDate}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

type SidebarGroup = { key: string; label: string; tone: string; statuses: Set<string> };

const SIDEBAR_GROUPS: SidebarGroup[] = [
  { key: 'overdue', label: 'Overdue', tone: 'text-red-600', statuses: new Set(['overdue', 'outstanding']) },
  { key: 'due_soon', label: 'Due Soon', tone: 'text-amber-600', statuses: new Set(['due']) },
  { key: 'submitted', label: 'Submitted', tone: 'text-blue-600', statuses: new Set(['submitted', 'under_review']) },
  { key: 'accepted', label: 'Accepted', tone: 'text-teal-600', statuses: new Set(['accepted', 'waived']) },
  { key: 'pending', label: 'Pending', tone: 'text-gray-500', statuses: new Set(['pending']) },
];

export type PortfolioReportingCalendarProps = {
  canWrite?: boolean;
  submitterName?: string;
};

export function PortfolioReportingCalendar({
  canWrite = false,
  submitterName = 'Staff',
}: PortfolioReportingCalendarProps) {
  const [mounted, setMounted] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<View>('month');
  const [rows, setRows] = useState<Obligation[]>([]);
  const [funds, setFunds] = useState<{ id: string; fund_name: string }[]>([]);
  const [fundFilter, setFundFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [slide, setSlide] = useState<Obligation | null>(null);
  const [slideBusy, setSlideBusy] = useState(false);
  const [snapUploadSuggest, setSnapUploadSuggest] = useState(false);
  const [snapExtractBusy, setSnapExtractBusy] = useState(false);
  const [snapExtractErr, setSnapExtractErr] = useState<string | null>(null);
  const [unifiedExtractData, setUnifiedExtractData] = useState<UnifiedExtractApiResponse | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissSlide = useCallback(() => {
    setSlide(null);
    setSnapUploadSuggest(false);
    setSnapExtractErr(null);
    setUnifiedExtractData(null);
  }, []);

  useEffect(() => {
    if (slide) {
      setSnapUploadSuggest(false);
      setSnapExtractErr(null);
      setUnifiedExtractData(null);
    }
  }, [slide?.id]);

  const range = useMemo(() => {
    if (view === 'month') {
      const s = startOfMonth(cursor);
      const gridStart = weekStartMonday(s);
      const gridEnd = addDays(gridStart, 41);
      return { from: toYmd(gridStart), to: toYmd(gridEnd) };
    }
    const s = addDays(cursor, -45);
    const e = addDays(cursor, 120);
    return { from: toYmd(s), to: toYmd(e) };
  }, [cursor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({ from_date: range.from, to_date: range.to });
      const res = await fetch(`/api/portfolio/calendar?${q}`);
      const j = (await res.json()) as { obligations?: Obligation[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      let list = j.obligations ?? [];
      if (fundFilter !== 'all') list = list.filter((o) => o.fund_id === fundFilter);
      if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
      if (typeFilter !== 'all') list = list.filter((o) => o.report_type === typeFilter);
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, fundFilter, statusFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/portfolio/funds');
      const j = (await res.json()) as {
        funds?: { fund: { id: string; fund_name: string } }[];
      };
      if (res.ok && j.funds) {
        setFunds(j.funds.map((x) => ({ id: x.fund.id, fund_name: x.fund.fund_name })));
      }
    })();
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, Obligation[]>();
    for (const o of rows) {
      const list = m.get(o.due_date) ?? [];
      list.push(o);
      m.set(o.due_date, list);
    }
    return m;
  }, [rows]);

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const monthSubLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const gridDays = useMemo(() => {
    const s = startOfMonth(cursor);
    const start = weekStartMonday(s);
    const days: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      days.push(addDays(start, i));
    }
    return days;
  }, [cursor]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const monthStartYmd = toYmd(monthStart);
  const monthEndYmd = toYmd(monthEnd);
  const todayYmd = toYmd(new Date());

  const stats = useMemo(() => {
    const inMonth = rows.filter((o) => o.due_date >= monthStartYmd && o.due_date <= monthEndYmd);
    const acceptedInMonth = rows.filter(
      (o) => (o.status === 'accepted' || o.status === 'waived') && o.due_date >= monthStartYmd && o.due_date <= monthEndYmd,
    );
    return {
      dueMonth: inMonth.length,
      overdue: rows.filter((o) => o.status === 'overdue').length,
      pendingReview: rows.filter((o) => o.status === 'submitted').length,
      acceptedThisMonth: acceptedInMonth.length,
    };
  }, [rows, monthStartYmd, monthEndYmd]);

  const obligationsThisMonth = useMemo(
    () => rows.filter((o) => o.due_date >= monthStartYmd && o.due_date <= monthEndYmd).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [rows, monthStartYmd, monthEndYmd],
  );

  const sidebarGrouped = useMemo(() => {
    const result: { group: SidebarGroup; items: Obligation[] }[] = [];
    for (const g of SIDEBAR_GROUPS) {
      const items = obligationsThisMonth.filter((o) => g.statuses.has(o.status.toLowerCase()));
      if (items.length > 0) result.push({ group: g, items });
    }
    return result;
  }, [obligationsThisMonth]);

  const listGrouped = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const groups = new Map<string, Obligation[]>();
    for (const o of sorted) {
      const ws = weekStartMonday(new Date(`${o.due_date}T12:00:00`));
      const key = toYmd(ws);
      const list = groups.get(key) ?? [];
      list.push(o);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const markReceived = async (o: Obligation) => {
    if (!canWrite) return;
    setSlideBusy(true);
    try {
      const res = await fetch(`/api/portfolio/obligations/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'submitted',
          submitted_date: toYmd(new Date()),
          submitted_by: submitterName,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      dismissSlide();
      void load();
    } catch {
      /* keep slide open; could set toast */
    } finally {
      setSlideBusy(false);
    }
  };

  const reviewDecision = async (o: Obligation, decision: 'accept' | 'request_clarification') => {
    if (!canWrite) return;
    setSlideBusy(true);
    try {
      const res = await fetch(`/api/portfolio/obligations/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, review_notes: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      dismissSlide();
      void load();
    } catch {
      /* noop */
    } finally {
      setSlideBusy(false);
    }
  };

  const openDocument = async (id: string) => {
    const res = await fetch(`/api/portfolio/obligations/${id}/document`);
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) return;
    window.open(j.url, '_blank', 'noopener,noreferrer');
  };

  const runReportExtractAll = async () => {
    if (!slide) return;
    setSnapExtractBusy(true);
    setSnapExtractErr(null);
    try {
      const res = await fetch(`/api/portfolio/obligations/${slide.id}/extract-all`, { method: 'POST' });
      const j = (await res.json()) as UnifiedExtractApiResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Extraction failed');
      setSnapUploadSuggest(false);
      setUnifiedExtractData(j);
    } catch (e) {
      setSnapExtractErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSnapExtractBusy(false);
    }
  };

  const slideOver =
    mounted &&
    slide &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex justify-end bg-black/40 transition-opacity"
        role="presentation"
        onClick={() => dismissSlide()}
      >
        <aside
          className="flex h-full w-[320px] max-w-[100vw] flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out"
          style={{ transform: 'translateX(0)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
            <div className="min-w-0 pr-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Obligation</p>
              <h3 className="mt-1 truncate text-lg font-semibold text-[#0B1F45]">{slide.fund_name}</h3>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-[#0B1F45]"
              aria-label="Close"
              onClick={() => dismissSlide()}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium', calendarPillClass(slide.status))}>
              {slide.report_type.replace(/_/g, ' ')}
            </span>
            <p className="mt-3 text-sm text-gray-600">
              Period: <span className="font-medium text-gray-800">{slide.period_label}</span>
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Due: <span className="font-medium text-gray-800">{slide.due_date}</span>
            </p>
            <p className="mt-3">
              <span className={statusPillSmall(slide.status)}>{slide.status.replace(/_/g, ' ')}</span>
            </p>
            {(slide.status === 'overdue' || slide.status === 'outstanding') && (
              <p className="mt-2 text-sm font-medium text-red-600">{daysOverdue(slide.due_date)} days overdue</p>
            )}

            <div className="mt-8 space-y-3">
              {canWrite && (slide.status === 'outstanding' || slide.status === 'overdue') ? (
                <Button
                  type="button"
                  className="w-full bg-[#0B1F45] hover:bg-[#162d5e]"
                  disabled={slideBusy}
                  onClick={() => void markReceived(slide)}
                >
                  Mark as Received
                </Button>
              ) : null}
              {canWrite && (slide.status === 'submitted' || slide.status === 'under_review') ? (
                <>
                  <Button
                    type="button"
                    className="w-full bg-[#0F8A6E] hover:bg-[#0c6f58]"
                    disabled={slideBusy}
                    onClick={() => void reviewDecision(slide, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-gray-300"
                    disabled={slideBusy}
                    onClick={() => void reviewDecision(slide, 'request_clarification')}
                  >
                    Request Clarification
                  </Button>
                </>
              ) : null}
              {(slide.status === 'accepted' || slide.status === 'waived') && slide.document_path ? (
                <Button type="button" variant="outline" className="w-full" onClick={() => void openDocument(slide.id)}>
                  View Document
                </Button>
              ) : null}
            </div>

            <label className="mt-8 block text-sm font-medium text-gray-700">
              Upload PDF or Word
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="mt-1 block w-full text-xs"
                disabled={!canWrite}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f || !canWrite) return;
                  const fd = new FormData();
                  fd.set('file', f);
                  const res = await fetch(`/api/portfolio/obligations/${slide.id}/upload`, { method: 'POST', body: fd });
                  const j = (await res.json()) as { suggest_extraction?: boolean; error?: string };
                  if (res.ok) {
                    if (j.suggest_extraction) {
                      setSnapUploadSuggest(true);
                    } else {
                      dismissSlide();
                    }
                    void load();
                  }
                }}
              />
            </label>
            {snapUploadSuggest ? (
              <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
                <p className="font-medium">Extract report data?</p>
                <p className="mt-1 text-xs text-indigo-900/90">
                  AI can suggest performance snapshot fields and narrative indicators from this document. You confirm every field before saving.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="bg-[#0B1F45] hover:bg-[#162d5e]" disabled={snapExtractBusy} onClick={() => void runReportExtractAll()}>
                    {snapExtractBusy ? 'Extracting…' : 'Extract report data'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSnapUploadSuggest(false)}>
                    Dismiss
                  </Button>
                </div>
                {snapExtractErr ? (
                  <p className="mt-2 text-xs text-red-800">
                    {snapExtractErr}{' '}
                    <Link href={`/portfolio/funds/${slide.fund_id}?tab=performance`} className="font-medium underline">
                      Open fund performance
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>,
      document.body,
    );

  return (
    <>
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45] sm:text-3xl">Reporting Calendar</h1>
          <p className="mt-1 text-sm text-gray-400">All fund reporting obligations by due date</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Previous month"
            onClick={() => setCursor((c) => addMonths(c, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[10rem] text-center text-lg font-semibold text-[#0B1F45]">{monthLabel}</span>
          <button
            type="button"
            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Next month"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-amber-500" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <CalendarIcon className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{stats.dueMonth}</p>
          <p className="mt-1 text-sm text-gray-500">Due This Month</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-red-500" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-600">
            <AlertCircle className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{stats.overdue}</p>
          <p className="mt-1 text-sm text-gray-500">Overdue</p>
          <p className={cn('mt-2 text-xs', stats.overdue > 0 ? 'font-medium text-red-600' : 'text-gray-400')}>Across all funds</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-blue-500" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
            <Clock className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{stats.pendingReview}</p>
          <p className="mt-1 text-sm text-gray-500">Pending Review</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-[#0F8A6E]" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 text-[#0F8A6E]">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{stats.acceptedThisMonth}</p>
          <p className="mt-1 text-sm text-gray-500">Accepted</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <Label>Fund</Label>
          <select
            className="mt-1 flex h-10 min-w-[140px] rounded-lg border border-gray-200 bg-white px-3 text-sm"
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
          >
            <option value="all">All</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fund_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Status</Label>
          <select
            className="mt-1 flex h-10 min-w-[140px] rounded-lg border border-gray-200 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="due">Due</option>
            <option value="outstanding">Outstanding</option>
            <option value="overdue">Overdue</option>
            <option value="submitted">Submitted</option>
          </select>
        </div>
        <div>
          <Label>Type</Label>
          <select
            className="mt-1 flex h-10 min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="quarterly_financial">Quarterly Financial</option>
            <option value="quarterly_investment_mgmt">Quarterly Inv. Mgmt</option>
            <option value="audited_annual">Annual Audit</option>
            <option value="inhouse_quarterly">In-house Quarterly</option>
          </select>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
            <span className="text-sm font-semibold text-[#0B1F45]">Schedule</span>
            <div className="flex rounded-lg border border-gray-200 p-0.5">
              <button
                type="button"
                onClick={() => setView('month')}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  view === 'month' ? 'bg-[#0B1F45] text-white' : 'text-gray-500 hover:bg-gray-50',
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  view === 'list' ? 'bg-[#0B1F45] text-white' : 'text-gray-500 hover:bg-gray-50',
                )}
              >
                List
              </button>
            </div>
          </div>

          {view === 'month' ? (
            <div className="overflow-x-auto">
              <div className="grid min-w-[720px] grid-cols-7 border-b border-gray-200 bg-gray-50">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div
                    key={d}
                    className="border-r border-gray-200 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 last:border-r-0"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid min-w-[720px] grid-cols-7">
                {gridDays.map((d) => {
                  const ymd = toYmd(d);
                  const inMonth = d >= monthStart && d <= monthEnd;
                  const dayObs = byDay.get(ymd) ?? [];
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = ymd === todayYmd;
                  return (
                    <div
                      key={ymd}
                      className={cn(
                        'min-h-[100px] border-b border-r border-gray-100 p-2 last:border-r-0',
                        isWeekend && 'bg-gray-50/50',
                        !inMonth && 'bg-gray-100/30',
                      )}
                    >
                      <div className="mb-1 flex justify-end">
                        {isToday ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F45] text-sm font-medium text-white">
                            {d.getDate()}
                          </span>
                        ) : (
                          <span className={cn('text-sm font-medium', inMonth ? 'text-gray-700' : 'text-gray-400')}>{d.getDate()}</span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayObs.slice(0, 3).map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setSlide(o)}
                            className={cn(
                              'mb-0.5 block max-w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium',
                              calendarPillClass(o.status),
                            )}
                            title={`${o.fund_name} · ${o.period_label}`}
                          >
                            {o.fund_name.slice(0, 14)}
                            {o.fund_name.length > 14 ? '…' : ''} · {REPORT_SHORT[o.report_type] ?? o.report_type.slice(0, 3)}
                          </button>
                        ))}
                        {dayObs.length > 3 ? <p className="text-xs text-gray-400">+{dayObs.length - 3} more</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto px-2 py-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2">Fund</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right"> </th>
                  </tr>
                </thead>
              </table>
              <div className="space-y-6 px-1 pb-4">
                {listGrouped.map(([weekKey, obs]) => (
                  <section key={weekKey}>
                    <h3 className="mb-4 border-l-4 border-amber-400 pl-4 text-sm font-semibold text-[#0B1F45]">
                      Week of{' '}
                      {new Date(`${weekKey}T12:00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </h3>
                    <table className="min-w-full text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {obs.map((o) => (
                          <tr key={o.id} className="hover:bg-[#F8F9FF]">
                            <td className="px-3 py-2 font-medium text-[#0B1F45]">{o.fund_name}</td>
                            <td className="px-3 py-2 text-gray-600">{o.report_type.replace(/_/g, ' ')}</td>
                            <td className="px-3 py-2 text-gray-600">{o.due_date}</td>
                            <td className="px-3 py-2">
                              <span className={statusPillSmall(o.status)}>{o.status.replace(/_/g, ' ')}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button type="button" className="text-xs font-medium text-[#0F8A6E] hover:underline" onClick={() => setSlide(o)}>
                                Open
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" /> Overdue
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500" /> Outstanding
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" /> Due Soon
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" /> Submitted
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-500" /> Accepted
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-400" /> Pending
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-[#0B1F45]">This Month</h2>
            <p className="text-sm text-gray-400">{monthSubLabel}</p>
          </div>
          <div className="max-h-[min(70vh,720px)] overflow-y-auto">
            {sidebarGrouped.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">No obligations due this month.</p>
            ) : (
              sidebarGrouped.map(({ group, items }) => (
                <div key={group.key}>
                  <p className={cn('px-5 py-2 text-xs font-semibold uppercase', group.tone)}>{group.label}</p>
                  <ul>
                    {items.map((o) => (
                      <li key={o.id} className="border-b border-gray-50">
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-2 px-5 py-3 text-left hover:bg-[#F8F9FF]"
                          onClick={() => setSlide(o)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#0B1F45]">{o.fund_name}</p>
                            <p className="text-xs text-gray-400">{o.report_type.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-gray-400">Due {o.due_date}</p>
                          </div>
                          <span className={cn('shrink-0', statusPillSmall(o.status))}>{o.status.replace(/_/g, ' ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {slideOver}
    </div>

    {unifiedExtractData ? (
      <UnifiedExtractionReviewModal
        open
        fundId={unifiedExtractData.fund_id}
        sourceObligationId={unifiedExtractData.obligation_id}
        data={unifiedExtractData}
        onClose={() => setUnifiedExtractData(null)}
        onSaved={() => {
          setUnifiedExtractData(null);
          dismissSlide();
          void load();
        }}
      />
    ) : null}
    </>
  );
}
