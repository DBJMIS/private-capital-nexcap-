import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function PortfolioComingSoon({
  icon: Icon,
  title,
  description,
  footnote,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  footnote: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-8 py-16 text-center',
      )}
    >
      <Icon className="h-12 w-12 text-[#0B1F45]/30" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold text-[#0B1F45]">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-500">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[#C8973A]">{footnote}</p>
    </div>
  );
}
