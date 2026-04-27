'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';

export type QuestionnaireStepperHeaderProps = {
  fundName: string;
  completedCount: number;
  totalSections: number;
  /** Dashboard or safe exit route */
  exitHref?: string;
};

export function QuestionnaireStepperHeader({
  fundName,
  completedCount,
  totalSections,
  exitHref = '/dashboard',
}: QuestionnaireStepperHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 bg-white px-6 py-3">
      <p className="min-w-0 truncate text-sm font-semibold leading-tight text-[#0B1F45]">
        <span className="truncate">{fundName}</span>
        <span className="font-semibold text-gray-400"> — Due Diligence</span>
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-gray-400">
        <span className="tabular-nums">
          {completedCount} of {totalSections} complete
        </span>
        <Link
          href={exitHref}
          className="inline-flex items-center gap-1 text-gray-400 transition-colors hover:text-[#0B1F45]"
        >
          <LogOut className="h-3 w-3 shrink-0" aria-hidden />
          Exit
        </Link>
      </div>
    </div>
  );
}
