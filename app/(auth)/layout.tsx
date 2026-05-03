import { redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
import { getProfile, getSession, requireAuth } from '@/lib/auth/session';
import { AssistantLayoutRoot } from '@/components/assistant/AssistantLayoutRoot';
import { AuthenticatedShell } from '@/components/layout/AuthenticatedShell';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  const profile = await getProfile();
  const session = await getSession();
  if (!profile) {
    redirect('/login?error=AccessDenied');
  }

  const supabase = createServerClient();
  const { data: tenantRow } = await supabase
    .from('vc_tenants')
    .select('name')
    .eq('id', profile.tenant_id)
    .maybeSingle();

  const tenantName =
    (tenantRow as { name: string } | null)?.name?.trim() || 'Organization';

  let watchlistCount = 0;
  try {
    const { count, error } = await supabase
      .from('vc_watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id);
    if (!error && typeof count === 'number') watchlistCount = count;
  } catch {
    /* fail silent */
  }

  return (
    <AssistantLayoutRoot>
      <AuthenticatedShell
        tenantName={tenantName}
        user={{
          name: profile.full_name,
          email: profile.email,
          role: profile.role ?? 'viewer',
          allowedModules: session?.user?.allowedModules ?? [],
        }}
        watchlistCount={watchlistCount}
      >
        {children}
      </AuthenticatedShell>
    </AssistantLayoutRoot>
  );
}
