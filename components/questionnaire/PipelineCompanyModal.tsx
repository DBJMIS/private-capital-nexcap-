'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Globe,
  MoreHorizontal,
  RefreshCw,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PipelineSectorCombobox } from '@/components/questionnaire/PipelineSectorCombobox';
import { cn } from '@/lib/utils';
import {
  PIPELINE_EXIT_TYPE_OPTIONS,
  PIPELINE_NEGOTIATION_OPTIONS,
  type PipelineExitTypeValue,
  type PipelineNegotiationValue,
} from '@/lib/questionnaire/pipeline-display';
import type { PipelineRow } from '@/lib/questionnaire/validate';

function cloneRow(r: PipelineRow): PipelineRow {
  return { ...r };
}

const EXIT_ICONS: Record<PipelineExitTypeValue, LucideIcon> = {
  ipo: TrendingUp,
  trade_sale: Globe,
  strategic_acquirer: Users,
  mbo_mbi: RefreshCw,
  other: MoreHorizontal,
};

export type PipelineCompanyModalProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  questionnaireId: string;
  disabled?: boolean;
  initialRow: PipelineRow;
  /** Total companies in section (footer label). */
  totalCompanyCount: number;
  onSaved: (row: PipelineRow) => void;
};

export function PipelineCompanyModal({
  open,
  onClose,
  mode,
  questionnaireId,
  disabled,
  initialRow,
  totalCompanyCount,
  onSaved,
}: PipelineCompanyModalProps) {
  const [draft, setDraft] = useState<PipelineRow>(() => cloneRow(initialRow));
  const [saving, setSaving] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneRow(initialRow));
  }, [open, initialRow]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const baseline = useMemo(() => cloneRow(initialRow), [initialRow]);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  const handleCloseAttempt = () => {
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  const validate = (): string | null => {
    if (!draft.company_name?.trim()) return 'Company name is required.';
    if (!draft.sector?.trim()) return 'Sector is required.';
    const amt = (draft.amount_usd ?? '').replace(/,/g, '').trim();
    if (!amt || !Number.isFinite(parseFloat(amt)) || parseFloat(amt) <= 0) {
      return 'Expected investment amount (USD) is required.';
    }
    const ns = (draft.negotiation_status ?? '').trim() as PipelineNegotiationValue;
    if (!PIPELINE_NEGOTIATION_OPTIONS.some((o) => o.value === ns)) return 'Select negotiation status.';
    const et = (draft.exit_type ?? '').trim() as PipelineExitTypeValue;
    if (!PIPELINE_EXIT_TYPE_OPTIONS.some((o) => o.value === et)) return 'Select exit type.';
    return null;
  };

  const handleSave = async () => {
    if (disabled) return;
    const err = validate();
    if (err) {
      window.alert(err);
      return;
    }
    setSaving(true);
    try {
      const body = {
        company_name: draft.company_name,
        sector: draft.sector,
        amount_usd: draft.amount_usd,
        sales_usd: draft.sales_usd,
        leverage: draft.leverage,
        equity_pct: draft.equity_pct,
        negotiation_status: draft.negotiation_status,
        exit_type: draft.exit_type,
        exit_notes: draft.exit_notes ?? draft.exit_strategy,
        investment_thesis: draft.investment_thesis,
        deal_structure_notes: draft.deal_structure_notes,
      };
      if (mode === 'create') {
        const res = await fetch(`/api/questionnaires/${questionnaireId}/deal-flow/pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { row?: PipelineRow; error?: string };
        if (!res.ok) throw new Error(j.error ?? 'Save failed');
        if (!j.row) throw new Error('No row returned');
        onSaved(j.row);
      } else {
        const res = await fetch(`/api/questionnaires/${questionnaireId}/deal-flow/pipeline/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { row?: PipelineRow; error?: string };
        if (!res.ok) throw new Error(j.error ?? 'Save failed');
        if (!j.row) throw new Error('No row returned');
        onSaved(j.row);
      }
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const subtitle =
    mode === 'create' ? 'Adding new company' : draft.company_name?.trim() || initialRow.company_name || 'Edit';

  if (!open) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="pipeline-modal-title"
        className="relative flex max-h-[90vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 id="pipeline-modal-title" className="flex items-center gap-2 text-lg font-bold text-navy">
              <Building2 className="h-5 w-5 shrink-0 text-[#0B1F45]" aria-hidden />
              Pipeline Company
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={handleCloseAttempt}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Company details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-xs font-medium text-navy">
                  Company name <span className="text-gold">*</span>
                </label>
                <Input
                  disabled={disabled}
                  value={draft.company_name ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
                  placeholder="Company name"
                />
              </div>
              <div>
                <PipelineSectorCombobox
                  id="pipeline-sector"
                  value={draft.sector ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, sector: v }))}
                  disabled={disabled}
                  required
                />
              </div>
            </div>
          </section>

          <section className="mt-8 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Financials</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-navy">
                  Expected investment amount (USD) <span className="text-gold">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">$</span>
                  <Input
                    disabled={disabled}
                    inputMode="decimal"
                    className="font-mono tabular-nums"
                    value={draft.amount_usd ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, amount_usd: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-navy">Annual sales (USD)</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">$</span>
                  <Input
                    disabled={disabled}
                    inputMode="decimal"
                    className="font-mono tabular-nums"
                    value={draft.sales_usd ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, sales_usd: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-navy">Leverage</label>
                <Input
                  disabled={disabled}
                  value={draft.leverage ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, leverage: e.target.value }))}
                  placeholder="Describe leverage"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-navy">Equity % sought</label>
                <div className="flex items-center gap-2">
                  <Input
                    disabled={disabled}
                    inputMode="decimal"
                    className="max-w-[8rem] font-mono tabular-nums"
                    value={draft.equity_pct ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, equity_pct: e.target.value }))}
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Deal status — negotiation <span className="text-gold">*</span>
            </p>
            <div className="space-y-1.5">
              {PIPELINE_NEGOTIATION_OPTIONS.map((o) => {
                const selected = draft.negotiation_status === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDraft((d) => ({ ...d, negotiation_status: o.value }))}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'border border-[#0B1F45] bg-[#0B1F45]/5 font-medium text-[#0B1F45]'
                        : 'border border-transparent text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        selected ? 'border-[#0B1F45] bg-[#0B1F45]' : 'border-gray-300',
                      )}
                      aria-hidden
                    >
                      {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Exit type <span className="text-gold">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PIPELINE_EXIT_TYPE_OPTIONS.map((o) => {
                const selected = draft.exit_type === o.value;
                const Icon = EXIT_ICONS[o.value];
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDraft((d) => ({ ...d, exit_type: o.value }))}
                    className={cn(
                      'flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-3 text-center text-xs font-medium transition-colors',
                      selected
                        ? 'border-[#0B1F45] bg-[#0B1F45]/5 text-[#0B1F45]'
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    <div className="mt-1 leading-tight">
                      {o.sub ? (
                        <>
                          {o.label}
                          <br />
                          {o.sub}
                        </>
                      ) : (
                        o.label
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pt-2">
              <label className="mb-1 block text-xs font-medium text-navy">Exit strategy notes</label>
              <Textarea
                disabled={disabled}
                rows={2}
                value={draft.exit_notes ?? draft.exit_strategy ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    exit_notes: e.target.value,
                    exit_strategy: e.target.value,
                  }))
                }
                placeholder="Additional exit context"
              />
            </div>
          </section>

          <section className="mt-8 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Investment thesis (for this company)
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-navy">Why this company? Investment rationale</label>
              <Textarea
                disabled={disabled}
                rows={3}
                value={draft.investment_thesis ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, investment_thesis: e.target.value }))}
                placeholder="Rationale"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-navy">Deal structure notes</label>
              <Textarea
                disabled={disabled}
                rows={2}
                value={draft.deal_structure_notes ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, deal_structure_notes: e.target.value }))}
                placeholder="Structure, terms, or conditions"
              />
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
          <p className="text-xs text-gray-500">
            {totalCompanyCount} {totalCompanyCount === 1 ? 'company' : 'companies'} added
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleCloseAttempt} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-navy text-white hover:bg-navy/90"
              disabled={disabled || saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save company'}
            </Button>
          </div>
        </footer>
      </div>
    </div>

    <ConfirmModal
      isOpen={discardConfirmOpen}
      title="Discard unsaved changes?"
      message="You have unsaved edits to this pipeline company. If you leave now, those changes will be lost."
      confirmLabel="Discard"
      confirmVariant="warning"
      cancelLabel="Keep editing"
      onConfirm={() => {
        setDiscardConfirmOpen(false);
        onClose();
      }}
      onCancel={() => setDiscardConfirmOpen(false)}
    />
    </>
  );
}
