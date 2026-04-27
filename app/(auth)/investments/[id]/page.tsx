import { InvestmentDetailClient } from '@/components/investments/InvestmentDetailClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function InvestmentDetailPage({ params }: { params: { id: string } }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) return null;

  return (
    <div className="w-full max-w-none">
      <InvestmentDetailClient
        investmentId={params.id}
        canWriteDisbursements={can(profile, 'write:disbursements')}
        canApproveDisbursement={can(profile, 'approve:disbursement')}
        canWriteInvestments={can(profile, 'write:investments')}
      />
    </div>
  );
}
