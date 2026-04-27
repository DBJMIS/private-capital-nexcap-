import { redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { canMutateCfp, canViewCfpModule } from '@/lib/cfp/access';
import { loadCfpListPayload } from '@/lib/cfp/list-data';
import { CfpListClient } from '@/components/cfp/CfpListClient';

export const dynamic = 'force-dynamic';

export default async function CfpListPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canViewCfpModule(profile)) {
    redirect('/unauthorized');
  }

  const supabase = createServerClient();
  const { payload, error } = await loadCfpListPayload(supabase, profile.tenant_id);
  if (error) {
    return <p className="text-sm text-red-600">Failed to load CFPs: {error}</p>;
  }

  return <CfpListClient initial={payload} canWrite={canMutateCfp(profile)} />;
}
