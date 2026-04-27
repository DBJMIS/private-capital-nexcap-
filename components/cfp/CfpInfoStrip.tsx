import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

import { formatCfpDate } from '@/lib/cfp/format-dates';
import { cn } from '@/lib/utils';

export type CfpStripData = {
  id: string;
  title: string;
  status: string;
  closing_date: string;
};

type Props = {
  cfp: CfpStripData | null | undefined;
  className?: string;
};

export function CfpInfoStrip({ cfp, className }: Props) {
  if (!cfp) return null;
  const statusLabel = cfp.status.replace(/_/g, ' ');
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1F45]" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-[#0B1F45]">{cfp.title}</p>
          <p className="text-[13px] text-gray-700">
            Closes {formatCfpDate(cfp.closing_date)}
            <span className="mx-1.5 text-gray-400">·</span>
            <span className="capitalize">{statusLabel}</span>
          </p>
        </div>
      </div>
      <Link href={`/cfp/${cfp.id}`} className="shrink-0 font-medium text-[#0B1F45] hover:underline">
        View CFP →
      </Link>
    </div>
  );
}
