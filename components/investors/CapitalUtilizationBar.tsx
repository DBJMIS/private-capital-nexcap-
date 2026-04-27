'use client';

import { cn } from '@/lib/utils';

export function CapitalUtilizationBar({
  committedUsd,
  deployedUsd,
  className,
}: {
  committedUsd: number;
  deployedUsd: number;
  className?: string;
}) {
  const c = Math.max(0, committedUsd);
  const d = Math.max(0, Math.min(deployedUsd, c || deployedUsd));
  const pct = c > 0 ? Math.min(100, Math.round((d / c) * 1000) / 10) : deployedUsd > 0 ? 100 : 0;
  const warn = c > 0 && d / c < 0.5;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex justify-between text-xs text-navy/60">
        <span>Deployed vs committed</span>
        <span className="tabular-nums font-medium text-navy">
          {pct}% {c > 0 ? `(${formatUsd(d)} / ${formatUsd(c)})` : formatUsd(d)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-navy/10">
        <div
          className={cn('h-full rounded-full transition-all', warn ? 'bg-amber-500' : 'bg-teal')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}
