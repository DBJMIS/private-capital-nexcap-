'use client';

import type { CSSProperties } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';

const WALLPAPERS = [
  {
    src: '/05-Orange_LM-4K.png',
    accent: '#d4620a',
    btn: 'linear-gradient(135deg, #7a2e06, #c45417)',
    fallback: '#d4a882',
  },
  {
    src: '/02-Green_Blue_LM-4K.png',
    accent: '#2a7a4a',
    btn: 'linear-gradient(135deg, #0f4a2a, #1e7a44)',
    fallback: '#9bbfb0',
  },
  {
    src: '/01-Purple_LM-4K.png',
    accent: '#5b3fa8',
    btn: 'linear-gradient(135deg, #2a1560, #5b3fa8)',
    fallback: '#a89cc8',
  },
  {
    src: '/04-Pink_Orange_LM-4K.png',
    accent: '#c4365a',
    btn: 'linear-gradient(135deg, #7a1830, #c4365a)',
    fallback: '#d4a0a8',
  },
  {
    src: '/03-Blue_Purple_LM-4K.png',
    accent: '#2e5ec4',
    btn: 'linear-gradient(135deg, #0f2a7a, #2e5ec4)',
    fallback: '#9aaed4',
  },
  {
    src: '/06-Yellow_LM-4K.png',
    accent: '#b57a10',
    btn: 'linear-gradient(135deg, #6a4206, #b57a10)',
    fallback: '#d4c090',
  },
];

const HEADLINES = [
  {
    h: "Where Jamaica's private capital pipeline begins.",
    s: 'DBJ NexCap — VC & Private Capital Fund Management.',
  },
  {
    h: 'Evaluate. Score. Commit.',
    s: "End-to-end due diligence for Jamaica's emerging fund managers.",
  },
  {
    h: 'From call for proposals to capital commitment.',
    s: 'Manage the full fund selection lifecycle in one place.',
  },
  {
    h: 'AI-assisted due diligence, human-led decisions.',
    s: "Structured scoring against DBJ's weighted investment rubric.",
  },
  {
    h: 'Portfolio monitoring starts the moment you commit.',
    s: 'Capital calls, distributions, and compliance — all tracked.',
  },
  {
    h: 'Rigorous. Transparent. Built for DBJ.',
    s: 'A purpose-built platform for private capital deployment.',
  },
];

function resolveCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/dashboard';
}

function resolveAuthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'Configuration':
      return 'There is a problem with the server configuration.';
    case 'AccessDenied':
      return 'Access was denied. You may not have permission to use this application.';
    case 'Verification':
      return 'The verification token has expired or has already been used.';
    default:
      return 'Sign in failed. Please try again.';
  }
}

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => resolveCallbackUrl(searchParams.get('callbackUrl')),
    [searchParams],
  );
  const errorMessage = useMemo(
    () => resolveAuthErrorMessage(searchParams.get('error')),
    [searchParams],
  );
  const inviteNotice = searchParams.get('notice') === 'invite_ok';

  const [current, setCurrent] = useState(0);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const schedule = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % WALLPAPERS.length);
    }, 4500);
  }, []);

  useEffect(() => {
    schedule();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [schedule]);

  const goTo = useCallback(
    (i: number) => {
      setCurrent(i);
      schedule();
    },
    [schedule],
  );

  const accent = WALLPAPERS[current].accent;
  const btnGradient = WALLPAPERS[current].btn;

  const handleMicrosoftSso = useCallback(() => {
    void signIn('azure-ad', { callbackUrl });
  }, [callbackUrl]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <div className="pointer-events-none absolute inset-0 z-0">
        {WALLPAPERS.map((w, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url('${w.src}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              backgroundColor: w.fallback,
              opacity: i === current ? 1 : 0,
              transition: 'opacity 1800ms ease-in-out',
              zIndex: 0,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 z-10 bg-gradient-to-br from-black/10 to-black/25" />

      <div className="pointer-events-none absolute right-16 top-10 z-[25]">
        <Image
          src="/vc_logo-bg.png"
          alt="NexCap — Capital Management Platform"
          width={240}
          height={40}
          className="h-9 w-auto max-w-[200px] object-contain object-right drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] md:h-10 md:max-w-[240px]"
          priority
        />
      </div>

      <div className="relative z-20 flex w-full min-h-screen items-center justify-end px-16 py-10">
        <div
          className="pointer-events-none absolute bottom-10 left-16 top-10 z-20 flex flex-col justify-between"
          style={{ right: 'calc(380px + 4.5rem)' }}
        >
          <div className="pointer-events-auto flex items-center gap-3">
            <Image
              src="/circle%20logo.png"
              alt="NexCap"
              width={44}
              height={44}
              className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] md:h-11 md:w-11"
            />
          </div>

          <div className="pointer-events-auto">
            <div key={current} className="animate-fadeIn max-w-2xl">
              <h1 className="text-[28px] font-bold leading-snug tracking-tight text-white md:text-[32px]">
                {HEADLINES[current].h}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/75 md:text-base">{HEADLINES[current].s}</p>
            </div>
            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {WALLPAPERS.map((_, i) => (
                  <button
                    key={WALLPAPERS[i].src}
                    type="button"
                    aria-label={`Wallpaper ${i + 1}`}
                    onClick={() => goTo(i)}
                    className={
                      i === current
                        ? 'h-2 w-5 shrink-0 rounded-[3px] bg-white/90 transition-all'
                        : 'h-1.5 w-1.5 shrink-0 rounded-full bg-white/35 transition-all hover:bg-white/55'
                    }
                  />
                ))}
              </div>
              <span className="text-[13px] tabular-nums text-white/50">
                {current + 1} / 6
              </span>
            </div>
          </div>
        </div>

        <div
          className="relative z-30 w-full max-w-[380px] shrink-0 rounded-[20px] border border-white/60 px-8 pb-8 pt-9 shadow-[0_24px_64px_rgba(0,0,0,0.18)] backdrop-blur-[28px] backdrop-saturate-[180%]"
          style={{
            background: 'rgba(255,255,255,0.82)',
          }}
        >
          <div
            className="mb-6"
            style={
              {
                ['--login-accent' as string]: accent,
              } as CSSProperties
            }
          >
            <h2 className="text-[22px] font-bold leading-tight text-[#0f1c3a]">Welcome back</h2>
            <p className="mt-1.5 text-[13px] text-[#6b7494]">Sign in to your DBJ account</p>
          </div>

          {inviteNotice ? (
            <p className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              Your invitation was accepted. Sign in once more with Microsoft to refresh your access.
            </p>
          ) : null}
          {errorMessage ? (
            <p
              className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {inviteNotice ? (
            <p className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              Your invitation was accepted. Sign in once more with Microsoft to refresh your access.
            </p>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleMicrosoftSso();
            }}
          >
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa3b8]"
                  aria-hidden
                />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[rgba(180,186,210,0.6)] bg-white/70 pl-10 pr-3 text-[14px] text-[#0f1c3a] outline-none transition-shadow placeholder:text-[#9aa3b8] focus-visible:ring-2 focus-visible:ring-[color:var(--login-accent)] focus-visible:ring-offset-1"
                  style={
                    {
                      ['--login-accent' as string]: accent,
                    } as CSSProperties
                  }
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-[#8690a8]"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa3b8]"
                  aria-hidden
                />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[rgba(180,186,210,0.6)] bg-white/70 pl-10 pr-3 text-[14px] text-[#0f1c3a] outline-none transition-shadow placeholder:text-[#9aa3b8] focus-visible:ring-2 focus-visible:ring-[color:var(--login-accent)] focus-visible:ring-offset-1"
                  style={
                    {
                      ['--login-accent' as string]: accent,
                    } as CSSProperties
                  }
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-[#6b7494]">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[rgba(180,186,210,0.8)] text-[#0B1F45] focus:ring-[color:var(--login-accent)]"
                  style={
                    {
                      ['--login-accent' as string]: accent,
                    } as CSSProperties
                  }
                />
                Keep me signed in
              </label>
              <a
                href="#"
                className="text-[12.5px] font-medium hover:underline"
                style={{ color: accent }}
                onClick={(e) => e.preventDefault()}
              >
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              className="mt-1 h-[46px] w-full rounded-[11px] text-[14.5px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md active:translate-y-0"
              style={{ background: btnGradient }}
            >
              Sign in
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(180,186,210,0.45)]" />
            <span className="whitespace-nowrap text-[11.5px] font-medium uppercase tracking-wide text-[#9aa3b8]">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-[rgba(180,186,210,0.45)]" />
          </div>

          <button
            type="button"
            onClick={handleMicrosoftSso}
            className="flex h-[42px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-[rgba(180,186,210,0.5)] bg-white/65 text-[14px] font-medium text-[#0f1c3a] transition-colors hover:bg-white/80"
          >
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Continue with Microsoft
          </button>

          <p className="mt-8 text-center text-[11.5px] leading-relaxed text-[#9aa3b8]">
            Protected by DBJ Single Sign-On · IT Governance Policy
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#0B1F45]" aria-hidden />}>
      <LoginContent />
    </Suspense>
  );
}
