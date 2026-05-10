'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { PortalAuthLockIcon, PortalAuthMailIcon, PortalAuthUserIcon } from '@/components/portal/PortalAuthIcons';
import { PORTAL_TEAL_BTN, PortalAuthGlassCard, PortalAuthLayout } from '@/components/portal/PortalAuthLayout';
import { assertPasswordStrength } from '@/lib/portal/password';

const INPUT_CLASS =
  'h-11 w-full rounded-[10px] border border-[rgba(180,186,210,0.6)] bg-white/70 pl-10 pr-3 text-[14px] text-[#0f1c3a] outline-none transition-shadow placeholder:text-[#9aa3b8] focus-visible:ring-2 focus-visible:ring-[color:var(--portal-focus-accent,#00A99D)] focus-visible:ring-offset-1';

const READONLY_INPUT_CLASS =
  'h-11 w-full cursor-not-allowed rounded-[10px] border border-[rgba(180,186,210,0.6)] bg-[#f8f9fc] pl-10 pr-3 text-[14px] text-[#0f1c3a] outline-none';

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

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get('token')?.trim() ?? '';

  const [loading, setLoading] = useState(true);
  const [validErr, setValidErr] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState('');
  const [prefillFund, setPrefillFund] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tokenParam) {
      setValidErr('Invalid invitation link.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setValidErr(null);
    setAlreadyRegistered(false);
    try {
      const res = await fetch(`/api/portal/register?token=${encodeURIComponent(tokenParam)}`);
      const data = (await res.json()) as {
        valid?: boolean;
        reason?: string;
        message?: string;
        email?: string;
        full_name?: string;
        fund_name?: string | null;
      };
      if (!data.valid) {
        if (data.reason === 'already_registered') {
          setAlreadyRegistered(true);
          setValidErr(
            typeof data.message === 'string'
              ? data.message
              : 'This invitation has already been used. Please sign in instead.',
          );
        } else {
          setValidErr(
            data.reason === 'expired'
              ? 'This invitation has expired. Contact DBJ to request a new invitation.'
              : 'This invitation link is invalid. Contact DBJ to request a new invitation.',
          );
        }
        setLoading(false);
        return;
      }
      setPrefillEmail(data.email ?? '');
      setFullName(data.full_name ?? '');
      setPrefillFund(typeof data.fund_name === 'string' ? data.fund_name : null);
    } catch {
      setValidErr('Could not load invitation. Contact DBJ to request a new invitation.');
    } finally {
      setLoading(false);
    }
  }, [tokenParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const strengthBars = useMemo(() => strengthScore(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    const check = assertPasswordStrength(password);
    if (!check.ok) {
      setSubmitErr(check.message);
      return;
    }
    if (password !== confirmPassword) {
      setSubmitErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenParam,
          full_name: fullName.trim(),
          password,
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      let apiMessage: string | null = null;
      if (body && typeof body === 'object' && 'message' in body) {
        const m = (body as { message: unknown }).message;
        if (typeof m === 'string' && m.trim().length > 0) apiMessage = m.trim();
      }
      if (!res.ok) {
        setSubmitErr(apiMessage ?? `Registration failed (${res.status}).`);
        setBusy(false);
        return;
      }
      router.replace('/portal?welcome=1');
      router.refresh();
    } catch {
      setSubmitErr('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const subtitle =
    typeof prefillFund === 'string' && prefillFund.trim().length > 0
      ? `NexCap onboarding · ${prefillFund.trim()}`
      : 'NexCap onboarding';

  return (
    <PortalAuthLayout>
      <PortalAuthGlassCard>
        {loading ? <p className="text-[13px] text-[#6b7494]">Validating invitation…</p> : null}
        {!loading && validErr && alreadyRegistered ? (
          <>
            <ExternalPortalBadge />
            <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Create your account</h2>
            <p className="mt-1.5 text-[13px] text-[#6b7494]">{subtitle}</p>
            <p className="mt-6 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">{validErr}</p>
            <div className="mt-6 text-center">
              <Link
                href="/portal/login"
                className="inline-flex h-[46px] w-full items-center justify-center rounded-[11px] bg-[#00A99D] px-4 text-[14.5px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
              Fund Manager Portal · Development Bank of Jamaica
            </p>
          </>
        ) : null}
        {!loading && validErr && !alreadyRegistered ? (
          <>
            <ExternalPortalBadge />
            <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Create your account</h2>
            <p className="mt-1.5 text-[13px] text-[#6b7494]">{subtitle}</p>
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-900">{validErr}</p>
            <div className="mt-8 text-center">
              <Link href="/portal/login" className="text-[12.5px] font-medium text-[#00A99D] hover:underline">
                Back to sign in
              </Link>
            </div>
            <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
              Fund Manager Portal · Development Bank of Jamaica
            </p>
          </>
        ) : null}
        {!loading && !validErr ? (
          <>
            <ExternalPortalBadge />
            <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Create your account</h2>
            <p className="mt-1.5 text-[13px] text-[#6b7494]">{subtitle}</p>

            {prefillFund?.trim() ? (
              <>
                <div className="mt-6">
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">Invited to join</p>
                  <p className="mt-1 text-[14px] font-medium text-[#0f1c3a]">{prefillFund.trim()}</p>
                </div>
                <hr className="my-6 border-0 border-t border-[rgba(180,186,210,0.45)]" />
              </>
            ) : null}

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className={prefillFund?.trim() ? 'space-y-4' : 'mt-6 space-y-4'}
            >
              {submitErr ? (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-800">{submitErr}</p>
              ) : null}
              <div>
                <label htmlFor="portal-reg-name" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                  Full name
                </label>
                <div className="relative">
                  <PortalAuthUserIcon />
                  <input
                    id="portal-reg-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="portal-reg-email" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                  Email
                </label>
                <div className="relative">
                  <PortalAuthMailIcon />
                  <input
                    id="portal-reg-email"
                    type="email"
                    autoComplete="email"
                    required
                    readOnly
                    value={prefillEmail}
                    className={READONLY_INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="portal-reg-password" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                  Password
                </label>
                <div className="relative">
                  <PortalAuthLockIcon />
                  <input
                    id="portal-reg-password"
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
                      <div key={i} className={`h-1 flex-1 rounded-full ${strengthBars > i ? 'bg-[#00A99D]' : 'bg-[rgba(180,186,210,0.5)]'}`} />
                    ))}
                  </div>
                  <p className="text-[11px] text-[#8690a8]">{strengthLabel(strengthBars)}</p>
                </div>
              </div>
              <div>
                <label htmlFor="portal-reg-confirm" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]">
                  Confirm password
                </label>
                <div className="relative">
                  <PortalAuthLockIcon />
                  <input
                    id="portal-reg-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                {busy ? 'Creating…' : 'Create account'}
              </button>
            </form>
            <p className="mt-6 text-center text-[12.5px] text-[#6b7494]">
              Already have an account?{' '}
              <Link href="/portal/login" className="font-medium text-[#00A99D] hover:underline">
                Sign in
              </Link>
            </p>
            <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
              Fund Manager Portal · Development Bank of Jamaica
            </p>
          </>
        ) : null}
      </PortalAuthGlassCard>
    </PortalAuthLayout>
  );
}

export default function PortalRegisterPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#0B1F45]" aria-hidden />}>
      <RegisterInner />
    </Suspense>
  );
}
