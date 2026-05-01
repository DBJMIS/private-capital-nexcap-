'use client';

import Image from 'next/image';
import { signIn } from 'next-auth/react';

import { AccessPreviewBlock } from '@/components/settings/RoleAccessBlocks';
import { roleDisplayLabel } from '@/lib/settings/role-visual';
import { Button } from '@/components/ui/button';

type Props = {
  token: string;
  fullName: string;
  role: string;
  email: string;
  errorCode?: string | null;
};

function errorMessage(code: string | null | undefined, email: string) {
  if (code === 'email_mismatch') {
    return `Please sign in with ${email} to accept this invitation.`;
  }
  if (code === 'expired') return 'This invitation has expired.';
  if (code === 'revoked') return 'This invitation has been revoked.';
  if (code) return 'We could not complete the invitation. Please contact your IT Administrator.';
  return null;
}

export function InviteTokenClient({ token, fullName, role, email, errorCode }: Props) {
  const callbackUrl = `/invite/${encodeURIComponent(token)}/post-auth`;

  const errMsg = errorMessage(errorCode, email);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3F4F6] px-6 py-12">
      <Image
        src="/nexcap-logo.png"
        alt="DBJ"
        width={200}
        height={56}
        className="mb-8 h-auto max-h-10 w-auto"
        style={{ width: 'auto', height: 'auto' }}
        priority
      />
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {errMsg ? (
          <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errMsg}
          </p>
        ) : null}
        <h1 className="text-center text-xl font-bold text-[#0B1F45]">You&apos;ve been invited</h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Welcome, <span className="font-semibold text-[#0B1F45]">{fullName}</span>
        </p>
        <p className="mt-4 text-center text-sm text-gray-600">
          You&apos;ve been invited to join the DBJ Private Capital Management Platform as a{' '}
          <span className="font-semibold text-[#0B1F45]">{roleDisplayLabel(role)}</span>.
        </p>
        <AccessPreviewBlock role={role} />
        <Button
          type="button"
          className="mt-6 w-full bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90"
          onClick={() => void signIn('azure-ad', { callbackUrl })}
        >
          Sign in with Microsoft
        </Button>
        <p className="mt-3 text-center text-xs text-gray-400">Use {email} when signing in to accept this invitation.</p>
      </div>
    </div>
  );
}
