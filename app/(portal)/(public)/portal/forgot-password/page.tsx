'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';

import { PortalAuthMailIcon } from '@/components/portal/PortalAuthIcons';
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

function CheckIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#00A99D]">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ForgotInner() {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const norm = email.trim().toLowerCase();
    try {
      const res = await fetch('/api/portal/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: norm }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? 'Request failed.');
        setBusy(false);
        return;
      }
      setSubmittedEmail(norm);
      setDone(true);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalAuthLayout>
      <PortalAuthGlassCard>
        <ExternalPortalBadge />
        <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Reset your password</h2>
        <p className="mt-1.5 text-[13px] text-[#6b7494]">Enter your email to receive a reset link</p>

        {done ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <CheckIcon />
            <p className="mt-4 text-[16px] font-semibold text-[#0f1c3a]">Check your inbox</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6b7494]">
              We&apos;ve sent a password reset link to {submittedEmail}. The link expires in 1 hour.
            </p>
            <Link href="/portal/login" className="mt-6 text-[14px] font-medium text-[#00A99D] hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            {error ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <div>
              <label htmlFor="portal-forgot-email" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                Email address
              </label>
              <div className="relative">
                <PortalAuthMailIcon />
                <input
                  id="portal-forgot-email"
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
            <button
              type="submit"
              disabled={busy}
              className="mt-1 h-[46px] w-full rounded-[11px] text-[14.5px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
              style={{ background: PORTAL_TEAL_BTN }}
            >
              {busy ? 'Sending…' : 'Send reset link'}
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

export default function PortalForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#0B1F45]" aria-hidden />}>
      <ForgotInner />
    </Suspense>
  );
}
