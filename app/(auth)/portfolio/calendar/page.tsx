import type { Metadata } from 'next';

import { PortfolioReportingCalendar } from '@/components/portfolio/PortfolioReportingCalendar';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Reporting Calendar',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioCalendarPage() {
  await requireAuth();
  const profile = await getProfile();
  const canWrite = Boolean(profile && can(profile, 'write:applications'));
  const submitterName = profile?.full_name?.trim() || 'Staff';

  return (
    <div className="min-h-[60vh] w-full">
      <PortfolioReportingCalendar canWrite={canWrite} submitterName={submitterName} />
    </div>
  );
}
