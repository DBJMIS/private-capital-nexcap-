'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';

import { PortalAuthLockIcon, PortalAuthMailIcon } from '@/components/portal/PortalAuthIcons';
import { PORTAL_TEAL_BTN, PortalAuthGlassCard, PortalAuthLayout } from '@/components/portal/PortalAuthLayout';

const INPUT_CLASS =
  'h-11 w-full rounded-[10px] border border-[rgba(180,186,210,0.6)] bg-white/70 pl-10 pr-3 text-[14px] text-[#0f1c3a] outline-none transition-shadow placeholder:text-[#9aa3b8] focus-visible:ring-2 focus-visible:ring-[color:var(--portal-focus-accent,#00A99D)] focus-visible:ring-offset-1';

function ExternalPortalBadge() {
  return (
    <span className="mb-3 inline-flex rounded-full border border-[#00A99D]/20 bg-[#00A99D]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#00A99D]">
      External Portal
    </span>
  );
}

function PortalLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, data: session } = useSession();
  const notice = searchParams.get('notice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'fund_manager') {
      router.replace('/portal');
    }
  }, [status, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        callbackUrl: '/portal',
        redirect: false,
      });
      if (res?.error) {
        setError('Could not sign in. Check your email and password.');
        setBusy(false);
        return;
      }
      router.push('/portal');
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const noticeBanner =
    notice === 'invite_ok'
      ? 'Your email was verified.'
      : notice === 'pwd_updated'
        ? 'Password updated — please sign in.'
        : null;

  return (
    <PortalAuthLayout>
      <PortalAuthGlassCard>
        <ExternalPortalBadge />
        <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Fund Manager Portal</h2>
        <p className="mt-1.5 text-[13px] text-[#6b7494]">Sign in to your NexCap account</p>

        {noticeBanner ? (
          <p className="mb-4 mt-6 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[13px] text-teal-900">{noticeBanner}</p>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <label htmlFor="portal-login-email" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
              Email address
            </label>
            <div className="relative">
              <PortalAuthMailIcon />
              <input
                id="portal-login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div>
            <label htmlFor="portal-login-password" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
              Password
            </label>
            <div className="relative">
              <PortalAuthLockIcon />
              <input
                id="portal-login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex justify-end pt-0.5">
            <Link href="/portal/forgot-password" className="text-[12.5px] font-medium hover:underline" style={{ color: '#00A99D' }}>
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-1 h-[46px] w-full rounded-[11px] text-[14.5px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
            style={{ background: PORTAL_TEAL_BTN }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-[12.5px] text-[#6b7494]">Don&apos;t have an account?</p>
        <p className="mt-1 text-center text-[12.5px] text-[#9aa3b8]">Contact DBJ to request access</p>

        <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
          Fund Manager Portal · Development Bank of Jamaica
        </p>
      </PortalAuthGlassCard>
    </PortalAuthLayout>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#0B1F45]" aria-hidden />}>
      <PortalLoginInner />
    </Suspense>
  );
}
