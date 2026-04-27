'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type {
  LegalDocumentsListQuestion,
  PlainQuestion,
  PipelineCompaniesQuestion,
  QuestionDef,
  SelectOption,
  StructuredListQuestion,
} from '@/lib/questionnaire/types';
import { countWords } from '@/lib/questionnaire/word-count';
import { cn } from '@/lib/utils';
import { DocumentUpload, type DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import { ContactPersonsCard } from '@/components/questionnaire/ContactPersonsCard';
import { PipelineCompaniesField } from '@/components/questionnaire/PipelineCompaniesField';
import { LegalDocumentsTable } from '@/components/questionnaire/LegalDocumentsTable';
import { LegalDocumentsListField } from '@/components/questionnaire/LegalDocumentsListField';
import { StructuredListField, type SponsorPersonnelBundle } from '@/components/questionnaire/StructuredListField';
import { CountryMultiSelect } from '@/components/questionnaire/CountryMultiSelect';
import type { LegalDocRow } from '@/lib/questionnaire/validate';

export type QuestionFieldProps = {
  questionnaireId: string;
  sectionKey: string;
  question: QuestionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  documents: DdDocumentRow[];
  disabled?: boolean;
  onDocumentsChanged?: () => void;
  sponsorPersonnel?: SponsorPersonnelBundle;
  /** Bumps after section reload so structured lists re-hydrate from server answers. */
  listHydrationEpoch?: number;
  /** Full section answers (for conditional fields that depend on other keys). */
  answersContext?: Record<string, unknown>;
};

function docForTag(docs: DdDocumentRow[], tag: string): DdDocumentRow | null {
  return docs.find((d) => d.tag === tag) ?? null;
}

function FieldLabel({
  id,
  children,
  required,
  aside,
}: {
  id?: string;
  children: React.ReactNode;
  required?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-1 flex items-end justify-between gap-2">
      <label htmlFor={id} className="text-[13px] font-medium normal-case leading-snug text-navy">
        {children}
        {required && <span className="text-gold"> *</span>}
      </label>
      {aside}
    </div>
  );
}

function FieldHelper({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[12px] leading-snug text-[#6b7280]">{children}</p>;
}

function readPctField(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (v === null || v === undefined) return '';
  return String(v);
}

function StageAllocationField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: { key: string; label: string; required?: boolean; helper?: string };
  value: unknown;
  onChange: QuestionFieldProps['onChange'];
  disabled?: boolean;
}) {
  const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const ideas = readPctField(o, 'ideas_pct');
  const startups = readPctField(o, 'startups_pct');
  const scaling = readPctField(o, 'scaling_pct');
  const mature = readPctField(o, 'mature_pct');
  const patch = (patchIn: Record<string, unknown>) =>
    onChange(question.key, { ...o, ...patchIn });

  const n = (s: string) => {
    const x = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(x) ? x : 0;
  };
  const sum = n(ideas) + n(startups) + n(scaling) + n(mature);

  return (
    <div>
      <FieldLabel id={question.key} required={question.required}>
        {question.label}
      </FieldLabel>
      {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['ideas_pct', 'Ideas / prototype'],
            ['startups_pct', 'Startups'],
            ['scaling_pct', 'Scaling'],
            ['mature_pct', 'Mature'],
          ] as const
        ).map(([field, label]) => (
          <div key={field}>
            <label className="mb-1 block text-[12px] font-medium text-navy">{label}</label>
            <div className="flex items-center gap-1">
              <Input
                id={field === 'ideas_pct' ? question.key : undefined}
                type="number"
                inputMode="decimal"
                disabled={disabled}
                value={readPctField(o, field)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const x = parseFloat(raw.replace(/,/g, ''));
                  patch({ [field]: raw === '' ? '' : Number.isFinite(x) ? x : raw });
                }}
                className="font-mono tabular-nums"
              />
              <span className="text-[13px] text-[#6b7280]">%</span>
            </div>
          </div>
        ))}
      </div>
      <p className={`mt-2 text-[12px] ${Math.abs(sum - 100) < 0.02 ? 'text-[#6b7280]' : 'text-amber-700'}`}>
        Total: {sum.toFixed(2)}% {Math.abs(sum - 100) < 0.02 ? '' : '(must equal 100%)'}
      </p>
    </div>
  );
}

