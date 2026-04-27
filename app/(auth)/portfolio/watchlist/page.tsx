import { WatchlistClient } from '@/components/portfolio/WatchlistClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function WatchlistPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F45]">Watchlist</h1>
        <p className="mt-1 text-sm text-gray-600">
          Funds flagged from approved quarterly assessments (watchlist, freeze, or divest tracks).
        </p>
      </div>
      <WatchlistClient />
    </div>
  );
}
