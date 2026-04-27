'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Users, X } from 'lucide-react';

import { FieldGroup } from '@/components/ui/FieldGroup';
import {
  ProfessionalModal,
  type ProfessionalModalProps,
  type ProfessionalModalType,
} from '@/components/questionnaire/ProfessionalModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import type { StructuredListQuestion } from '@/lib/questionnaire/types';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import type { StructuredListKind } from '@/lib/questionnaire/structured-list-registry';
import { emptyStructuredListRow, ensureMinStructuredRows } from '@/lib/questionnaire/structured-list-defaults';
import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import { bioCompletionLabel, bioCompletionPct, staffBioHasSubstantiveContent } from '@/lib/questionnaire/bio-completion';
import { cn } from '@/lib/utils';

type Row = Record<string, unknown>;

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Lucide `Plus` is shown beside the label; strip a leading "+" from copy to avoid "++". */
function addRowButtonCaption(text: string): string {
  return text.replace(/^\s*\+\s*/, '').trim();
}

function normalizePositionStatus(v: unknown): string {
  const s = str(v).trim();
  if (s === 'part_time' || s === 'vacant' || s === 'full_time') return s;
  return 'full_time';
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

function pctDisplay(row: Row): string {
  const raw = row.time_dedication_pct;
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function positionPill(kind: StructuredListKind, row: Row): string {
  if (kind === 'investment_professionals') {
    const ps = normalizePositionStatus(row.position_status);
    if (ps === 'vacant') return 'Vacant';
    if (ps === 'part_time') return 'Part-time';
    return 'Full-time';
  }
  const d = str(row.department);
  const labels: Record<string, string> = {
    legal: 'Legal',
    accounting: 'Accounting',
    it: 'IT',
    admin: 'Admin',
    other: 'Other',
  };
  return labels[d] || '—';
}

function removeDisplayName(kind: StructuredListKind, row: Row): string {
  if (kind === 'investment_professionals' && normalizePositionStatus(row.position_status) === 'vacant') {
    return str(row.title).trim() || 'this vacant position';
  }
  return str(row.full_name).trim() || 'this team member';
}

type Props = {
  question: StructuredListQuestion;
  value: unknown;
  onChange: (key: string, next: Row[]) => void;
  disabled?: boolean;
  questionnaireId: string;
  sectionKey: string;
  documents: DdDocumentRow[];
  sponsorStaffBios: StaffBioFormRow[];
  onSponsorStaffBiosChange: (next: StaffBioFormRow[]) => void;
  answersSnapshot: Record<string, unknown>;
  putSponsor: ProfessionalModalProps['putSponsor'];
  onDocumentsChanged?: () => void;
  onAfterPersist?: () => Promise<void>;
  listHydrationEpoch?: number;
};

export function PersonnelStructuredList({
  question,
  value,
  onChange,
  disabled,
  questionnaireId,
  sectionKey,
  documents,
  sponsorStaffBios,
  onSponsorStaffBiosChange,
  answersSnapshot,
  putSponsor,
  onDocumentsChanged,
  onAfterPersist,
  listHydrationEpoch = 0,
}: Props) {
  const listKind = question.listKind as Extract<StructuredListKind, 'investment_professionals' | 'support_staff'>;
  const meta = STRUCTURED_LIST_REGISTRY[listKind];
  const minRows = meta.minRows;
  const modalType: ProfessionalModalType = listKind === 'investment_professionals' ? 'professional' : 'support_staff';

  const [rows, setRows] = useState<Row[]>(() =>
    ensureMinStructuredRows(listKind, Array.isArray(value) ? value : []),
  );
  const valueRef = useRef(value);
  valueRef.current = value;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    setRows(ensureMinStructuredRows(listKind, Array.isArray(value) ? value : []));
  }, [listHydrationEpoch, listKind, value]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const isEmpty = rows.length === 0;
  const canRemoveRow = rows.length > minRows;
  const showRemoveButton = rows.length > 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalSeed, setModalSeed] = useState<Row>({});
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);

  const openCreate = () => {
    setPendingRemoveIndex(null);
    setModalMode('create');
    setModalIndex(null);
    setModalSeed(emptyStructuredListRow(listKind));
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    setPendingRemoveIndex(null);
    setModalMode('edit');
    setModalIndex(index);
    setModalSeed({ ...rows[index] });
    setModalOpen(true);
  };

  const bioForRow = (row: Row): StaffBioFormRow | null => {
    const id = str(row.bio_id);
    if (!id) return null;
    return sponsorStaffBios.find((b) => b.id === id) ?? null;
  };

  const executeRemoveRow = (index: number) => {
    if (!canRemoveRow) return;
    const row = rowsRef.current[index]!;
    const bid = str(row.bio_id);
    if (bid) {
      onSponsorStaffBiosChange(sponsorStaffBios.filter((b) => b.id !== bid));
    }
    const next = rowsRef.current.filter((_, i) => i !== index);
    setRows(next);
    onChange(question.key, next);
    setPendingRemoveIndex(null);
  };

  const requestRemoveRow = (index: number) => {
    if (!canRemoveRow) return;
    const row = rows[index]!;
    const vacant = listKind === 'investment_professionals' && normalizePositionStatus(row.position_status) === 'vacant';
    const bio = bioForRow(row);
    const bid = str(row.bio_id);
    const needsConfirm =
      !vacant && bid ? staffBioHasSubstantiveContent(bio, documents, bid) : false;

    if (!needsConfirm) {
      executeRemoveRow(index);
      return;
    }
    setPendingRemoveIndex(index);
  };

  const listName = (row: Row) => {
    if (listKind === 'investment_professionals' && normalizePositionStatus(row.position_status) === 'vacant') {
      return (
        <span className="italic text-gray-500">
          <span className="mr-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium not-italic text-gray-500">VACANT</span>
          {str(row.title).trim() || 'Position'}
        </span>
      );
    }
    const n = str(row.full_name).trim();
    return <span className="font-medium text-navy">{n || 'Untitled'}</span>;
  };

  const positionCol = (row: Row) => {
    if (listKind === 'investment_professionals') {
      return <span className="text-gray-500">{str(row.title).trim() || '—'}</span>;
    }
    return <span className="text-gray-500">{str(row.position).trim() || '—'}</span>;
  };

  const emptyInvestmentCopy = {
    title: 'No investment professionals added',
    subtitle: "Add the fund's investment team and vacant positions to be filled",
    cta: '+ Add Professional',
  };

  const emptySupportCopy = {
    title: 'No support staff added',
    subtitle: 'Add legal, accounting, IT and admin staff for the fund',
    cta: '+ Add Support Staff',
  };

  const emptyCopy = listKind === 'investment_professionals' ? emptyInvestmentCopy : emptySupportCopy;

  const pendingRemoveRow = pendingRemoveIndex !== null ? rows[pendingRemoveIndex] : null;
  const removeConfirmMessage =
    pendingRemoveRow != null
      ? `Remove ${removeDisplayName(listKind, pendingRemoveRow)}${str(pendingRemoveRow.bio_id) ? ' and their bio' : ''}? This cannot be undone.`
      : '';

  return (
    <FieldGroup title={question.label}>
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-10 px-4 text-center">
          <Users className="h-10 w-10 text-gray-300" aria-hidden />
          <p className="mt-3 text-center text-sm font-medium text-gray-500">{emptyCopy.title}</p>
          <p className="mt-1 max-w-xs text-center text-xs text-gray-400">{emptyCopy.subtitle}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {addRowButtonCaption(emptyCopy.cta)}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white">
            {rows.map((row, index) => {
              const vacant = listKind === 'investment_professionals' && normalizePositionStatus(row.position_status) === 'vacant';
              const bio = bioForRow(row);
              const pct = bioCompletionPct(bio);
              const bioBadge = bioCompletionLabel(pct, vacant ? 'vacant' : 'employee');
              const pill = positionPill(listKind, row);
              return (
                <div
                  key={String(row.id)}
                  className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        vacant ? 'bg-gray-200 text-gray-500' : 'bg-navy text-white',
                      )}
                    >
                      {vacant ? '?' : initials(str(row.full_name))}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-xs text-gray-400">{index + 1}</span>
                        {listName(row)}
                        <span className="hidden text-gray-300 sm:inline">|</span>
                        {positionCol(row)}
                        {listKind === 'investment_professionals' && !vacant ? (
                          <span className="text-sm text-gray-500">{pctDisplay(row)}</span>
                        ) : listKind === 'support_staff' ? (
                          <span className="text-sm text-gray-500">{pctDisplay(row)}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {pill}
                        </span>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', bioBadge.className)}>
                          {vacant ? 'No bio needed' : bioBadge.text}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => openEdit(index)}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-navy transition-colors hover:border-navy/40 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    {showRemoveButton ? (
                      <button
                        type="button"
                        disabled={disabled || !canRemoveRow}
                        aria-label="Remove row"
                        title={!canRemoveRow ? 'At least one row is required for this list' : undefined}
                        onClick={() => requestRemoveRow(index)}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-md text-red-400 transition-colors hover:bg-red-50 hover:text-red-600',
                          !canRemoveRow && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-red-400',
                        )}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={openCreate}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-400 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {addRowButtonCaption(question.addLabel)}
          </button>
          {question.footnote ? (
            <p className="mt-2 text-center text-xs italic text-gray-400 sm:text-left">{question.footnote}</p>
          ) : null}
        </>
      )}

      <ConfirmModal
        isOpen={pendingRemoveIndex !== null}
        title="Remove team member?"
        message={removeConfirmMessage}
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingRemoveIndex !== null) executeRemoveRow(pendingRemoveIndex);
        }}
        onCancel={() => setPendingRemoveIndex(null)}
      />

      <ProfessionalModal
        open={modalOpen}
        onClose={(discarded) => {
          setModalOpen(false);
          if (!discarded) void onAfterPersist?.();
        }}
        type={modalType}
        mode={modalMode}
        questionnaireId={questionnaireId}
        sectionKey={sectionKey}
        documents={documents}
        disabled={disabled}
        allListRows={rows}
        listQuestionKey={question.key}
        editIndex={modalIndex}
        initialRow={modalSeed}
        sponsorStaffBios={sponsorStaffBios}
        onSponsorStaffBiosChange={onSponsorStaffBiosChange}
        onListRowsChange={onChange}
        onDocumentsChanged={onDocumentsChanged}
        putSponsor={putSponsor}
        answersSnapshot={answersSnapshot}
      />
    </FieldGroup>
  );
}
