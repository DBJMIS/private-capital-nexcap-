import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { FundPortalShell } from '@/components/portal/FundPortalShell';
import { authOptions } from '@/lib/auth-options';

export default async function FundLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'fund_manager') {
    redirect('/portal/login');
  }
  const { id } = await params;
  return (
    <FundPortalShell applicationId={id} userId={session.user.id}>
      {children}
    </FundPortalShell>
  );
}
