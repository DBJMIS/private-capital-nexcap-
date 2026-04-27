'use client';

import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { PipelineCompanyModal } from '@/components/questionnaire/PipelineCompanyModal';
import type { PipelineCompaniesQuestion } from '@/lib/questionnaire/types';
import { formatPipelineUsd, pipelineExitTypeShortLabel } from '@/lib/questionnaire/pipeline-display';
import { pipelineSectorLabel } from '@/lib/questionnaire/pipeline-sectors';
import type { PipelineRow } from '@/lib/questionnaire/validate';
import { cn } from '@/lib/utils';

function parseRows(value: unknown): PipelineRow[] {
  if (!Array.isArray(value)) return [];
  return value as PipelineRow[];
}

function newPipelineRow(): PipelineRow {
  return {
    id:
      typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `tmp-${Date.now()}`,
    company_name: '',
    sector: '',
    amount_usd: '',
    sales_usd: '',
    leverage: '',
    equity_pct: '',
    negotiation_status: 'initial_contact',
    exit_type: 'ipo',
    exit_notes: '',
    exit_strategy: '',
    investment_thesis: '',
    deal_structure_notes: '',
  };
}

function equityLine(r: PipelineRow): string {
  const raw = (r.equity_pct ?? '').replace(/%/g, '').trim();
  if (!raw) return '—';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '—';
  return `${n}% equity`;
}

function exitLine(r: PipelineRow): string {
  const typePart = pipelineExitTypeShortLabel(r.exit_type);
  const notes = (r.exit_notes ?? r.exit_strategy ?? '').trim();
  if (notes) return `${typePart} — ${notes.length > 48 ? `${notes.slice(0, 48)}…` : notes}`;
  return typePart || '—';
}

export type PipelineCompaniesFieldProps = {
  questionnaireId: string;
  question: PipelineCompaniesQuestion;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
};

export function PipelineCompaniesField({
  questionnaireId,
  question,
  value,
  onChange,
  disabled,
}: PipelineCompaniesFieldProps) {
  const rows = parseRows(value);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalRow, setModalRow] = useState<PipelineRow>(() => newPipelineRow());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openCreate = () => {
    setModalMode('create');
    setModalRow(newPipelineRow());
    setModalOpen(true);
  };

  const openEdit = (r: PipelineRow) => {
    setModalMode('edit');
    setModalRow({ ...r });
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
  };

  const handleSaved = (row: PipelineRow) => {
    if (modalMode === 'create') {
      onChange(question.key, [...rows, row]);
    } else {
      onChange(question.key, rows.map((x) => (x.id === row.id ? row : x)));
    }
  };

  const executeRemove = async (id: string) => {
    if (disabled) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/questionnaires/${questionnaireId}/deal-flow/pipeline/${id}`, {
        method: 'DELETE',
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Delete failed');
      onChange(
        question.key,
        rows.filter((r) => r.id !== id),
      );
      setDeleteConfirmId(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <span className="text-[13px] font-medium normal-case leading-snug text-navy">
          {question.label}
          {question.required ? <span className="text-gold"> *</span> : null}
        </span>
      </div>
      {question.helper ? <p className="mb-2 text-[12px] leading-snug text-[#6b7280]">{question.helper}</p> : null}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-navy">Pipeline</h3>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-t border-dashed border-gray-200 bg-white py-10 text-center">
            <Building2 className="mb-3 h-10 w-10 text-gray-300" aria-hidden />
            <p className="text-sm font-medium text-gray-500">No pipeline companies added</p>
            <p className="mt-1 max-w-xs text-xs text-gray-400">
              Add companies you have approached or plan to approach
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={openCreate}
              className="mt-4 rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              + Add Pipeline Company
            </button>
          </div>
        ) : (
          <div>
            {rows.map((r, i) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm tabular-nums text-gray-400">{i + 1}.</span>
                    <span className="font-medium text-navy">{r.company_name || '—'}</span>
                    {r.sector ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {pipelineSectorLabel(r.sector)}
                      </span>
                    ) : null}
                    <span className="text-sm text-gray-600">{formatPipelineUsd(r.amount_usd)} investment</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatPipelineUsd(r.sales_usd)} sales <span className="px-1">│</span> {equityLine(r)}{' '}
                    <span className="px-1">│</span> {exitLine(r)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg border px-3 py-1 text-sm"
                    disabled={disabled}
                    onClick={() => openEdit(r)}
                  >
                    Edit
                  </Button>
                  <button
                    type="button"
                    disabled={disabled}
                    className="rounded px-2 py-1 text-lg leading-none text-gray-400 transition-colors hover:text-red-600 disabled:opacity-40"
                    aria-label="Remove company"
                    onClick={() => setDeleteConfirmId(r.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <div className="p-4">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={openCreate}
                className={cn(
                  'w-full border-dashed border-gray-300 text-[#0B1F45] hover:bg-gray-50',
                  'justify-center',
                )}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Add pipeline company
              </Button>
            </div>
          </div>
        )}
      </div>

      <PipelineCompanyModal
        open={modalOpen}
        onClose={handleModalClose}
        mode={modalMode}
        questionnaireId={questionnaireId}
        disabled={disabled}
        initialRow={modalRow}
        totalCompanyCount={rows.length}
        onSaved={handleSaved}
      />

      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        title="Remove pipeline company?"
        message="This removes the company from this questionnaire section. You can add it again later if needed."
        confirmLabel="Remove"
        confirmVariant="danger"
        isLoading={deleteBusy}
        onConfirm={() => (deleteConfirmId ? executeRemove(deleteConfirmId) : undefined)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
