import { notFound, redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { PrequalificationWorkspace } from '@/components/prequalification/PrequalificationWorkspace';

export const dynamic = 'force-dynamic';

export default async function PrequalificationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    redirect('/unauthorized');
  }

  const { id } = await params;
  const supabase = createServerClient();
  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) notFound();

  return <PrequalificationWorkspace applicationId={id} />;
}
