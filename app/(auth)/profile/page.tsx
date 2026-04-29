import Link from 'next/link';
import { Building2, Mail, ShieldCheck, User2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/UserAvatar';
import { requireAuth, getProfile } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import { roleBadgeClass, roleDisplayLabel } from '@/lib/settings/role-visual';
import { dsCard, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Jamaica',
  }).format(dt);
}

async function getLastSignInAt(userId: string): Promise<string | null> {
  void userId;
  return null;
}

export default async function ProfilePage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = createServerClient();
  const [{ data: tenantRow }, lastSignInAt] = await Promise.all([
    supabase.from('vc_tenants').select('name').eq('id', profile.tenant_id).maybeSingle(),
    getLastSignInAt(profile.user_id),
  ]);

  const tenantName = (tenantRow as { name?: string } | null)?.name?.trim() || profile.tenant_id;

  return (
    <TooltipProvider>
      <div className="w-full max-w-none space-y-6">
        <section className={cn(dsCard.base, 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between')}>
          <div className="flex items-center gap-4">
            <UserAvatar name={profile.full_name} email={profile.email} size="lg" />
            <div className="min-w-0">
              <h1 className={dsType.pageTitle}>My Profile</h1>
              <p className="mt-1 truncate text-sm text-gray-600">{profile.email}</p>
              <span className={cn('mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', roleBadgeClass(profile.role))}>
                {roleDisplayLabel(profile.role)}
              </span>
            </div>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button type="button" disabled>
                  Edit profile
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="space-y-6 xl:col-span-2">
            <article className={dsCard.base}>
              <h2 className={cn(dsType.sectionTitle, 'mb-4')}>Identity</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Full name</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                    <User2 className="h-4 w-4 text-gray-400" />
                    {profile.full_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {profile.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</dt>
                  <dd className="mt-1">
                    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', roleBadgeClass(profile.role))}>
                      {roleDisplayLabel(profile.role)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tenant</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    {tenantName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last sign-in</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDateTime(lastSignInAt)}</dd>
                </div>
              </dl>
            </article>

            <article className={dsCard.base}>
              <h2 className={cn(dsType.sectionTitle, 'mb-1')}>Preferences</h2>
              <p className="mb-4 text-xs text-gray-400">Notification and display preferences</p>
              <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
                <p className="text-sm text-gray-400">Preference settings coming soon</p>
              </div>
            </article>
          </section>

          <aside className="space-y-6">
            <article className={dsCard.base}>
              <h2 className={cn(dsType.sectionTitle, 'mb-4')}>Security</h2>
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                    <rect x="1" y="1" width="10" height="10" fill="#f25022" />
                    <rect x="13" y="1" width="10" height="10" fill="#7fba00" />
                    <rect x="1" y="13" width="10" height="10" fill="#00a4ef" />
                    <rect x="13" y="13" width="10" height="10" fill="#ffb900" />
                  </svg>
                  Signed in via Microsoft Entra ID
                </div>

                <div>
                  <Button asChild variant="outline" className="w-full justify-center">
                    <Link href="https://mysignins.microsoft.com/" target="_blank" rel="noreferrer">
                      Manage password
                    </Link>
                  </Button>
                  <p className="mt-2 text-xs text-gray-500">
                    Password and account security are managed in Microsoft Entra ID.
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">Active sessions</p>
                  <p className="text-gray-500">Not available</p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <ShieldCheck className="mr-1 inline h-4 w-4" />
                  Edit profile controls are scaffolded and read-only in this release.
                </div>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
