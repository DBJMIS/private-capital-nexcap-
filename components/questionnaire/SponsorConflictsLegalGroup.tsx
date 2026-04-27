'use client';

import { Textarea } from '@/components/ui/textarea';
import { FieldGroup } from '@/components/ui/FieldGroup';
import { cn } from '@/lib/utils';

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

function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'overflow-hidden transition-all duration-200 ease-in-out',
        open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
      )}
    >
      <div className={cn('space-y-3 pt-2', !open && 'pointer-events-none')}>{children}</div>
    </div>
  );
}

export function SponsorConflictsLegalGroup({ answers, onChange, disabled }: Props) {
  const conflictsYes = boolTri(answers.has_conflicts_of_interest) === true;
  const conflictsNo = boolTri(answers.has_conflicts_of_interest) === false;
  const regYes = boolTri(answers.has_regulations) === true;
  const regNo = boolTri(answers.has_regulations) === false;
  const litYes = boolTri(answers.has_litigation) === true;
  const litNo = boolTri(answers.has_litigation) === false;
  const complianceStatus = str(answers.compliance_status);
  const showComplianceDetails = complianceStatus === 'non_compliant';

  const setConflicts = (v: boolean) => {
    onChange('has_conflicts_of_interest', v);
    if (!v) {
      onChange('conflicts_description', '');
      onChange('conflicts_resolution', '');
    }
  };

  const setRegulations = (v: boolean) => {
    onChange('has_regulations', v);
    if (!v) {
      onChange('regulations_list', '');
      onChange('compliance_status', '');
      onChange('compliance_details', '');
    }
  };

  const setLitigation = (v: boolean) => {
    onChange('has_litigation', v);
    if (!v) {
      onChange('litigation_status', '');
      onChange('litigation_description', '');
    }
  };

  return (
    <FieldGroup title="Conflicts & legal">
      <div className="space-y-8">
        <section>
          <p className="mb-2 text-[13px] font-medium text-navy">Are there any conflicts of interest?</p>
          <div className="flex gap-2">
            <PillChoice
              label="Yes"
              variant="yes"
              disabled={disabled}
              selected={conflictsYes}
              onSelect={() => setConflicts(true)}
            />
            <PillChoice
              label="No"
              variant="no"
              disabled={disabled}
              selected={conflictsNo}
              onSelect={() => setConflicts(false)}
            />
          </div>
          <Reveal open={conflictsYes}>
            <Textarea
              disabled={disabled}
              rows={3}
              placeholder="Describe the conflicts of interest"
              value={str(answers.conflicts_description)}
              onChange={(e) => onChange('conflicts_description', e.target.value)}
              className="border border-gray-300 text-sm"
            />
            <Textarea
              disabled={disabled}
              rows={3}
              placeholder="Resolution procedures"
              value={str(answers.conflicts_resolution)}
              onChange={(e) => onChange('conflicts_resolution', e.target.value)}
              className="border border-gray-300 text-sm"
            />
          </Reveal>
        </section>

        <section>
          <p className="mb-2 text-[13px] font-medium text-navy">Is the manager subject to any regulations?</p>
          <div className="flex gap-2">
            <PillChoice
              label="Yes"
              variant="yes"
              disabled={disabled}
              selected={regYes}
              onSelect={() => setRegulations(true)}
            />
            <PillChoice
              label="No"
              variant="no"
              disabled={disabled}
              selected={regNo}
              onSelect={() => setRegulations(false)}
            />
          </div>
          <Reveal open={regYes}>
            <Textarea
              disabled={disabled}
              rows={3}
              placeholder="List all applicable regulations"
              value={str(answers.regulations_list)}
              onChange={(e) => onChange('regulations_list', e.target.value)}
              className="border border-gray-300 text-sm"
            />
            <div>
              <p className="mb-2 text-[12px] font-medium text-[#374151]">Compliance status</p>
              <div className="flex flex-col gap-2">
                {(
                  [
                    { value: 'compliant', label: 'Fully compliant' },
                    { value: 'pending', label: 'Pending compliance' },
                    { value: 'non_compliant', label: 'Non-compliant' },
                  ] as const
                ).map((opt) => (
                  <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
                    <input
                      type="radio"
                      name="compliance_status"
                      disabled={disabled}
                      checked={complianceStatus === opt.value}
                      onChange={() => onChange('compliance_status', opt.value)}
                      className="h-4 w-4"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <Reveal open={showComplianceDetails}>
              <Textarea
                disabled={disabled}
                rows={2}
                placeholder="Compliance details"
                value={str(answers.compliance_details)}
                onChange={(e) => onChange('compliance_details', e.target.value)}
                className="border border-gray-300 text-sm"
              />
            </Reveal>
          </Reveal>
        </section>

        <section>
          <p className="mb-2 text-[13px] font-medium text-navy">
            Any litigation or regulatory investigations?
          </p>
          <div className="flex gap-2">
            <PillChoice label="Yes" variant="yes" disabled={disabled} selected={litYes} onSelect={() => setLitigation(true)} />
            <PillChoice label="No" variant="no" disabled={disabled} selected={litNo} onSelect={() => setLitigation(false)} />
          </div>
          <Reveal open={litYes}>
            <div>
              <p className="mb-2 text-[12px] font-medium text-[#374151]">Status</p>
              <div className="flex flex-col gap-2">
                {(
                  [
                    { value: 'past', label: 'Past (resolved)' },
                    { value: 'pending', label: 'Pending (ongoing)' },
                  ] as const
                ).map((opt) => (
                  <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
                    <input
                      type="radio"
                      name="litigation_status"
                      disabled={disabled}
                      checked={str(answers.litigation_status) === opt.value}
                      onChange={() => onChange('litigation_status', opt.value)}
                      className="h-4 w-4"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <Textarea
              disabled={disabled}
              rows={3}
              placeholder="Description of matter"
              value={str(answers.litigation_description)}
              onChange={(e) => onChange('litigation_description', e.target.value)}
              className="border border-gray-300 text-sm"
            />
          </Reveal>
        </section>
      </div>
    </FieldGroup>
  );
}
