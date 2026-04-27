'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Landmark, Plus, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldGroup } from '@/components/ui/FieldGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InvestmentSectorCombobox } from '@/components/questionnaire/InvestmentSectorCombobox';
import { CountryNameSingleSelect } from '@/components/questionnaire/CountryNameSingleSelect';
import type { StructuredListQuestion } from '@/lib/questionnaire/types';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import type { StructuredListKind } from '@/lib/questionnaire/structured-list-registry';
import { emptyStructuredListRow, ensureMinStructuredRows } from '@/lib/questionnaire/structured-list-defaults';
import { PersonnelStructuredList } from '@/components/questionnaire/PersonnelStructuredList';
import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import type { ProfessionalModalProps } from '@/components/questionnaire/ProfessionalModal';
import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';

type Row = Record<string, unknown>;

function addRowButtonCaption(text: string): string {
  return text.replace(/^\s*\+\s*/, '').trim();
}

function RowIndexCircle({ index }: { index: number }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 text-xs text-gray-400"
      aria-hidden
    >
      {index + 1}
    </span>
  );
}

function RemoveRowButton({
  disabled,
  onClick,
  'aria-label': ariaLabel,
}: {
  disabled?: boolean;
  onClick: () => void;
  'aria-label': string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export type SponsorPersonnelBundle = {
  questionnaireId: string;
  sectionKey: string;
  documents: DdDocumentRow[];
  sponsorStaffBios: StaffBioFormRow[];
  onSponsorStaffBiosChange: (next: StaffBioFormRow[]) => void;
  answersSnapshot: Record<string, unknown>;
  putSponsor: ProfessionalModalProps['putSponsor'];
  onDocumentsChanged?: () => void;
  onAfterPersist?: () => Promise<void>;
};

export type StructuredListFieldProps = {
  question: StructuredListQuestion;
  value: unknown;
  onChange: (key: string, next: Row[]) => void;
  disabled?: boolean;
  /** Sponsor: modal + bios for investment professionals & support staff. */
  sponsorPersonnel?: SponsorPersonnelBundle;
  /** Incremented after successful section reload so rows re-sync from server. */
  listHydrationEpoch?: number;
};

function sumMaxPct(rs: Row[]): number {
  let t = 0;
  for (const r of rs) {
    const raw = r.max_pct;
    if (raw === null || raw === undefined || raw === '') continue;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
    if (Number.isFinite(n)) t += n;
  }
  return Math.round(t * 100) / 100;
}

function AllocationTotalLine({ label, total }: { label: string; total: number }) {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
  const display = Number.isInteger(total) ? String(total) : total.toFixed(2);
  if (near(total, 100)) {
    return (
      <div className="mt-2 flex justify-end text-xs font-medium text-[#0F8A6E]">
        ✓ {label}: {display}%
      </div>
    );
  }
  if (total < 100 - 0.02) {
    return (
      <div className="mt-2 flex justify-end text-xs text-amber-600">
        {label}: {display}% — must reach 100%
      </div>
    );
  }
  return (
    <div className="mt-2 flex justify-end text-xs text-red-600">
      {label}: {display}% — exceeds 100%
    </div>
  );
}

export function StructuredListField({
  question,
  value,
  onChange,
  disabled,
  sponsorPersonnel,
  listHydrationEpoch = 0,
}: StructuredListFieldProps) {
  const listKind = question.listKind as StructuredListKind;
  const meta = STRUCTURED_LIST_REGISTRY[listKind];
  const minRows = meta.minRows;

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

  const patchRow = (index: number, patch: Row) => {
    const next = rowsRef.current.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRows(next);
    onChange(question.key, next);
  };

  const addRow = () => {
    const next = [...rowsRef.current, emptyStructuredListRow(listKind)];
    setRows(next);
    onChange(question.key, next);
  };

  const removeRow = (index: number) => {
    if (rowsRef.current.length <= minRows) return;
    const next = rowsRef.current.filter((_, i) => i !== index);
    setRows(next);
    onChange(question.key, next);
  };

  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= rowsRef.current.length) return;
    const next = [...rowsRef.current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setRows(next);
    onChange(question.key, next);
  };

  const showRemove = rows.length > minRows;

  const renderShareholder = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Name"
        value={String(row.full_name ?? '')}
        onChange={(e) => patchRow(index, { full_name: e.target.value })}
      />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Occupation"
        value={String(row.occupation ?? '')}
        onChange={(e) => patchRow(index, { occupation: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove shareholder" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  if (
    sponsorPersonnel &&
    (listKind === 'investment_professionals' || listKind === 'support_staff')
  ) {
    return (
      <PersonnelStructuredList
        question={question}
        value={value}
        onChange={onChange}
        disabled={disabled}
        questionnaireId={sponsorPersonnel.questionnaireId}
        sectionKey={sponsorPersonnel.sectionKey}
        documents={sponsorPersonnel.documents}
        sponsorStaffBios={sponsorPersonnel.sponsorStaffBios}
        onSponsorStaffBiosChange={sponsorPersonnel.onSponsorStaffBiosChange}
        answersSnapshot={sponsorPersonnel.answersSnapshot}
        putSponsor={sponsorPersonnel.putSponsor}
        onDocumentsChanged={sponsorPersonnel.onDocumentsChanged}
        onAfterPersist={sponsorPersonnel.onAfterPersist}
        listHydrationEpoch={listHydrationEpoch}
      />
    );
  }

  const renderAdvisor = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Name"
        value={String(row.full_name ?? '')}
        onChange={(e) => patchRow(index, { full_name: e.target.value })}
      />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Role"
        value={String(row.role ?? '')}
        onChange={(e) => patchRow(index, { role: e.target.value })}
      />
      <div className="flex w-44 shrink-0 items-end gap-1">
        <span className="mb-2 text-[13px] font-medium text-[#6b7280]" aria-hidden>
          $
        </span>
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Remuneration</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            placeholder="0.00"
            value={row.remuneration === null || row.remuneration === undefined ? '' : String(row.remuneration)}
            onChange={(e) => patchRow(index, { remuneration: e.target.value === '' ? '' : e.target.value })}
            className="border border-gray-300 text-sm"
          />
        </div>
      </div>
      <div className="w-40 shrink-0">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Paid by</span>
        <Select
          value={String(row.paid_by ?? '').trim() || 'none'}
          onValueChange={(v) => patchRow(index, { paid_by: v === 'none' ? '' : v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-10 border border-gray-300 text-sm">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="The Fund">The Fund</SelectItem>
            <SelectItem value="The Manager">The Manager</SelectItem>
            <SelectItem value="Both">Both</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove advisor" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderOffice = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <div className="min-w-[200px] flex-1">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Address</span>
        <Textarea
          rows={2}
          disabled={disabled}
          placeholder="Address"
          value={String(row.address ?? '')}
          onChange={(e) => patchRow(index, { address: e.target.value })}
          className="min-h-[60px] resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-[#0B1F45]/20"
        />
      </div>
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Activities"
        value={String(row.activities ?? '')}
        onChange={(e) => patchRow(index, { activities: e.target.value })}
      />
      <Input
        className="w-24 shrink-0"
        type="number"
        min={0}
        disabled={disabled}
        placeholder="Staff #"
        value={row.staff_count === null || row.staff_count === undefined ? '' : String(row.staff_count)}
        onChange={(e) => patchRow(index, { staff_count: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove office" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderInvestmentRound = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <div className="min-w-[140px] flex-1">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Round</span>
        <Input
          disabled={disabled}
          placeholder="Name"
          value={String(row.round_name ?? '')}
          onChange={(e) => patchRow(index, { round_name: e.target.value })}
        />
      </div>
      <div className="w-36 shrink-0">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Min USD</span>
        <Input
          disabled={disabled}
          inputMode="decimal"
          value={row.min_usd === null || row.min_usd === undefined ? '' : String(row.min_usd)}
          onChange={(e) => patchRow(index, { min_usd: e.target.value })}
        />
      </div>
      <div className="w-36 shrink-0">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Max USD</span>
        <Input
          disabled={disabled}
          inputMode="decimal"
          value={row.max_usd === null || row.max_usd === undefined ? '' : String(row.max_usd)}
          onChange={(e) => patchRow(index, { max_usd: e.target.value })}
        />
      </div>
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove round" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderSectorAllocation = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <InvestmentSectorCombobox
        id={`${question.key}-sector-${index}`}
        value={String(row.sector_name ?? '')}
        onChange={(v) => patchRow(index, { sector_name: v })}
        disabled={disabled}
      />
      <Input
        className="w-28 shrink-0"
        disabled={disabled}
        placeholder="Max %"
        inputMode="decimal"
        value={row.max_pct === null || row.max_pct === undefined ? '' : String(row.max_pct)}
        onChange={(e) => patchRow(index, { max_pct: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove sector" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderGeographicAllocation = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <div className="min-w-[200px] flex-1">
        <CountryNameSingleSelect
          id={`${question.key}-geo-${index}`}
          label="Region / country"
          value={String(row.region_country ?? '')}
          onChange={(name) => patchRow(index, { region_country: name })}
          disabled={disabled}
          fieldLabelStyle="compact"
        />
      </div>
      <Input
        className="w-28 shrink-0"
        disabled={disabled}
        placeholder="Max %"
        inputMode="decimal"
        value={row.max_pct === null || row.max_pct === undefined ? '' : String(row.max_pct)}
        onChange={(e) => patchRow(index, { max_pct: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove geography" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderInvestmentInstrument = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex shrink-0 items-center gap-1 self-start sm:flex-col sm:items-center sm:pt-1">
        <button
          type="button"
          disabled={disabled || index === 0}
          aria-label="Move up"
          onClick={() => moveRow(index, index - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled || index === rows.length - 1}
          aria-label="Move down"
          onClick={() => moveRow(index, index + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <RowIndexCircle index={index} />
      <div className="min-w-0 flex-1 space-y-2">
        <Input
          disabled={disabled}
          placeholder="Instrument"
          value={String(row.instrument_name ?? '')}
          onChange={(e) => patchRow(index, { instrument_name: e.target.value })}
        />
        <Textarea
          disabled={disabled}
          placeholder="Legal notes"
          value={String(row.legal_notes ?? '')}
          onChange={(e) => patchRow(index, { legal_notes: e.target.value })}
          rows={2}
          className="min-h-[60px] resize-y"
        />
      </div>
      <div className="flex w-full shrink-0 items-center gap-2 sm:w-32 sm:flex-col sm:items-stretch">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:mb-1">Fund %</span>
        <Input
          disabled={disabled}
          inputMode="decimal"
          placeholder="%"
          value={row.fund_pct === null || row.fund_pct === undefined ? '' : String(row.fund_pct)}
          onChange={(e) => patchRow(index, { fund_pct: e.target.value })}
        />
      </div>
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove instrument" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0 self-center sm:self-start" aria-hidden />
      )}
    </div>
  );

  const renderSecuredInvestor = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Investor name"
        value={String(row.investor_name ?? '')}
        onChange={(e) => patchRow(index, { investor_name: e.target.value })}
      />
      <div className="flex w-40 shrink-0 items-center gap-1">
        <span className="text-[13px] text-[#6b7280]" aria-hidden>
          $
        </span>
        <Input
          className="min-w-0 flex-1"
          disabled={disabled}
          inputMode="decimal"
          placeholder="Amount USD"
          value={row.amount_usd === null || row.amount_usd === undefined ? '' : String(row.amount_usd)}
          onChange={(e) => patchRow(index, { amount_usd: e.target.value })}
        />
      </div>
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Description"
        value={String(row.description ?? '')}
        onChange={(e) => patchRow(index, { description: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove investor" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderPotentialInvestor = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Investor name"
        value={String(row.investor_name ?? '')}
        onChange={(e) => patchRow(index, { investor_name: e.target.value })}
      />
      <div className="flex w-40 shrink-0 items-center gap-1">
        <span className="text-[13px] text-[#6b7280]" aria-hidden>
          $
        </span>
        <Input
          className="min-w-0 flex-1"
          disabled={disabled}
          inputMode="decimal"
          placeholder="Expected amount"
          value={
            row.expected_amount_usd === null || row.expected_amount_usd === undefined
              ? ''
              : String(row.expected_amount_usd)
          }
          onChange={(e) => patchRow(index, { expected_amount_usd: e.target.value })}
        />
      </div>
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Timeline"
        value={String(row.timeline ?? '')}
        onChange={(e) => patchRow(index, { timeline: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove investor" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderCoinvestor = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <Input
        className="min-w-[140px] flex-1"
        disabled={disabled}
        placeholder="Company"
        value={String(row.company_name ?? '')}
        onChange={(e) => patchRow(index, { company_name: e.target.value })}
      />
      <Input
        className="min-w-[120px] flex-1"
        disabled={disabled}
        placeholder="Contact"
        value={String(row.contact_name ?? '')}
        onChange={(e) => patchRow(index, { contact_name: e.target.value })}
      />
      <Input
        className="w-36 shrink-0"
        disabled={disabled}
        placeholder="Phone"
        value={String(row.phone ?? '')}
        onChange={(e) => patchRow(index, { phone: e.target.value })}
      />
      <Input
        className="min-w-[160px] flex-1"
        disabled={disabled}
        placeholder="Email"
        type="email"
        value={String(row.email ?? '')}
        onChange={(e) => patchRow(index, { email: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove co-investor" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderOutsourced = (row: Row, index: number) => (
    <div key={String(row.id)} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <RowIndexCircle index={index} />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Company / name"
        value={String(row.company_name ?? '')}
        onChange={(e) => patchRow(index, { company_name: e.target.value })}
      />
      <Input
        className="min-w-0 flex-1"
        disabled={disabled}
        placeholder="Activities"
        value={String(row.activities ?? '')}
        onChange={(e) => patchRow(index, { activities: e.target.value })}
      />
      <Input
        className="w-36 shrink-0"
        disabled={disabled}
        placeholder="Annual cost USD"
        inputMode="decimal"
        value={row.annual_cost_usd === null || row.annual_cost_usd === undefined ? '' : String(row.annual_cost_usd)}
        onChange={(e) => patchRow(index, { annual_cost_usd: e.target.value })}
      />
      <Input
        className="w-32 shrink-0"
        disabled={disabled}
        placeholder="Paid by"
        value={String(row.paid_by ?? '')}
        onChange={(e) => patchRow(index, { paid_by: e.target.value })}
      />
      {showRemove ? (
        <RemoveRowButton disabled={disabled} aria-label="Remove outsourced service" onClick={() => removeRow(index)} />
      ) : (
        <span className="h-7 w-7 shrink-0" aria-hidden />
      )}
    </div>
  );

  const renderRow = (row: Row, index: number) => {
    switch (listKind) {
      case 'shareholders':
        return renderShareholder(row, index);
      case 'investment_professionals':
      case 'support_staff':
        return (
          <div key={String(row.id)} className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Personnel lists require sponsor section context. Reload the page or navigate back to Section II.
          </div>
        );
      case 'outside_advisors':
        return renderAdvisor(row, index);
      case 'office_locations':
        return renderOffice(row, index);
      case 'outsourced_services':
        return renderOutsourced(row, index);
      case 'investment_rounds':
        return renderInvestmentRound(row, index);
      case 'sector_allocations':
        return renderSectorAllocation(row, index);
      case 'geographic_allocations':
        return renderGeographicAllocation(row, index);
      case 'investment_instruments':
        return renderInvestmentInstrument(row, index);
      case 'coinvestors':
        return renderCoinvestor(row, index);
      case 'secured_investors':
        return renderSecuredInvestor(row, index);
      case 'potential_investors':
        return renderPotentialInvestor(row, index);
      default:
        return null;
    }
  };

  const emptyInvestorState =
    rows.length === 0 &&
    (listKind === 'secured_investors' || listKind === 'potential_investors') &&
    minRows === 0;

  return (
    <FieldGroup title={question.label}>
      {question.helper ? <p className="mb-3 text-[12px] leading-snug text-[#6b7280]">{question.helper}</p> : null}
      {emptyInvestorState ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
          <Landmark className="mb-3 h-10 w-10 text-gray-300" aria-hidden />
          <p className="text-sm font-medium text-gray-500">
            {listKind === 'secured_investors' ? 'No secured investors added' : 'No potential investors added'}
          </p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">
            {listKind === 'secured_investors'
              ? 'Add investors who have formally committed or confirmed investment'
              : 'Add investors you have approached or plan to approach'}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={addRow}
            className="mt-4 rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {listKind === 'secured_investors' ? '+ Add Secured Investor' : '+ Add Potential Investor'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => renderRow(row, index))}
          </div>
          {listKind === 'sector_allocations' ? (
            <AllocationTotalLine label="Sector total" total={sumMaxPct(rows)} />
          ) : null}
          {listKind === 'geographic_allocations' ? (
            <AllocationTotalLine label="Geographic total" total={sumMaxPct(rows)} />
          ) : null}
        </>
      )}
      {question.footnote ? (
        <p className="mt-2 text-xs italic text-gray-400">{question.footnote}</p>
      ) : null}
      {!emptyInvestorState ? (
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-400 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addRowButtonCaption(question.addLabel)}
        </button>
      ) : null}
    </FieldGroup>
  );
}
