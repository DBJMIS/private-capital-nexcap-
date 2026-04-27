'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserCheck, UserMinus, UserX, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Input } from '@/components/ui/input';
import { StaffBioDetailFields } from '@/components/questionnaire/StaffBioDetailFields';
import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import { cn } from '@/lib/utils';
import { bioCompletionDots, bioCompletionPct } from '@/lib/questionnaire/bio-completion';
import { newEmptyStaffBioForm, staffBioFormRowToInput } from '@/lib/questionnaire/staff-bio-input';
import type { StaffBioInput } from '@/lib/questionnaire/validate';
import { extractStructuredListsPayload, filterPersistableAnswers } from '@/lib/questionnaire/section-persist-split';

type Row = Record<string, unknown>;
type PositionStatus = 'full_time' | 'part_time' | 'vacant';

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function normalizePositionStatus(v: unknown): PositionStatus {
  const s = str(v).trim();
  if (s === 'part_time' || s === 'vacant' || s === 'full_time') return s;
  return 'full_time';
}

function cloneRow(r: Row): Row {
  return { ...r };
}

function cloneBio(b: StaffBioFormRow): StaffBioFormRow {
  return {
    ...b,
    education: (b.education ?? []).map((e) => ({ ...e })),
  };
}

function isEmptyInvestmentPlaceholder(r: Row): boolean {
  return (
    !str(r.full_name).trim() &&
    !str(r.title).trim() &&
    normalizePositionStatus(r.position_status) === 'full_time' &&
    !str(r.bio_id).trim()
  );
}

function isEmptySupportPlaceholder(r: Row): boolean {
  return !str(r.full_name).trim() && !str(r.position).trim() && !str(r.department).trim();
}

function provisionalListRows(
  mode: 'create' | 'edit',
  allListRows: Row[],
  editIndex: number | null,
  provisionalRow: Row,
  listType: ProfessionalModalType,
): Row[] {
  if (mode === 'create') {
    if (allListRows.length === 0) return [provisionalRow];
    if (
      allListRows.length === 1 &&
      (listType === 'professional'
        ? isEmptyInvestmentPlaceholder(allListRows[0]!)
        : isEmptySupportPlaceholder(allListRows[0]!))
    ) {
      return [provisionalRow];
    }
    return [...allListRows, provisionalRow];
  }
  return allListRows.map((r, i) => (i === (editIndex as number) ? provisionalRow : r));
}

export type ProfessionalModalType = 'professional' | 'support_staff';

export type ProfessionalModalProps = {
  open: boolean;
  /** `discard` true if user cancelled or discarded changes. */
  onClose: (discard: boolean) => void;
  type: ProfessionalModalType;
  mode: 'create' | 'edit';
  questionnaireId: string;
  sectionKey: string;
  documents: DdDocumentRow[];
  disabled?: boolean;
  allListRows: Row[];
  listQuestionKey: string;
  editIndex: number | null;
  initialRow: Row;
  sponsorStaffBios: StaffBioFormRow[];
  onSponsorStaffBiosChange: (next: StaffBioFormRow[]) => void;
  onListRowsChange: (key: string, rows: Row[]) => void;
  onDocumentsChanged?: () => void;
  putSponsor: (body: {
    answers: Record<string, unknown>;
    structured_lists: Record<string, unknown>;
    staff_bios_upserts: StaffBioInput[];
  }) => Promise<{ staff_bio_upsert_ids?: string[]; ok?: boolean }>;
  answersSnapshot: Record<string, unknown>;
};

function buildUpsertsFromBios(
  sponsorStaffBios: StaffBioFormRow[],
  workingBio: StaffBioFormRow,
  workingBioId: string,
): StaffBioInput[] {
  const others = sponsorStaffBios.filter((b) => b.id && b.id !== workingBioId);
  const merged = [...others, { ...workingBio, id: workingBioId }].map(staffBioFormRowToInput);
  return merged;
}

