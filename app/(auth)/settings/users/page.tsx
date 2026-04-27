import { redirect } from 'next/navigation';

import { UserManagementClient } from '@/components/settings/UserManagementClient';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { loadUserManagementSnapshot } from '@/lib/settings/user-management-snapshot';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function UserManagementPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    redirect('/unauthorized');
  }

  const supabase = createServerClient();
  const initial = await loadUserManagementSnapshot(supabase, profile.tenant_id);

  return <UserManagementClient initial={initial} currentProfileId={profile.profile_id} />;
}
