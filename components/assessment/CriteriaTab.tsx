'use client';

import { Button } from '@/components/ui/button';
import { SubcriteriaRow } from '@/components/assessment/SubcriteriaRow';
import type { CriteriaDef } from '@/lib/scoring/config';

export type SubcriteriaState = Record<string, { score: number | null; notes: string }>;

export type CriteriaTabProps = {
  definition: CriteriaDef;
  state: SubcriteriaState;
  disabled?: boolean;
  onChange: (key: string, patch: { score: number | null; notes: string }) => void;
  onSave: () => void;
  saving?: boolean;
};

export function CriteriaTab({
  definition,
  state,
  disabled,
  onChange,
  onSave,
  saving,
}: CriteriaTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-navy">{definition.title}</h2>
          <p className="text-sm text-navy/60">
            Weight {definition.weightPercent}% · Max {definition.subcriteria.reduce((s, x) => s + x.maxPoints, 0)}{' '}
            points
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-shell-border"
          disabled={disabled || saving}
          onClick={() => onSave()}
        >
          {saving ? 'Saving…' : 'Save section'}
        </Button>
      </div>
      <div className="space-y-4">
        {definition.subcriteria.map((sc) => {
          const row = state[sc.key] ?? { score: null, notes: '' };
          return (
            <SubcriteriaRow
              key={sc.key}
              label={sc.label}
              maxPoints={sc.maxPoints}
              score={row.score}
              notes={row.notes}
              disabled={disabled}
              onChange={(patch) => onChange(sc.key, patch)}
            />
          );
        })}
      </div>
    </div>
  );
}
