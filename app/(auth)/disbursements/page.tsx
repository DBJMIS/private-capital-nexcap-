import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Wallet } from 'lucide-react';

import { requireAuth } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Disbursements',
};

export const dynamic = 'force-dynamic';

export default async function DisbursementsIndexPage() {
  await requireAuth();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00A99D]/15 text-[#00A99D]">
          <Wallet className="h-7 w-7" aria-hidden />
        </div>
        <span className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Coming Soon
        </span>
        <h1 className="text-2xl font-bold text-[#0B1F45]">Disbursements</h1>
        <p className="mt-2 text-sm text-gray-600">This section is under development</p>
        <Link
          href="/portfolio"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#0B1F45] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0a1938]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to portfolio
        </Link>
      </div>
    </div>
  );
}
