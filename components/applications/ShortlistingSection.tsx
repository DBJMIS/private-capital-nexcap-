'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/format-date';

type ShortlistMeta = {
  notes: string | null;
  decided_at: string | null;
  decision: string | null;
} | null;

export function ShortlistingSection({
  applicationId,
  applicationStatus,
  shortlist,
  canWrite,
}: {
  applicationId: string;
  applicationStatus: string;
  shortlist: ShortlistMeta;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const st = applicationStatus.trim().toLowerCase();
  const showForm = st === 'pre_qualified' && canWrite;
  const readOnlyShortlisted =
    (shortlist?.decision === 'shortlisted' && st !== 'pre_qualified') || st === 'shortlisted';

  const submit = async (decision: 'shortlisted' | 'not_shortlisted') => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/shortlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          notes: notes.trim(),
          rejection_reason: decision === 'not_shortlisted' ? rejectReason.trim() : undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Request failed');
        return;
      }
      setRejectOpen(false);
      setRejectReason('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (readOnlyShortlisted) {
    return (
      <div className="mt-8 border-t border-gray-100 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0B1F45]">Shortlisting</p>
        <p className="mt-2 text-sm font-medium text-teal-700">✓ Shortlisted for presentation</p>
        {shortlist?.notes ? <p className="mt-2 text-sm text-gray-600">Notes: {shortlist.notes}</p> : null}
        {shortlist?.decided_at ? (
          <p className="mt-1 text-xs text-gray-400">Shortlisted on {formatShortDate(shortlist.decided_at)}</p>
        ) : null}
      </div>
    );
  }

  if (!showForm) {
    return null;
  }

  return (
    <div className="mt-8 border-t border-gray-100 pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0B1F45]">Next step: Shortlisting</p>
      <p className="mt-2 text-sm text-gray-600">
        Conduct preliminary screening against the Investor Panel&apos;s investment criteria, then shortlist this fund manager for presentation.
      </p>

      <label className="mt-4 block text-xs font-medium text-gray-700">Preliminary screening notes</label>
      <textarea
        className="mt-1 min-h-[96px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="DBJ officer records screening notes…"
      />

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

      {!rejectOpen ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            className="bg-[#0F8A6E] text-white hover:bg-[#0c755d]"
            disabled={busy}
            onClick={() => void submit('shortlisted')}
          >
            ✓ Shortlist for Presentation
          </Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => setRejectOpen(true)}>
            ✗ Not Shortlisted
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-gray-700">Rejection reason</label>
          <textarea
            className="min-h-[88px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this application is not being shortlisted…"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={busy || !rejectReason.trim()}
              onClick={() => void submit('not_shortlisted')}
            >
              Confirm not shortlisted
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
