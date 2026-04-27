'use client';

import { cn } from '@/lib/utils';

export type OutcomeBand = 'strong' | 'adequate' | 'weak' | 'insufficient';

export type OutcomeBadgeProps = {
  band: OutcomeBand;
  label: string;
  recommendationLabel: string;
};

const styles: Record<OutcomeBand, string> = {
  strong: 'border-teal/50 bg-teal/10 text-navy',
  adequate: 'border-gold/50 bg-gold/10 text-navy',
  weak: 'border-gold-muted/60 bg-navy/5 text-navy',
  insufficient: 'border-navy/20 bg-navy/10 text-navy',
};

export function OutcomeBadge({ band, label, recommendationLabel }: OutcomeBadgeProps) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 shadow-shell', styles[band])}>
      <p className="text-xs font-semibold uppercase tracking-widest text-navy/50">Outcome band</p>
      <p className="text-lg font-semibold">{label}</p>
      <p className="mt-1 text-sm text-navy/80">{recommendationLabel}</p>
    </div>
  );
}
