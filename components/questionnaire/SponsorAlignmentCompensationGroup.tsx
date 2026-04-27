'use client';

import { useMemo } from 'react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldGroup } from '@/components/ui/FieldGroup';
import { StructuredListField } from '@/components/questionnaire/StructuredListField';
import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import type { PlainQuestion, StructuredListQuestion } from '@/lib/questionnaire/types';
import { cn } from '@/lib/utils';

const sponsorConfig = getSectionConfig('sponsor')!;

function questionByKey(key: string) {
  return sponsorConfig.questions.find((q) => q.key === key);
}

const outsourcedQuestion = questionByKey('outsourced_services') as StructuredListQuestion;
const compensationQuestion = questionByKey('compensation_structure') as PlainQuestion & { type: 'textarea' };

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function boolTri(v: unknown): boolean | null {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

type Props = {
  answers: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
};

function PillChoice({
  selected,
  onSelect,
  disabled,
  label,
  variant,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  label: string;
  variant: 'yes' | 'no';
}) {
  const active =
    variant === 'yes'
      ? 'border-transparent bg-[#0F8A6E] text-white'
      : 'border-transparent bg-[#0B1F45] text-white';
  const idle = 'border border-gray-300 bg-white text-gray-600';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-lg px-5 py-2 text-sm transition-colors',
        selected ? active : idle,
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {label}
    </button>
  );
}

function ConditionalPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'overflow-hidden transition-all duration-200 ease-in-out',
        open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
      )}
    >
      <div className={cn('pt-1', !open && 'pointer-events-none')}>{children}</div>
    </div>
  );
}

