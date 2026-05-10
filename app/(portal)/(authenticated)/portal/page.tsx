import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth-options';
import { PortalShell } from '@/components/portal/PortalShell';
import { FundSelectorClient } from '@/components/portal/FundSelectorClient';

export default async function PortalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/portal/login');

  return (
    <PortalShell user={session.user}>
      <FundSelectorClient />
    </PortalShell>
  );
}
