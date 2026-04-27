import { notFound, redirect } from 'next/navigation';

import { UserEditForm } from '@/components/settings/UserEditForm';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export default async function EditUserPage({ params }: PageProps) {
  await requireAuth();
  const me = await getProfile();
  if (!me || !canManageUsers(me.role)) {
    redirect('/unauthorized');
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { data: target, error } = await supabase
    .from('vc_profiles')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', me.tenant_id)
    .maybeSingle();

  if (error || !target) notFound();

  const profile = target as Database['public']['Tables']['vc_profiles']['Row'];
  if (profile.role === 'admin') {
    redirect('/settings/users');
  }

  const { data: ur } = await supabase
    .from('vc_user_roles')
    .select('*')
    .eq('profile_id', id)
    .eq('tenant_id', me.tenant_id)
    .maybeSingle();

  return <UserEditForm profile={profile} userRole={ur} currentProfileId={me.profile_id} />;
}
