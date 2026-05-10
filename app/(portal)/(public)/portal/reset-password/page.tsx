'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { PortalAuthLockIcon } from '@/components/portal/PortalAuthIcons';
import { PORTAL_TEAL_BTN, PortalAuthGlassCard, PortalAuthLayout } from '@/components/portal/PortalAuthLayout';
import { assertPasswordStrength } from '@/lib/portal/password';

const INPUT_CLASS =
  'h-11 w-full rounded-[10px] border border-[rgba(180,186,210,0.6)] bg-white/70 pl-10 pr-3 text-[14px] text-[#0f1c3a] outline-none transition-shadow placeholder:text-[#9aa3b8] focus-visible:ring-2 focus-visible:ring-[color:var(--portal-focus-accent,#00A99D)] focus-visible:ring-offset-1';

function ExternalPortalBadge() {
  return (
    <span className="mb-3 inline-flex rounded-full border border-[#00A99D]/20 bg-[#00A99D]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#00A99D]">
      External Portal
    </span>
  );
}

function strengthScore(password: string): number {
  let s = 0;
  if (password.length >= 8) s += 1;
  if (/[A-Z]/.test(password)) s += 1;
  if (/[0-9]/.test(password)) s += 1;
  if (password.length >= 12) s += 1;
  return Math.min(s, 3);
}

function strengthLabel(score: number): string {
  if (score <= 0) return 'Strength: —';
  if (score === 1) return 'Strength: Weak';
  if (score === 2) return 'Strength: Fair';
  return 'Strength: Strong';
}

function CheckIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#00A99D]">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const bars = useMemo(() => strengthScore(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Invalid reset link.');
      return;
    }
    const chk = assertPasswordStrength(password);
    if (!chk.ok) {
      setError(chk.message);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/portal/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? 'Could not reset password.');
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <PortalAuthLayout>
        <PortalAuthGlassCard>
          <ExternalPortalBadge />
          <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Set new password</h2>
          <p className="mt-1.5 text-[13px] text-[#6b7494]">Choose a strong password for your account</p>
          <p className="mt-6 text-[13px] text-red-700">Invalid reset link.</p>
          <Link href="/portal/login" className="mt-6 inline-block text-[14px] font-medium text-[#00A99D] hover:underline">
            Back to sign in
          </Link>
          <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
            Fund Manager Portal · Development Bank of Jamaica
          </p>
        </PortalAuthGlassCard>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout>
      <PortalAuthGlassCard>
        <ExternalPortalBadge />
        <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Set new password</h2>
        <p className="mt-1.5 text-[13px] text-[#6b7494]">Choose a strong password for your account</p>

        {done ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <CheckIcon />
            <p className="mt-4 text-[16px] font-semibold text-[#0f1c3a]">Password updated</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6b7494]">You can now sign in with your new password.</p>
            <Link
              href="/portal/login"
              className="mt-6 flex h-[46px] w-full max-w-none items-center justify-center rounded-[11px] text-[14.5px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md md:max-w-full"
              style={{ background: PORTAL_TEAL_BTN }}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            {error ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p>
            ) : null}
            <div>
              <label htmlFor="portal-reset-password" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                New password
              </label>
              <div className="relative">
                <PortalAuthLockIcon />
                <input
                  id="portal-reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full ${bars > i ? 'bg-[#00A99D]' : 'bg-[rgba(180,186,210,0.5)]'}`} />
                  ))}
                </div>
                <p className="text-[11px] text-[#8690a8]">{strengthLabel(bars)}</p>
              </div>
            </div>
            <div>
              <label htmlFor="portal-reset-confirm" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                Confirm password
              </label>
              <div className="relative">
                <PortalAuthLockIcon />
                <input
                  id="portal-reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 h-[46px] w-full rounded-[11px] text-[14.5px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
              style={{ background: PORTAL_TEAL_BTN }}
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
          Fund Manager Portal · Development Bank of Jamaica
        </p>
      </PortalAuthGlassCard>
    </PortalAuthLayout>
  );
}

export default function PortalResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#0B1F45]" aria-hidden />}>
      <ResetInner />
    </Suspense>
  );
}
