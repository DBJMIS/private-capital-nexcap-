import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dsStat } from '@/components/ui/design-system';

const ACCENT_TOP: Record<'navy' | 'teal' | 'gold' | 'blue' | 'amber' | 'gray', string> = {
  navy: 'border-t-4 border-[#0B1F45]',
  teal: 'border-t-4 border-[#0F8A6E]',
  gold: 'border-t-4 border-[#C8973A]',
  blue: 'border-t-4 border-blue-500',
  amber: 'border-t-4 border-amber-500',
  gray: 'border-t-4 border-gray-300',
};

export type StatCardAccent = keyof typeof ACCENT_TOP;

export type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  accent?: StatCardAccent;
  className?: string;
};

export function StatCard({ label, value, icon: Icon, accent = 'navy', className }: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5',
        ACCENT_TOP[accent],
        className,
      )}
    >
      {Icon ? <Icon className={dsStat.icon} aria-hidden /> : null}
      <div className={Icon ? 'pr-10' : ''}>
        <div className={dsStat.number}>{value}</div>
        <div className={dsStat.label}>{label}</div>
      </div>
    </div>
  );
}
