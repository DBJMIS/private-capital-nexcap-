import type { Metadata } from 'next';

import { InvestorsListClient } from '@/components/investors/InvestorsListClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
export const metadata: Metadata = {
  title: 'Investors',
};

export const dynamic = 'force-dynamic';

export default async function InvestorsPage() {
  await requireAuth();
  const profile = await getProfile();
  const canWrite = profile ? can(profile, 'write:applications') : false;

  return (
    <div className="w-full max-w-none space-y-6">
      <InvestorsListClient canWrite={canWrite} />
    </div>
  );
}
