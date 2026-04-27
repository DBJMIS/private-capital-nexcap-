import type { Metadata } from 'next';

import { CapitalCallsOverviewClient } from '@/components/portfolio/CapitalCallsOverviewClient';
import { requireAuth } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Capital Calls',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioCapitalCallsPage() {
  await requireAuth();

  return (
    <div className="min-h-[50vh] w-full bg-[#F3F4F6]">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <CapitalCallsOverviewClient />
      </div>
    </div>
  );
}
