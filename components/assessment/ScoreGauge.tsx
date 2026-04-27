'use client';

import { cn } from '@/lib/utils';

export type ScoreGaugeProps = {
  score: number;
  max?: number;
  label?: string;
};

export function ScoreGauge({ score, max = 100, label }: ScoreGaugeProps) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const color =
    pct >= 85 ? 'bg-teal' : pct >= 70 ? 'bg-gold' : pct >= 55 ? 'bg-gold-muted' : 'bg-navy/40';

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-navy/70">{label}</p>}
      <div className="flex items-end justify-between gap-2">
        <span className="text-3xl font-semibold tabular-nums text-navy">{score.toFixed(1)}</span>
        <span className="text-xs text-navy/50">/ {max}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-navy/10">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
