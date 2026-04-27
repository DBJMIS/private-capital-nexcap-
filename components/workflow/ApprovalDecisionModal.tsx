'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ApprovalDecisionModal({
  open,
  title,
  onClose,
  onDecided,
  approvalId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onDecided: () => void;
  approvalId: string | null;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open || !approvalId) return null;

  const decide = async (decision: 'approved' | 'rejected') => {
    setErr(null);
    const n = notes.trim();
    if (!n) {
      setErr('Decision notes are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decision_notes: n }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Request failed');
        return;
      }
      setNotes('');
      onDecided();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-shell-border bg-shell-card p-6 shadow-shell">
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        <p className="mt-1 text-sm text-navy/60">A written rationale is required for compliance.</p>
        {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
        <div className="mt-4 space-y-1">
          <Label htmlFor="dec_notes">Decision notes</Label>
          <Textarea
            id="dec_notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for your decision"
            disabled={busy}
          />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-300 text-red-800"
            disabled={busy}
            onClick={() => void decide('rejected')}
          >
            Reject
          </Button>
          <Button type="button" className="bg-navy text-navy-foreground" disabled={busy} onClick={() => void decide('approved')}>
            {busy ? 'Saving…' : 'Approve'}
          </Button>
        </div>
      </div>
    </div>
  );
}
