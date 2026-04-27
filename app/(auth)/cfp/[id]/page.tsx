import { notFound, redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { canMutateCfp, canViewCfpModule } from '@/lib/cfp/access';
import { loadCfpDetailPayload } from '@/lib/cfp/detail-data';
import { CfpDetailView } from '@/components/cfp/CfpDetailView';

export const dynamic = 'force-dynamic';

export default async function CfpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canViewCfpModule(profile)) {
    redirect('/unauthorized');
  }

  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await loadCfpDetailPayload(supabase, profile.tenant_id, id);
  if (error && error !== 'not_found') {
    return <p className="text-sm text-red-600">Failed to load CFP: {error}</p>;
  }
  if (!data) {
    notFound();
  }

  return <CfpDetailView initial={data} canWrite={canMutateCfp(profile)} />;
}
