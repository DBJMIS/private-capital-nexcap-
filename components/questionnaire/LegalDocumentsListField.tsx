'use client';

import { useState } from 'react';
import { FileText, Pencil, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { LegalDocumentsListQuestion } from '@/lib/questionnaire/types';
import { LegalDocumentModal, type LegalRegisterUiRow } from '@/components/questionnaire/LegalDocumentModal';
import { cn } from '@/lib/utils';

function newRow(): LegalRegisterUiRow {
  return {
    id:
      typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `ld-${Date.now()}`,
    document_name: '',
    purpose: '',
    status: 'draft',
    document_id: null,
  };
}

function parseRows(value: unknown): LegalRegisterUiRow[] {
  if (!Array.isArray(value)) return [];
  return (value as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? newRow().id),
    document_name: String(r.document_name ?? r.name ?? ''),
    purpose: String(r.purpose ?? ''),
    status: String(r.status || 'draft'),
    document_id: (r.document_id as string) ?? null,
  }));
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-amber-100 text-amber-800';
    case 'in_preparation':
      return 'bg-blue-100 text-blue-800';
    case 'final':
      return 'bg-teal-100 text-teal-800';
    case 'executed':
      return 'bg-[#0B1F45] text-white';
    case 'not_yet_drafted':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    in_preparation: 'In preparation',
    final: 'Final',
    executed: 'Executed',
    not_yet_drafted: 'Not yet drafted',
  };
  return map[status] ?? status;
}

export type LegalDocumentsListFieldProps = {
  question: LegalDocumentsListQuestion;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
};

export function LegalDocumentsListField({ question, value, onChange, disabled }: LegalDocumentsListFieldProps) {
  const rows = parseRows(value);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalRow, setModalRow] = useState<LegalRegisterUiRow>(() => newRow());

  const openCreate = () => {
    setModalMode('create');
    setModalRow(newRow());
    setModalOpen(true);
  };

  const openEdit = (r: LegalRegisterUiRow) => {
    setModalMode('edit');
    setModalRow({ ...r });
    setModalOpen(true);
  };

  /** Persists into parent `answers` (and autosave PUT) via QuestionField → onAnswerChange. */
  const handleSaved = (row: LegalRegisterUiRow) => {
    if (modalMode === 'create') {
      onChange(question.key, [...rows, row]);
    } else {
      onChange(
        question.key,
        rows.map((x) => (x.id === row.id ? row : x)),
      );
    }
  };

  const remove = (id: string) => {
    onChange(
      question.key,
      rows.filter((r) => r.id !== id),
    );
  };

  return (
    <div>
      <h3 className="mb-1 text-[13px] font-semibold text-navy">{question.label}</h3>
      {question.helper ? <p className="mb-3 text-[12px] leading-snug text-[#6b7280]">{question.helper}</p> : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
          <FileText className="mb-3 h-10 w-10 text-gray-300" aria-hidden />
          <p className="text-sm font-medium text-gray-500">No legal documents added</p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">
            Add all documents required to constitute and regulate the Fund and Manager
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={openCreate}
            className="mt-4 rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            + Add Document
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2"
            >
              <span className="min-w-0 flex-1 font-medium text-[#0B1F45]">{r.document_name || '—'}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                  statusBadgeClass(r.status),
                )}
              >
                {statusLabel(r.status)}
              </span>
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => openEdit(r)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
              <button
                type="button"
                disabled={disabled}
                aria-label="Remove document"
                onClick={() => remove(r.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={openCreate}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-400 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add Document
          </button>
        </div>
      )}

      <LegalDocumentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        disabled={disabled}
        initialRow={modalRow}
        onSaved={handleSaved}
      />
    </div>
  );
}
