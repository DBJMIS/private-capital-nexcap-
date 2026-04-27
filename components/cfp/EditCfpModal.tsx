'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { dsButton, dsField, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

type CfpShape = {
  id: string;
  title: string;
  description: string | null;
  opening_date: string;
  closing_date: string;
  status: string;
  investment_criteria: unknown;
  timeline_milestones: unknown;
};

type Props = {
  open: boolean;
  cfp: CfpShape | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function EditCfpModal({ open, cfp, readOnly, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [status, setStatus] = useState('draft');
  const [criteriaJson, setCriteriaJson] = useState('{}');
  const [timelineJson, setTimelineJson] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cfp) return;
    setTitle(cfp.title ?? '');
    setDescription(cfp.description ?? '');
    setOpeningDate(cfp.opening_date ?? '');
    setClosingDate(cfp.closing_date ?? '');
    setStatus(cfp.status ?? 'draft');
    setCriteriaJson(JSON.stringify(cfp.investment_criteria ?? {}, null, 2));
    setTimelineJson(JSON.stringify(cfp.timeline_milestones ?? [], null, 2));
    setErr(null);
  }, [open, cfp]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || !cfp) return null;

  const save = async () => {
    if (readOnly) return;
    setErr(null);
    const t = title.trim();
    if (!t) {
      setErr('Title is required.');
      return;
    }
    if (!openingDate || !closingDate) {
      setErr('Opening and closing dates are required.');
      return;
    }
    if (closingDate <= openingDate) {
      setErr('Closing date must be after opening date.');
      return;
    }
    let investment_criteria: unknown;
    let timeline_milestones: unknown;
    try {
      investment_criteria = JSON.parse(criteriaJson);
      timeline_milestones = JSON.parse(timelineJson);
    } catch {
      setErr('Criteria and timeline must be valid JSON.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/cfp/${cfp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t,
          description: description.trim() || null,
          opening_date: openingDate,
          closing_date: closingDate,
          status,
          investment_criteria,
          timeline_milestones,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Save failed');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F45]/40 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="pr-10 text-lg font-semibold text-[#0B1F45]">Edit CFP</h2>
        {readOnly && <p className="mt-2 text-sm text-[#6B7280]">This CFP is read-only.</p>}
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="edit-title">
              Title <span className={dsField.required}>*</span>
            </Label>
            <Input id="edit-title" className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy || readOnly} />
          </div>
          <div>
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              className="mt-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy || readOnly}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-open">Opening date *</Label>
              <Input
                id="edit-open"
                type="date"
                className="mt-1"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                disabled={busy || readOnly}
              />
            </div>
            <div>
              <Label htmlFor="edit-close">Closing date *</Label>
              <Input
                id="edit-close"
                type="date"
                className="mt-1"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                disabled={busy || readOnly}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              className={cn(dsField.input, 'mt-1')}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy || readOnly}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
            <p className={cn('mt-1', dsType.helper)}>
              Use “Activate CFP” / “Close CFP” for standard workflow when possible.
            </p>
          </div>
          <div>
            <Label htmlFor="edit-criteria">Investment criteria (JSON)</Label>
            <Textarea
              id="edit-criteria"
              className="mt-1 font-mono text-xs"
              rows={10}
              value={criteriaJson}
              onChange={(e) => setCriteriaJson(e.target.value)}
              disabled={busy || readOnly}
            />
          </div>
          <div>
            <Label htmlFor="edit-timeline">Timeline milestones (JSON array)</Label>
            <Textarea
              id="edit-timeline"
              className="mt-1 font-mono text-xs"
              rows={6}
              value={timelineJson}
              onChange={(e) => setTimelineJson(e.target.value)}
              disabled={busy || readOnly}
              placeholder='[{"date":"2026-04-01","label":"Applications open"}]'
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className={dsButton.primary} disabled={busy || readOnly} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
