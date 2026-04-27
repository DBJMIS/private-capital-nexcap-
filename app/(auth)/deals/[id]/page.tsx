import { DealDetail } from '@/components/deals/DealDetail';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) return null;

  return (
    <div className="w-full max-w-none">
      <DealDetail
        dealId={params.id}
        canWriteDeals={can(profile, 'write:deals')}
        canApproveInvestment={can(profile, 'approve:investment')}
      />
    </div>
  );
}
