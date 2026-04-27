'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import type { UnifiedExtractApiResponse } from '@/components/portfolio/UnifiedExtractionReviewModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { VcComplianceAction } from '@/types/database';

const REPORT_LABELS: Record<string, string> = {
  quarterly_financial: 'Quarterly Financial',
  quarterly_investment_mgmt: 'Quarterly Inv. Mgmt',
  audited_annual: 'Annual Audit',
  inhouse_quarterly: 'In-house Quarterly',
};

type ObligationLite = {
  id: string;
  report_type: string;
  period_label: string;
  due_date: string;
  status: string;
  days_overdue?: number;
};

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
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
  return { className: map[s] ?? map.pending!, label: labels[s] ?? st };
}

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const hrs = Math.floor((Date.now() - t) / 3600000);
  if (hrs < 24 && hrs >= 0) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MarkReceivedSlideOver({
  open,
  obligation,
  fundName,
  onClose,
  onSaved,
  onUnifiedExtractReady,
}: {
  open: boolean;
  obligation: ObligationLite | null;
  fundName: string;
  onClose: () => void;
  onSaved: () => void;
  /** After upload, when the user runs combined AI extraction, pass the API payload to the parent for the unified review modal. */
  onUnifiedExtractReady?: (data: UnifiedExtractApiResponse) => void;
}) {
  const [recvDate, setRecvDate] = useState('');
  const [recvBy, setRecvBy] = useState('');
  const [recvNotes, setRecvNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actions, setActions] = useState<VcComplianceAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [postUploadSuggest, setPostUploadSuggest] = useState(false);
  const [extractAllBusy, setExtractAllBusy] = useState(false);
  const [extractAllErr, setExtractAllErr] = useState<string | null>(null);

  const loadActions = useCallback(async () => {
    if (!obligation) return;
    setActionsLoading(true);
    try {
      const res = await fetch(`/api/portfolio/obligations/${obligation.id}/actions`);
      const j = (await res.json()) as { actions?: VcComplianceAction[] };
      if (res.ok) setActions(j.actions ?? []);
    } finally {
      setActionsLoading(false);
    }
  }, [obligation]);

  useEffect(() => {
    if (open && obligation) {
      setRecvDate(todayIso());
      setRecvBy('');
      setRecvNotes('');
      setFile(null);
      setErr(null);
      setSuccess(null);
      setPostUploadSuggest(false);
      setExtractAllErr(null);
      void loadActions();
    }
  }, [open, obligation, loadActions]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const save = async () => {
    if (!obligation || !recvDate.trim() || !recvBy.trim()) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/portfolio/obligations/${obligation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_received',
          submitted_date: recvDate.trim(),
          submitted_by: recvBy.trim(),
          notes: recvNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');

      let suggestExtraction = false;
      if (file) {
        const max = 20 * 1024 * 1024;
        if (file.size > max) throw new Error('File must be 20MB or smaller');
        const nameLower = file.name.toLowerCase();
        const ok =
          file.type === 'application/pdf' ||
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          nameLower.endsWith('.pdf') ||
          nameLower.endsWith('.docx');
        if (!ok) throw new Error('Only PDF or DOCX allowed');
        const fd = new FormData();
        fd.set('file', file);
        fd.set('submitted_date', recvDate.trim());
        const up = await fetch(`/api/portfolio/obligations/${obligation.id}/upload`, { method: 'POST', body: fd });
        const uj = (await up.json()) as { suggest_extraction?: boolean; error?: string };
        if (!up.ok) throw new Error(uj.error ?? 'Upload failed');
        suggestExtraction = !!uj.suggest_extraction;
      }

      setSuccess('Marked as received.');
      onSaved();
      await loadActions();
      if (suggestExtraction) {
        setPostUploadSuggest(true);
      } else {
        setTimeout(() => {
          onClose();
          setSuccess(null);
        }, 800);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (!obligation) return null;

  const sb = statusBadge(obligation.status);
  const daysOd = obligation.days_overdue ?? 0;

  const runExtractAll = async () => {
    setExtractAllBusy(true);
    setExtractAllErr(null);
    try {
      const res = await fetch(`/api/portfolio/obligations/${obligation.id}/extract-all`, { method: 'POST' });
      const j = (await res.json()) as UnifiedExtractApiResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Extraction failed');
      setPostUploadSuggest(false);
      onUnifiedExtractReady?.(j);
      onClose();
    } catch (e) {
      setExtractAllErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setExtractAllBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn('fixed inset-0 z-50 bg-black/40 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        aria-hidden={!open}
        onMouseDown={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={cn(
          'fixed right-0 top-0 z-[60] flex h-full w-full max-w-[400px] flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0B1F45]">Mark as Received</h3>
            <p className="text-sm text-gray-500">
              {fundName} — {obligation.period_label}
            </p>
          </div>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={() => !busy && onClose()}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {err ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{err}</div> : null}
          {success ? <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{success}</div> : null}
          {postUploadSuggest ? (
            <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
              <p className="font-medium">Extract report data?</p>
              <p className="mt-1 text-xs text-indigo-900/90">
                AI can suggest performance snapshot fields (NAV, period, IRR) and narrative indicators from this document. You review everything before anything is saved.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" className="bg-[#0B1F45] hover:bg-[#162d5e]" disabled={extractAllBusy} onClick={() => void runExtractAll()}>
                  {extractAllBusy ? 'Extracting…' : 'Extract report data'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPostUploadSuggest(false)}>
                  Not now
                </Button>
              </div>
              {extractAllErr ? <p className="mt-2 text-xs text-red-800">{extractAllErr}</p> : null}
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-gray-100 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-gray-400">Obligation</p>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', sb.className)}>{sb.label}</span>
            <p className="text-sm text-gray-700">
              <span className="font-medium text-[#0B1F45]">{REPORT_LABELS[obligation.report_type] ?? obligation.report_type}</span>
            </p>
            <p className="text-sm text-red-600">
              Due {obligation.due_date}
              {daysOd > 0 ? ` — ${daysOd} days overdue` : null}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <Label>Submitted date *</Label>
              <Input type="date" className="mt-1" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} required />
            </div>
            <div>
              <Label>Submitted by *</Label>
              <Input className="mt-1" value={recvBy} onChange={(e) => setRecvBy(e.target.value)} placeholder="Fund manager contact" required />
            </div>
            <div>
              <Label>Upload document (optional)</Label>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-8 text-center text-sm text-gray-600 hover:bg-gray-50">
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                Drag report PDF or DOCX here or click to browse
                {file ? <span className="mt-2 text-xs font-medium text-[#0F8A6E]">{file.name}</span> : null}
              </label>
              <p className="mt-1 text-xs text-gray-400">Max 20MB</p>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
                value={recvNotes}
                onChange={(e) => setRecvNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Action History</p>
            {actionsLoading ? (
              <p className="mt-2 text-xs text-gray-500">Loading…</p>
            ) : actions.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">No actions recorded yet</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {actions.map((a) => (
                  <li key={a.id} className="flex gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F8A6E]" />
                    <div>
                      <p className="font-medium text-[#0B1F45]">{a.action_type.replace(/_/g, ' ')}</p>
                      <p className="text-gray-400">
                        {a.actor_name ?? '—'} · {formatRelative(a.created_at)}
                      </p>
                      {a.notes ? <p className="text-gray-500 italic">{a.notes}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 bg-white px-4 py-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" disabled={busy || !recvDate || !recvBy.trim()} onClick={() => void save()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save — Mark Received
          </Button>
        </div>
      </div>
    </>
  );
}
