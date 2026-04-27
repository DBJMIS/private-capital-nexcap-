import type { PerformanceBand } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';

const BAND_META: Record<
  PerformanceBand,
  { label: string; className: string }
> = {
  performing: {
    label: 'Performing',
    className: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
  },
  watch: {
    label: 'Watch',
    className: 'bg-amber-100 text-amber-950 ring-1 ring-amber-200',
  },
  underperforming: {
    label: 'Underperforming',
    className: 'bg-orange-100 text-orange-950 ring-1 ring-orange-200',
  },
  critical: {
    label: 'Critical',
    className: 'bg-red-100 text-red-900 ring-1 ring-red-200',
  },
};

export function PerformanceBadge({ band }: { band: PerformanceBand }) {
  const meta = BAND_META[band];
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
