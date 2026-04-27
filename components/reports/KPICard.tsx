'use client';

import { cn } from '@/lib/utils';

export type KPICardProps = {
  title: string;
  value: string;
  hint?: string;
  className?: string;
};

export function KPICard({ title, value, hint, className }: KPICardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell sm:p-5',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy/50">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-navy sm:text-[1.65rem]">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-snug text-navy/55">{hint}</p> : null}
      <div className="mt-4 h-1 w-10 rounded-full bg-gold/70" aria-hidden />
    </div>
  );
}
