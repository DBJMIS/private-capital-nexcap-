import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth-options';

export default async function PortalAuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/portal/login');
  }

  if (session.user.role !== 'fund_manager') {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
