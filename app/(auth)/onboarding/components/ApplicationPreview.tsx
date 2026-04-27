'use client';

import type { FundApplicationForm } from '@/types/onboarding';
import { isApplicationReady } from '@/lib/onboarding/extract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type ApplicationPreviewProps = {
  application: Partial<FundApplicationForm>;
  onChange: (next: Partial<FundApplicationForm>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export function ApplicationPreview({ application, onChange, onSubmit, isSubmitting }: ApplicationPreviewProps) {
  const ready = isApplicationReady(application);

  const set = <K extends keyof FundApplicationForm>(key: K, value: FundApplicationForm[K] | string) => {
    if (key === 'total_capital_commitment_usd') {
      const n = typeof value === 'string' ? parseFloat(value) : (value as number);
      onChange({ ...application, total_capital_commitment_usd: Number.isFinite(n) ? n : undefined });
      return;
    }
    onChange({ ...application, [key]: value } as Partial<FundApplicationForm>);
  };

  return (
    <div className="app-card flex h-full min-h-[520px] flex-col">
      <div className="border-b border-shell-border px-4 py-3">
        <h2 className="text-sm font-semibold text-navy">Application preview</h2>
        <p className="text-xs text-navy/60">
          Fields update as the analyst extracts them. Edit any value before submitting.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="fund_name">Fund name</Label>
          <Input
            id="fund_name"
            value={application.fund_name ?? ''}
            onChange={(e) => set('fund_name', e.target.value)}
            placeholder="e.g. Caribbean Growth Fund II"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="manager_name">Fund manager / GP name</Label>
          <Input
            id="manager_name"
            value={application.manager_name ?? ''}
            onChange={(e) => set('manager_name', e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
          <div className="grid gap-2">
            <Label htmlFor="country">Country of incorporation</Label>
            <Input
              id="country"
              value={application.country_of_incorporation ?? ''}
              onChange={(e) => set('country_of_incorporation', e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="geo">Geographic focus</Label>
            <Input
              id="geo"
              value={application.geographic_area ?? ''}
              onChange={(e) => set('geographic_area', e.target.value)}
              placeholder="Regions or countries"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="commitment">Total capital commitment (USD)</Label>
          <Input
            id="commitment"
            type="number"
            min={0}
            step="1000"
            value={application.total_capital_commitment_usd ?? ''}
            onChange={(e) => set('total_capital_commitment_usd', e.target.value)}
            placeholder="Target fund size"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
          <div className="grid gap-2">
            <Label htmlFor="stage">Investment stage focus</Label>
            <Input
              id="stage"
              value={application.investment_stage ?? ''}
              onChange={(e) => set('investment_stage', e.target.value)}
              placeholder="ideas / startups / scaling / mature"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sector">Primary sector</Label>
            <Input
              id="sector"
              value={application.primary_sector ?? ''}
              onChange={(e) => set('primary_sector', e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
          <div className="grid gap-2">
            <Label htmlFor="life">Fund life (years)</Label>
            <Input
              id="life"
              type="number"
              min={0}
              value={application.fund_life_years ?? ''}
              onChange={(e) => {
              if (e.target.value === '') {
                set('fund_life_years', undefined);
                return;
              }
              const n = parseInt(e.target.value, 10);
              set('fund_life_years', Number.isFinite(n) ? n : undefined);
            }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inv">Investment period (years)</Label>
            <Input
              id="inv"
              type="number"
              min={0}
              value={application.investment_period_years ?? ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  set('investment_period_years', undefined);
                  return;
                }
                const n = parseInt(e.target.value, 10);
                set('investment_period_years', Number.isFinite(n) ? n : undefined);
              }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-shell-border p-4">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${ready ? 'bg-teal' : 'bg-gold'}`}
            aria-hidden
          />
          <span className={ready ? 'text-teal' : 'text-navy/70'}>
            {ready ? 'Ready to submit' : 'Complete required fields (capital commitment must be greater than 0)'}
          </span>
        </div>
        <Button
          type="button"
          className="w-full bg-gold text-navy hover:bg-gold/90"
          disabled={!ready || isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </div>
  );
}