function CompanySizeParamsField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: { key: string; label: string; required?: boolean; helper?: string };
  value: unknown;
  onChange: QuestionFieldProps['onChange'];
  disabled?: boolean;
}) {
  const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const patch = (patchIn: Record<string, unknown>) =>
    onChange(question.key, { ...o, ...patchIn });

  const fields: { key: string; label: string }[] = [
    { key: 'revenue_min_usd', label: 'Min revenue (USD)' },
    { key: 'revenue_max_usd', label: 'Max revenue (USD)' },
    { key: 'investment_min_per_company_usd', label: 'Min investment / company (USD)' },
    { key: 'investment_max_per_company_usd', label: 'Max investment / company (USD)' },
  ];

  return (
    <div>
      <FieldLabel id={question.key} required={question.required}>
        {question.label}
      </FieldLabel>
      {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map(({ key: fk, label }, i) => (
          <div key={fk}>
            <label className="mb-1 block text-[12px] font-medium text-navy">{label}</label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[12px] font-medium text-[#6b7280]" aria-hidden>
                USD
              </span>
              <Input
                id={i === 0 ? question.key : undefined}
                type="number"
                inputMode="decimal"
                step="any"
                disabled={disabled}
                value={readPctField(o, fk)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const x = parseFloat(raw.replace(/,/g, ''));
                  patch({ [fk]: raw === '' ? '' : Number.isFinite(x) ? x : raw });
                }}
                className="min-w-0 flex-1 font-mono tabular-nums"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function useAutosizeTextarea(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 100)}px`;
  }, [ref, value]);
}

function SelectQuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: PlainQuestion & { type: 'select' };
  value: unknown;
  onChange: QuestionFieldProps['onChange'];
  disabled?: boolean;
}) {
  const [opts, setOpts] = useState<SelectOption[]>(() => question.options ?? []);

  useEffect(() => {
    if (question.optionsSource !== 'countries') {
      setOpts(question.options ?? []);
      return;
    }
    let cancelled = false;
    void fetch('/api/reference/countries')
      .then((r) => r.json())
      .then((j: { countries?: { code: string; name: string }[]; error?: string }) => {
        if (cancelled) return;
        const list = j.countries ?? [];
        setOpts(list.map((c) => ({ value: c.code, label: c.name })));
      })
      .catch(() => {
        if (!cancelled) setOpts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [question.optionsSource, question.options]);

  const loadingCountries = question.optionsSource === 'countries' && opts.length === 0;

  return (
    <div>
      <FieldLabel id={question.key} required={question.required}>
        {question.label}
      </FieldLabel>
      {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
      <Select
        value={value === null || value === undefined || value === '' ? undefined : String(value)}
        onValueChange={(v) => onChange(question.key, v)}
        disabled={disabled || loadingCountries}
      >
        <SelectTrigger id={question.key} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function QuestionField({
  questionnaireId,
  sectionKey,
  question,
  value,
  onChange,
  documents,
  disabled,
  onDocumentsChanged,
  sponsorPersonnel,
  listHydrationEpoch = 0,
  answersContext,
}: QuestionFieldProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const strVal = value === null || value === undefined ? '' : String(value);
  useAutosizeTextarea(textAreaRef, question.type === 'textarea' ? strVal : '');

  const maxWords =
    question.type !== 'pipeline_companies' &&
    question.type !== 'legal_documents_table' &&
    question.type !== 'legal_documents_list' &&
    question.type !== 'contact_persons' &&
    question.type !== 'structured_list' &&
    question.type !== 'multi_select' &&
    question.type !== 'stage_allocation' &&
    question.type !== 'company_size_params'
      ? question.maxWords
      : undefined;
  const words = typeof value === 'string' && maxWords ? countWords(value) : null;

  if (question.type === 'contact_persons') {
    return (
      <ContactPersonsCard
        value={value}
        disabled={disabled}
        onChange={(rows) => onChange(question.key, rows)}
      />
    );
  }

  if (question.type === 'stage_allocation') {
    return (
      <StageAllocationField question={question} value={value} onChange={onChange} disabled={disabled} />
    );
  }

  if (question.type === 'company_size_params') {
    return (
      <CompanySizeParamsField question={question} value={value} onChange={onChange} disabled={disabled} />
    );
  }

  if (question.type === 'structured_list') {
    const sq = question as StructuredListQuestion;
    return (
      <StructuredListField
        question={sq}
        value={value}
        onChange={onChange}
        disabled={disabled}
        sponsorPersonnel={sponsorPersonnel}
        listHydrationEpoch={listHydrationEpoch}
      />
    );
  }

  if (question.type === 'pipeline_companies') {
    const pq = question as PipelineCompaniesQuestion;
    return (
      <PipelineCompaniesField
        questionnaireId={questionnaireId}
        question={pq}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (question.type === 'legal_documents_table') {
    const rows = Array.isArray(value) ? (value as LegalDocRow[]) : [];
    return (
      <div>
        <FieldLabel required={question.required}>{question.label}</FieldLabel>
        {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
        <LegalDocumentsTable value={rows} disabled={disabled} onChange={(r) => onChange(question.key, r)} />
      </div>
    );
  }

  if (question.type === 'legal_documents_list') {
    const lq = question as LegalDocumentsListQuestion;
    return (
      <LegalDocumentsListField question={lq} value={value} onChange={onChange} disabled={disabled} />
    );
  }

  if (question.type === 'file') {
    const tag = question.uploadTag ?? question.key;
    const existing = docForTag(documents, tag);
    return (
      <div>
        <FieldLabel required={question.required}>{question.label}</FieldLabel>
        {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
        <DocumentUpload
          questionnaireId={questionnaireId}
          sectionKey={sectionKey}
          tag={tag}
          questionKey={question.key}
          existing={existing}
          disabled={disabled}
          label={undefined}
          onListChanged={onDocumentsChanged}
        />
      </div>
    );
  }

  if (question.type === 'boolean') {
    const v = value === true || value === 'true';
    const unset = value !== true && value !== false && value !== 'true' && value !== 'false';
    return (
      <div>
        <FieldLabel>{question.label}</FieldLabel>
        {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={v ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => onChange(question.key, true)}
          >
            Yes
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!unset && !v ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => onChange(question.key, false)}
          >
            No
          </Button>
        </div>
      </div>
    );
  }

  if (question.type === 'textarea') {
    const feesCharged =
      question.key === 'portfolio_fees_description' &&
      (answersContext?.charges_portfolio_fees === true || answersContext?.charges_portfolio_fees === 'true');
    const showPortfolioFees = question.key !== 'portfolio_fees_description' || feesCharged;
    return (
      <div
        className={cn(
          question.key === 'portfolio_fees_description' &&
            'transition-all duration-200 ease-in-out',
          question.key === 'portfolio_fees_description' &&
            (showPortfolioFees
              ? 'max-h-96 opacity-100'
              : 'max-h-0 overflow-hidden opacity-0 pointer-events-none'),
        )}
      >
        {showPortfolioFees ? (
          <>
            <FieldLabel
              id={question.key}
              required={question.required}
              aside={
                maxWords ? (
                  <span className="text-[12px] text-[#9ca3af]">
                    {words ?? 0} / {maxWords} words
                  </span>
                ) : undefined
              }
            >
              {question.label}
            </FieldLabel>
            {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
            <Textarea
              ref={textAreaRef}
              id={question.key}
              disabled={disabled}
              value={strVal}
              onChange={(e) => onChange(question.key, e.target.value)}
              rows={question.rows ?? 4}
              className="min-h-[100px] resize-none overflow-hidden"
              placeholder={question.placeholder}
            />
          </>
        ) : null}
      </div>
    );
  }

  if (question.type === 'text') {
    const isClosingDate =
      question.key === 'first_closing_date' || question.key === 'final_closing_date';
    return (
      <div>
        <FieldLabel
          id={question.key}
          required={question.required}
          aside={
            maxWords ? (
              <span className="text-[12px] text-[#9ca3af]">
                {words ?? 0} / {maxWords} words
              </span>
            ) : undefined
          }
        >
          {question.label}
        </FieldLabel>
        {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
        <Input
          id={question.key}
          type={isClosingDate ? 'date' : 'text'}
          disabled={disabled}
          value={strVal}
          onChange={(e) => onChange(question.key, e.target.value)}
          placeholder={question.placeholder}
          className={
            isClosingDate
              ? 'w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0B1F45]'
              : undefined
          }
        />
      </div>
    );
  }

  if (question.type === 'select' && (question.options?.length || question.optionsSource === 'countries')) {
    return (
      <SelectQuestionField
        question={question as PlainQuestion & { type: 'select' }}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (question.type === 'multi_select' && question.optionsSource === 'countries') {
    return (
      <CountryMultiSelect
        id={question.key}
        label={question.label}
        required={question.required}
        helper={question.helper}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (question.type === 'number' || question.type === 'currency') {
    const numStr =
      value === null || value === undefined ? '' : typeof value === 'number' ? String(value) : String(value);
    const isNumClosings = question.key === 'number_of_closings';
    return (
      <div>
        <FieldLabel id={question.key} required={question.required}>
          {question.label}
        </FieldLabel>
        {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
        <div className="flex w-full max-w-full items-center gap-2">
          {question.type === 'currency' && (
            <span className="shrink-0 text-[13px] font-medium text-[#6b7280]" aria-hidden>
              USD
            </span>
          )}
          <Input
            id={question.key}
            type="number"
            inputMode="decimal"
            step="any"
            min={isNumClosings ? 1 : undefined}
            max={isNumClosings ? 10 : undefined}
            disabled={disabled}
            value={numStr}
            onChange={(e) => {
              const raw = e.target.value;
              const n = parseFloat(raw.replace(/,/g, ''));
              onChange(question.key, raw === '' ? '' : Number.isFinite(n) ? n : raw);
            }}
            className={cn(
              'min-w-0 font-mono tabular-nums',
              isNumClosings ? 'w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0B1F45]' : 'flex-1',
            )}
            placeholder={question.placeholder}
          />
        </div>
      </div>
    );
  }

  const inputType =
    question.type === 'email'
      ? 'email'
      : question.type === 'phone'
        ? 'tel'
        : question.type === 'url'
          ? 'url'
          : 'text';

  return (
    <div>
      <FieldLabel id={question.key} required={question.required}>
        {question.label}
      </FieldLabel>
      {question.helper && <FieldHelper>{question.helper}</FieldHelper>}
      {maxWords && (
        <p className="mb-2 text-[12px] text-[#9ca3af]">
          {words ?? 0} / {maxWords} words
        </p>
      )}
      <Input
        id={question.key}
        type={inputType}
        disabled={disabled}
        value={strVal}
        onChange={(e) => onChange(question.key, e.target.value)}
        placeholder={question.type === 'phone' ? '+1-876-555-0101' : question.placeholder}
      />
    </div>
  );
}
