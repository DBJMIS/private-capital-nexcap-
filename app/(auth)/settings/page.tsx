import { redirect } from 'next/navigation';

import Link from 'next/link';

import { AuditSettingsClient } from '@/components/audit/AuditSettingsClient';
import { AssessmentSettingsClient } from '@/components/assessment/AssessmentSettingsClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { dsCard, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) redirect('/login');

  const isItAdmin = profile.role === 'it_admin';

  return (
    <div className="w-full max-w-none space-y-6">
      {profile.role === 'admin' ? (
        <>
          <AuditSettingsClient />
          <AssessmentSettingsClient />
        </>
      ) : isItAdmin ? (
        <p className={cn(dsCard.padded, dsType.muted)}>
          IT administrators can manage users and invitations from User Management. Compliance audit exports are limited to
          tenant administrators.
        </p>
      ) : (
        <p className={cn(dsCard.padded, dsType.muted)}>
          Full audit export is limited to tenant administrators. Contact an admin if you need a compliance extract.
        </p>
      )}
    </div>
  );
}
