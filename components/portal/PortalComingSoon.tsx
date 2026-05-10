import Link from 'next/link';

import { cn } from '@/lib/utils';

export type PortalComingSoonProps = {
  title: string;
  description: string;
  subtext?: string;
  icon: React.ReactNode;
};

export function PortalComingSoon({ title, description, subtext, icon }: PortalComingSoonProps) {
  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 text-[#00A99D]" aria-hidden>
          {icon}
        </div>
        <h1 className="text-xl font-semibold text-[#0B1F45]">{title}</h1>
        <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Coming Soon
        </span>
        <p className={cn('mt-4 text-sm text-gray-700')}>{description}</p>
        {subtext ? <p className="mt-2 text-sm text-gray-500">{subtext}</p> : null}
      </div>
      <div className="border-t border-gray-100 pt-6 text-center">
        <Link href="/portal" className="text-sm font-medium text-[#00A99D] hover:underline">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
