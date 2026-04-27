'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { dsButton, dsField } from '@/components/ui/design-system';
import { DBJ_INVESTMENT_CRITERIA } from '@/lib/cfp/dbj-criteria';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

function defaultCriteriaObject(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DBJ_INVESTMENT_CRITERIA)) as Record<string, unknown>;
}

export function CreateCfpModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [criteriaExpanded, setCriteriaExpanded] = useState(false);
  const [criteriaJson, setCriteriaJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const baselineCriteria = useMemo(() => defaultCriteriaObject(), []);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setOpeningDate('');
    setClosingDate('');
    setCriteriaExpanded(false);
    setCriteriaJson(JSON.stringify(baselineCriteria, null, 2));
    setErr(null);
  }, [open, baselineCriteria]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const parseCriteria = (): Record<string, unknown> | null => {
    try {
      const o = JSON.parse(criteriaJson) as unknown;
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      return o as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const onSave = async () => {
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
    const criteria = criteriaExpanded ? parseCriteria() : defaultCriteriaObject();
    if (!criteria) {
      setErr('Investment criteria must be valid JSON.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/cfp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t,
          description: description.trim() || null,
          opening_date: openingDate,
          closing_date: closingDate,
          investment_criteria: criteria,
        }),
      });
      const j = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Save failed');
        return;
      }
      if (!j.id) {
        setErr('Invalid response');
        return;
      }
      onCreated(j.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const c = baselineCriteria;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F45]/40 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="pr-10 text-lg font-semibold text-[#0B1F45]">New Call for Proposals</h2>
        <p className="mt-1 text-sm text-[#6B7280]">Create a draft CFP. You can activate it when ready to accept applications.</p>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="cfp-title">
              Title <span className={dsField.required}>*</span>
            </Label>
            <Input
              id="cfp-title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Jamaica VC Fund Programme 2026"
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="cfp-desc">Description</Label>
            <Textarea
              id="cfp-desc"
              className="mt-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this call..."
              disabled={busy}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cfp-open">
                Opening date <span className={dsField.required}>*</span>
              </Label>
              <Input
                id="cfp-open"
                type="date"
                className="mt-1"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="cfp-close">
                Closing date <span className={dsField.required}>*</span>
              </Label>
              <Input
                id="cfp-close"
                type="date"
                className="mt-1"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-[#F3F4F6] p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setCriteriaExpanded((v) => !v)}
            >
              <span className="text-sm font-semibold text-[#0B1F45]">DBJ Investment Criteria</span>
              <span className="text-xs font-medium text-[#C8973A]">{criteriaExpanded ? 'Hide editor' : 'Edit criteria'}</span>
            </button>
            {!criteriaExpanded ? (
              <ul className="mt-3 space-y-1.5 text-sm text-[#6B7280]">
                <li>Min fund size: USD {(Number(c.fund_target_size_min_usd) / 1_000_000).toFixed(0)}M</li>
                <li>
                  DBJ participation: up to {String(c.dbj_participation_max_pct)}% / max USD{' '}
                  {Number(c.dbj_participation_max_usd).toLocaleString('en-US')}
                </li>
                <li>Manager commitment: min {String(c.manager_commitment_min_pct)}%</li>
                <li>Jamaica allocation: min {String(c.jamaica_allocation_min_pct)}%</li>
                <li>Private capital: min {String(c.private_capital_min_pct)}%</li>
                <li>Min fund duration: {String(c.fund_duration_min_years)} years</li>
              </ul>
            ) : (
              <div className="mt-3">
                <Label htmlFor="cfp-crit-json">Criteria JSON</Label>
                <Textarea
                  id="cfp-crit-json"
                  className="mt-1 font-mono text-xs"
                  rows={12}
                  value={criteriaJson}
                  onChange={(e) => setCriteriaJson(e.target.value)}
                  disabled={busy}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className={cn(dsButton.primary)} disabled={busy} onClick={() => void onSave()}>
            {busy ? 'Saving…' : 'Save as Draft'}
          </Button>
        </div>
      </div>
    </div>
  );
}
