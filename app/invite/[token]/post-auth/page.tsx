import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth-options';
import { acceptInvitationForSession } from '@/lib/invitations/accept-invitation';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ token: string }> };

export default async function InvitePostAuthPage({ params }: PageProps) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}/post-auth`)}`);
  }

  const supabase = createServerClient();
  const result = await acceptInvitationForSession(supabase, {
    token,
    email: session.user.email,
    fullNameFromSession: session.user.full_name ?? session.user.name ?? session.user.email,
    azureUserId: session.user.user_id ?? session.user.id,
  });

  if (!result.ok) {
    const q = new URLSearchParams();
    q.set('error', result.code);
    redirect(`/invite/${encodeURIComponent(token)}?${q.toString()}`);
  }

  /** JWT role is minted at sign-in; one more SSO picks up `vc_user_roles` after acceptance. */
  const q = new URLSearchParams();
  q.set('notice', 'invite_ok');
  q.set('callbackUrl', result.redirect);
  redirect(`/login?${q.toString()}`);
}
