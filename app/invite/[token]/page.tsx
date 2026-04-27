import Link from 'next/link';
import { redirect } from 'next/navigation';

import { InviteTokenClient } from '@/components/invite/InviteTokenClient';
import { createServerClient } from '@/lib/supabase/server';
import { landingPathForInviteRole } from '@/lib/invitations/invite-landing';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvitePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;
  const err = typeof sp.error === 'string' ? sp.error : null;
  const supabase = createServerClient();
  const { data: inv, error } = await supabase.from('vc_invitations').select('*').eq('token', token).maybeSingle();

  if (error || !inv) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3F4F6] px-6">
        <p className="text-lg font-medium text-[#0B1F45]">Invalid invitation link</p>
        <Link href="/login" className="mt-4 text-sm text-[#0F8A6E] underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const row = inv as {
    status: string;
    token_expires_at: string;
    full_name: string;
    role: string;
    email: string;
  };

  if (row.status === 'accepted') {
    redirect(landingPathForInviteRole(row.role));
  }

  if (row.status === 'revoked') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3F4F6] px-6 text-center">
        <p className="text-lg font-medium text-[#0B1F45]">This invitation has been revoked</p>
        <p className="mt-2 text-sm text-gray-500">Contact your IT Administrator if you need a new invitation.</p>
        <Link href="/login" className="mt-6 text-sm text-[#0F8A6E] underline">
          Sign in
        </Link>
      </div>
    );
  }

  const exp = new Date(row.token_expires_at).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3F4F6] px-6 text-center">
        <p className="text-lg font-medium text-[#0B1F45]">This invitation has expired</p>
        <p className="mt-2 text-sm text-gray-500">Contact your IT Administrator to request a new invitation.</p>
        <Link href="/login" className="mt-6 text-sm text-[#0F8A6E] underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <InviteTokenClient
      token={token}
      fullName={row.full_name}
      role={row.role}
      email={row.email}
      errorCode={err}
    />
  );
}
