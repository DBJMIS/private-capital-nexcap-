import type { Metadata } from 'next';

import { InvestorDetailClient } from '@/components/investors/InvestorDetailClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  return { title: 'Investor' };
}

export default async function InvestorDetailPage({ params }: { params: { id: string } }) {
  await requireAuth();
  const profile = await getProfile();
  const canWrite = profile ? can(profile, 'write:applications') : false;

  return (
    <div className="w-full max-w-none">
      <InvestorDetailClient investorId={params.id} canWrite={canWrite} />
    </div>
  );
}
