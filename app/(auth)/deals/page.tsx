import { requireAuth } from '@/lib/auth/session';

import { DealsListClient } from '@/components/deals/DealsListClient';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  await requireAuth();

  return (
    <div className="w-full max-w-none space-y-6">
      <DealsListClient />
    </div>
  );
}
