import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';

import { UserManagementClient } from '@/components/settings/UserManagementClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { loadUserManagementSnapshot } from '@/lib/settings/user-management-snapshot';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const loadUserManagementSnapshotCached = unstable_cache(
  async (tenantId: string) => {
    const supabase = createServerClient();
    return loadUserManagementSnapshot(supabase, tenantId);
  },
  ['user-management-snapshot'],
  { revalidate: 60 },
);

export default async function UserManagementPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    redirect('/unauthorized');
  }

  const initial = await loadUserManagementSnapshotCached(profile.tenant_id);
  return <UserManagementClient initial={initial} currentProfileId={profile.profile_id} />;
}