export function ProfessionalModal({
  open,
  onClose,
  type,
  mode,
  questionnaireId,
  sectionKey,
  documents,
  disabled,
  allListRows,
  listQuestionKey,
  editIndex,
  initialRow,
  sponsorStaffBios,
  onSponsorStaffBiosChange,
  onListRowsChange,
  onDocumentsChanged,
  putSponsor,
  answersSnapshot,
}: ProfessionalModalProps) {
  const [tab, setTab] = useState<'details' | 'bio'>('details');
  const [detail, setDetail] = useState<Row>(() => cloneRow(initialRow));
  const [bio, setBio] = useState<StaffBioFormRow>(() => newEmptyStaffBioForm());
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const isVacant = type === 'professional' && normalizePositionStatus(detail.position_status) === 'vacant';
  const showBioTab = type === 'professional' ? !isVacant : true;

  useEffect(() => {
    if (!open) return;
    setTab('details');
    const dr = cloneRow(initialRow);
    setDetail(dr);
    const bid = str(dr.bio_id);
    if (bid) {
      const found = sponsorStaffBios.find((b) => b.id === bid);
      setBio(found ? cloneBio(found) : newEmptyStaffBioForm({ full_name: str(dr.full_name) }));
    } else if (type === 'professional' && normalizePositionStatus(dr.position_status) !== 'vacant') {
      setBio(newEmptyStaffBioForm({ full_name: str(dr.full_name) }));
    } else {
      setBio(newEmptyStaffBioForm());
    }
  }, [open, initialRow, type, sponsorStaffBios]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const isDirty = useMemo(() => {
    const bid = str(detail.bio_id);
    const baseBio = bid ? sponsorStaffBios.find((b) => b.id === bid) : null;
    const baseD = cloneRow(initialRow);
    const cmpBio = baseBio ? cloneBio(baseBio) : newEmptyStaffBioForm();
    return JSON.stringify({ d: detail, b: bio }) !== JSON.stringify({ d: baseD, b: cmpBio });
  }, [detail, bio, initialRow, sponsorStaffBios]);

  const handleCloseAttempt = () => {
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose(true);
  };

  const handleSave = async () => {
    if (disabled) return;
    let workingDetail = { ...detail };
    let workingBio = { ...bio, full_name: str(detail.full_name).trim() || bio.full_name.trim() };

    if (type === 'professional') {
      const ps = normalizePositionStatus(workingDetail.position_status);
      if (ps !== 'vacant' && !str(workingDetail.full_name).trim()) {
        window.alert('Full name is required.');
        return;
      }
      if (ps !== 'vacant' && !str(workingDetail.title).trim()) {
        window.alert('Title / position is required.');
        return;
      }
      if (ps === 'vacant' && !str(workingDetail.title).trim()) {
        window.alert('Position title is required.');
        return;
      }
      if (ps === 'vacant') {
        const ht = str(workingDetail.hire_timeline).trim();
        if (!['immediate', 'within_6_months', 'within_1_year'].includes(ht)) {
          window.alert('Select intended hire timeline.');
          return;
        }
      } else {
        const pct = str(workingDetail.time_dedication_pct).trim();
        if (!pct || Number.isNaN(Number(pct)) || Number(pct) < 0 || Number(pct) > 100) {
          window.alert('Enter % time dedicated (0–100).');
          return;
        }
      }

      const needsBio = ps !== 'vacant' && !str(workingDetail.bio_id);
      if (needsBio) {
        const provisionalRow = { ...workingDetail, bio_id: null };
        const provisionalRows = provisionalListRows(mode, allListRows, editIndex, provisionalRow, 'professional');
        const minimal = staffBioFormRowToInput(
          newEmptyStaffBioForm({
            full_name: str(workingDetail.full_name),
            education: [{ year: '', institution: '', degree: '' }],
          }),
        );
        const nextAnswers1 = { ...answersSnapshot, [listQuestionKey]: provisionalRows };
        const j = await putSponsor({
          answers: filterPersistableAnswers('sponsor', nextAnswers1),
          structured_lists: extractStructuredListsPayload('sponsor', nextAnswers1) ?? {},
          staff_bios_upserts: [minimal],
        });
        const newId = j.staff_bio_upsert_ids?.[0];
        if (!newId) {
          window.alert('Could not create bio record. Try again.');
          return;
        }
        workingDetail = { ...workingDetail, bio_id: newId };
        workingBio = { ...workingBio, id: newId, full_name: str(workingDetail.full_name) };
      }
    } else {
      if (!str(workingDetail.full_name).trim()) {
        window.alert('Name is required.');
        return;
      }
      const dept = str(workingDetail.department).trim();
      if (!['legal', 'accounting', 'it', 'admin', 'other'].includes(dept)) {
        window.alert('Select a department.');
        return;
      }
      if (!str(workingDetail.bio_id)) {
        const provisionalRow = { ...workingDetail, bio_id: null };
        const provisionalRows = provisionalListRows(mode, allListRows, editIndex, provisionalRow, 'support_staff');
        const minimal = staffBioFormRowToInput(
          newEmptyStaffBioForm({
            full_name: str(workingDetail.full_name),
            education: [{ year: '', institution: '', degree: '' }],
          }),
        );
        const nextAnswers1 = { ...answersSnapshot, [listQuestionKey]: provisionalRows };
        const j = await putSponsor({
          answers: filterPersistableAnswers('sponsor', nextAnswers1),
          structured_lists: extractStructuredListsPayload('sponsor', nextAnswers1) ?? {},
          staff_bios_upserts: [minimal],
        });
        const newId = j.staff_bio_upsert_ids?.[0];
        if (!newId) {
          window.alert('Could not create bio record.');
          return;
        }
        workingDetail = { ...workingDetail, bio_id: newId };
        workingBio = { ...workingBio, id: newId, full_name: str(workingDetail.full_name) };
      }
    }

    const vacant = type === 'professional' && normalizePositionStatus(workingDetail.position_status) === 'vacant';
    const fixedFinalRows = provisionalListRows(mode, allListRows, editIndex, workingDetail, type);

    const nextAnswers = { ...answersSnapshot, [listQuestionKey]: fixedFinalRows };

    const upserts: StaffBioInput[] = vacant
      ? sponsorStaffBios.map(staffBioFormRowToInput)
      : buildUpsertsFromBios(sponsorStaffBios, workingBio, str(workingDetail.bio_id));

    await putSponsor({
      answers: filterPersistableAnswers('sponsor', nextAnswers),
      structured_lists: extractStructuredListsPayload('sponsor', nextAnswers) ?? {},
      staff_bios_upserts: upserts,
    });

    onListRowsChange(listQuestionKey, fixedFinalRows);
    if (!vacant && str(workingDetail.bio_id)) {
      const id = str(workingDetail.bio_id);
      const nextSnap = sponsorStaffBios.filter((b) => b.id !== id).concat({ ...workingBio, id });
      onSponsorStaffBiosChange(nextSnap);
    }

    onClose(false);
  };

  const setStatus = (next: PositionStatus) => {
    if (type !== 'professional') return;
    if (next === 'vacant') {
      setDetail((d) => ({
        ...d,
        position_status: next,
        time_dedication_pct: '',
        bio_id: null,
        hire_timeline: d.hire_timeline ?? '',
      }));
      setBio(newEmptyStaffBioForm());
    } else {
      setDetail((d) => ({ ...d, position_status: next, hire_timeline: '' }));
    }
  };

  const modalTitle = type === 'professional' ? 'Investment Professional' : 'Support Staff';
  const subtitle =
    mode === 'create'
      ? 'Adding new member'
      : type === 'professional'
        ? str(detail.full_name) || str(detail.title) || 'Edit'
        : str(detail.full_name) || 'Edit';

  const bioPct = bioCompletionPct(str(detail.bio_id) ? bio : null);
  const dots = bioCompletionDots(str(detail.bio_id) ? bio : null);

  if (!open) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="personnel-modal-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 id="personnel-modal-title" className="text-lg font-bold text-navy">
              {modalTitle}
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

        {showBioTab ? (
          <div className="flex shrink-0 gap-6 border-b border-gray-200 px-6">
            <button
              type="button"
              onClick={() => setTab('details')}
              className={cn(
                '-mb-px border-b-2 pb-3 text-sm font-medium transition-colors',
                tab === 'details' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-400 hover:text-gray-600',
              )}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab('bio')}
              className={cn(
                '-mb-px border-b-2 pb-3 text-sm font-medium transition-colors',
                tab === 'bio' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-400 hover:text-gray-600',
              )}
            >
              Bio
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {tab === 'details' ? (
            <div className="space-y-5">
              {type === 'professional' ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-navy">
                        Full name {!isVacant ? <span className="text-gold">*</span> : null}
                      </label>
                      <Input
                        disabled={disabled || isVacant}
                        value={str(detail.full_name)}
                        onChange={(e) => setDetail((d) => ({ ...d, full_name: e.target.value }))}
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-navy">
                        Title / position <span className="text-gold">*</span>
                      </label>
                      <Input
                        disabled={disabled}
                        value={str(detail.title)}
                        onChange={(e) => setDetail((d) => ({ ...d, title: e.target.value }))}
                        placeholder="Title / position"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-navy">
                      Position Status <span className="text-gold">*</span>
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(
                        [
                          ['full_time', UserCheck, 'Full-time', 'Employee'],
                          ['part_time', UserMinus, 'Part-time', 'Employee'],
                          ['vacant', UserX, 'Vacant', 'Position'],
                        ] as const
                      ).map(([val, Icon, l1, l2]) => {
                        const selected = normalizePositionStatus(detail.position_status) === val;
                        const base =
                          'flex w-full cursor-pointer flex-col items-center rounded-xl border-2 p-3 text-center transition-colors';
                        const idle = 'border-gray-200 bg-white text-gray-500';
                        let sel = '';
                        if (selected && val === 'full_time') sel = 'border-[#0B1F45] bg-[#0B1F45]/5 text-[#0B1F45]';
                        if (selected && val === 'part_time') sel = 'border-[#C8973A] bg-[#C8973A]/5 text-[#C8973A]';
                        if (selected && val === 'vacant') sel = 'border-gray-400 bg-gray-50 text-gray-600';
                        return (
                          <button
                            key={val}
                            type="button"
                            disabled={disabled}
                            onClick={() => setStatus(val)}
                            className={cn(base, selected ? sel : idle, disabled && 'opacity-50')}
                          >
                            <Icon className="h-5 w-5" />
                            <div className="mt-1 text-xs font-medium leading-tight">
                              <div>{l1}</div>
                              <div>{l2}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!isVacant ? (
                    <div className="max-w-xs">
                      <label className="mb-1 block text-xs font-medium text-navy">% Time dedicated *</label>
                      <Input
                        disabled={disabled}
                        inputMode="decimal"
                        value={
                          detail.time_dedication_pct === undefined || detail.time_dedication_pct === null
                            ? ''
                            : String(detail.time_dedication_pct)
                        }
                        onChange={(e) => setDetail((d) => ({ ...d, time_dedication_pct: e.target.value }))}
                        placeholder="%"
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="mb-2 text-xs font-medium text-navy">Intended hire timeline *</p>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ['immediate', 'Immediate'],
                            ['within_6_months', 'Within 6 months'],
                            ['within_1_year', 'Within 1 year'],
                          ] as const
                        ).map(([val, label]) => {
                          const selected = str(detail.hire_timeline) === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              disabled={disabled}
                              onClick={() => setDetail((d) => ({ ...d, hire_timeline: val }))}
                              className={cn(
                                'rounded-lg border px-4 py-2 text-xs font-medium transition-colors',
                                selected
                                  ? 'border-[#0B1F45] bg-[#0B1F45]/5 text-[#0B1F45]'
                                  : 'border border-gray-300 bg-white text-gray-600',
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-navy">
                        Full name <span className="text-gold">*</span>
                      </label>
                      <Input
                        disabled={disabled}
                        value={str(detail.full_name)}
                        onChange={(e) => setDetail((d) => ({ ...d, full_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-navy">Position</label>
                      <Input
                        disabled={disabled}
                        value={str(detail.position)}
                        onChange={(e) => setDetail((d) => ({ ...d, position: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="max-w-xs">
                    <label className="mb-1 block text-xs font-medium text-navy">% Time dedicated</label>
                    <Input
                      disabled={disabled}
                      inputMode="decimal"
                      value={
                        detail.time_dedication_pct === undefined || detail.time_dedication_pct === null
                          ? ''
                          : String(detail.time_dedication_pct)
                      }
                      onChange={(e) => setDetail((d) => ({ ...d, time_dedication_pct: e.target.value }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-navy">
                      Department <span className="text-gold">*</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['legal', 'Legal'],
                          ['accounting', 'Accounting'],
                          ['it', 'IT'],
                          ['admin', 'Admin'],
                          ['other', 'Other'],
                        ] as const
                      ).map(([val, label]) => {
                        const selected = str(detail.department) === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            disabled={disabled}
                            onClick={() => setDetail((d) => ({ ...d, department: val }))}
                            className={cn(
                              'rounded-lg border px-4 py-2 text-xs font-medium transition-colors',
                              selected
                                ? 'border-[#0B1F45] bg-[#0B1F45]/5 text-[#0B1F45]'
                                : 'border border-gray-300 bg-white text-gray-600',
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <StaffBioDetailFields
              bio={bio}
              onChange={(patch) => setBio((b) => ({ ...b, ...patch }))}
              disabled={disabled}
              questionnaireId={questionnaireId}
              sectionKey={sectionKey}
              documents={documents}
              onListChanged={onDocumentsChanged}
            />
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
          <div className="min-h-[1.25rem] text-xs text-gray-500">
            {tab === 'bio' && showBioTab ? (
              <span>
                {bioPct}% complete · {dots.filter(Boolean).length}/5 sections
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleCloseAttempt}>
              Cancel
            </Button>
            <Button type="button" className="bg-navy text-white hover:bg-navy/90" disabled={disabled} onClick={() => void handleSave()}>
              Save
            </Button>
          </div>
        </footer>
      </div>
    </div>

    <ConfirmModal
      isOpen={discardConfirmOpen}
      title="Discard unsaved changes?"
      message="You have unsaved edits to this person. If you leave now, those changes will be lost."
      confirmLabel="Discard"
      confirmVariant="warning"
      cancelLabel="Keep editing"
      onConfirm={() => {
        setDiscardConfirmOpen(false);
        onClose(true);
      }}
      onCancel={() => setDiscardConfirmOpen(false)}
    />
    </>
  );
}