export function SponsorAlignmentCompensationGroup({ answers, onChange, disabled }: Props) {
  const invest = boolTri(answers.manager_will_invest);
  const otherBiz = boolTri(answers.other_business_activities_yes);
  const outsideCon = boolTri(answers.outside_contracts_yes);

  const amountStr = useMemo(() => {
    const v = answers.manager_investment_amount;
    if (v === null || v === undefined || v === '') return '';
    return typeof v === 'number' ? String(v) : String(v);
  }, [answers.manager_investment_amount]);

  const pctStr = useMemo(() => {
    const v = answers.manager_investment_pct;
    if (v === null || v === undefined || v === '') return '';
    return typeof v === 'number' ? String(v) : String(v);
  }, [answers.manager_investment_pct]);

  const setInvest = (next: boolean) => {
    onChange('manager_will_invest', next);
    if (!next) {
      onChange('manager_investment_amount', '');
      onChange('manager_investment_pct', '');
      onChange('manager_investment_method', '');
    }
  };

  return (
    <div className="space-y-8">
      <FieldGroup title="Alignment of interest">
        <p className="mb-3 text-[13px] font-medium text-navy">
          Will the manager invest in the fund?<span className="text-gold"> *</span>
        </p>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Will the manager invest in the fund?">
          <PillChoice
            label="Yes"
            variant="yes"
            selected={invest === true}
            disabled={disabled}
            onSelect={() => setInvest(true)}
          />
          <PillChoice
            label="No"
            variant="no"
            selected={invest === false}
            disabled={disabled}
            onSelect={() => setInvest(false)}
          />
        </div>

        <ConditionalPanel open={invest === true}>
          <div className="mt-4 space-y-4 rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-navy">Investment amount (USD)</label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[13px] font-medium text-[#6b7280]" aria-hidden>
                    USD
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    disabled={disabled}
                    className="min-w-0 flex-1 font-mono tabular-nums"
                    placeholder="0"
                    value={amountStr}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = parseFloat(raw.replace(/,/g, ''));
                      onChange('manager_investment_amount', raw === '' ? '' : Number.isFinite(n) ? n : raw);
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-navy">% of total fund</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    disabled={disabled}
                    className="min-w-0 flex-1 font-mono tabular-nums"
                    placeholder="0"
                    value={pctStr}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = parseFloat(raw.replace(/,/g, ''));
                      onChange('manager_investment_pct', raw === '' ? '' : Number.isFinite(n) ? n : raw);
                    }}
                  />
                  <span className="shrink-0 text-[13px] text-[#6b7280]">%</span>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-navy">How will investment be made?</label>
              <Textarea
                disabled={disabled}
                rows={2}
                className="min-h-[52px] resize-y"
                placeholder="Describe timing, instrument, side letters, etc."
                value={str(answers.manager_investment_method)}
                onChange={(e) => onChange('manager_investment_method', e.target.value)}
              />
            </div>
          </div>
        </ConditionalPanel>
      </FieldGroup>

      <FieldGroup title={compensationQuestion.label}>
        <p className="mb-2 text-[12px] leading-snug text-[#6b7280]">
          Describe salary bands, bonus structure, and carried interest participation per role level
        </p>
        <Textarea
          id={compensationQuestion.key}
          disabled={disabled}
          required={compensationQuestion.required}
          rows={compensationQuestion.rows ?? 4}
          className="min-h-[120px] resize-y"
          placeholder={compensationQuestion.placeholder}
          value={str(answers.compensation_structure)}
          onChange={(e) => onChange('compensation_structure', e.target.value)}
        />
      </FieldGroup>

      <StructuredListField
        question={outsourcedQuestion}
        value={answers.outsourced_services}
        onChange={onChange}
        disabled={disabled}
      />

      <FieldGroup title="Other activities & contracts">
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-[13px] font-medium text-navy">
              Does the manager have other business activities?<span className="text-gold"> *</span>
            </p>
            <div
              className="flex flex-wrap gap-3"
              role="radiogroup"
              aria-label="Does the manager have other business activities?"
            >
              <PillChoice
                label="Yes"
                variant="yes"
                selected={otherBiz === true}
                disabled={disabled}
                onSelect={() => {
                  onChange('other_business_activities_yes', true);
                }}
              />
              <PillChoice
                label="No"
                variant="no"
                selected={otherBiz === false}
                disabled={disabled}
                onSelect={() => {
                  onChange('other_business_activities_yes', false);
                  onChange('other_activities', '');
                }}
              />
            </div>
            <ConditionalPanel open={otherBiz === true}>
              <div className="mt-3">
                <label className="mb-1 block text-[12px] font-medium text-navy">Describe other activities</label>
                <Textarea
                  disabled={disabled}
                  rows={3}
                  className="min-h-[72px] resize-y transition-all duration-200 ease-in-out"
                  placeholder="Describe other business activities"
                  value={str(answers.other_activities)}
                  onChange={(e) => onChange('other_activities', e.target.value)}
                />
              </div>
            </ConditionalPanel>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-medium text-navy">
              Are there any outside contracts?<span className="text-gold"> *</span>
            </p>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Are there any outside contracts?">
              <PillChoice
                label="Yes"
                variant="yes"
                selected={outsideCon === true}
                disabled={disabled}
                onSelect={() => {
                  onChange('outside_contracts_yes', true);
                }}
              />
              <PillChoice
                label="No"
                variant="no"
                selected={outsideCon === false}
                disabled={disabled}
                onSelect={() => {
                  onChange('outside_contracts_yes', false);
                  onChange('outside_contracts', '');
                }}
              />
            </div>
            <ConditionalPanel open={outsideCon === true}>
              <div className="mt-3">
                <label className="mb-1 block text-[12px] font-medium text-navy">
                  Describe contracts and liabilities
                </label>
                <Textarea
                  disabled={disabled}
                  rows={3}
                  className="min-h-[72px] resize-y transition-all duration-200 ease-in-out"
                  placeholder="Describe contracts and liabilities"
                  value={str(answers.outside_contracts)}
                  onChange={(e) => onChange('outside_contracts', e.target.value)}
                />
              </div>
            </ConditionalPanel>
          </div>
        </div>
      </FieldGroup>
    </div>
  );
}
