'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function AddDisbursementModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    amount_usd: number;
    disbursement_date: string | null;
    reference_number: string | null;
    notes: string | null;
  }) => Promise<void>;
  busy: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-shell-border bg-shell-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-navy">Add disbursement (pending)</h3>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="amt">Amount (USD)</Label>
            <Input
              id="amt"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ddate">Disbursement date</Label>
            <Input id="ddate" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ref">Reference number</Label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="n">Notes</Label>
            <Textarea id="n" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-navy text-navy-foreground"
            disabled={busy}
            onClick={() =>
              void onSubmit({
                amount_usd: Number(amount),
                disbursement_date: date || null,
                reference_number: ref.trim() || null,
                notes: notes.trim() || null,
              })
            }
          >
            {busy ? 'Saving…' : 'Create pending'}
          </Button>
        </div>
      </div>
    </div>
  );
}
