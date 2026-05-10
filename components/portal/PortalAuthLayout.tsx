'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export const PORTAL_TEAL_BTN =
  'linear-gradient(135deg, #007a72, #00A99D)' as const;

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
] as const;

const HEADLINES = [
  {
    h: "Your gateway to DBJ's investment portfolio.",
    s: 'Manage reporting, compliance, and capital calls in one place.',
  },
  {
    h: 'Quarterly reports. Capital calls. All in one place.',
    s: 'Submit directly to DBJ without the back-and-forth emails.',
  },
  {
    h: 'Stay compliant. Stay connected.',
    s: 'Track your obligations and deadlines with DBJ in real time.',
  },
  {
    h: 'Your fund. Your portal. Your relationship with DBJ.',
    s: "Purpose-built for Jamaica's private capital fund managers.",
  },
  {
    h: 'From due diligence to distributions.',
    s: 'Every stage of your DBJ relationship managed digitally.',
  },
  {
    h: 'Built for fund managers. Backed by DBJ.',
    s: 'Secure, structured, and always up to date.',
  },
] as const;

export interface PortalAuthLayoutProps {
  children: React.ReactNode;
}

/** Glass panel — teal focus ring vars for portal inputs */
export function PortalAuthGlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative z-30 mx-4 w-full max-w-[380px] shrink-0 rounded-[20px] border border-white/60 px-8 pb-8 pt-9 shadow-[0_24px_64px_rgba(0,0,0,0.18)] backdrop-blur-[28px] backdrop-saturate-[180%] md:mx-0"
      style={{
        background: 'rgba(255,255,255,0.82)',
        ['--portal-focus-accent' as string]: '#00A99D',
      }}
    >
      {children}
    </div>
  );
}

/** Shared wallpaper + overlay + logos + portal hero — children = glass card */
export function PortalAuthLayout({ children }: PortalAuthLayoutProps) {
  const [current, setCurrent] = useState(0);
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

      <div className="pointer-events-none absolute right-4 top-6 z-[25] md:right-16 md:top-10">
        <Image
          src="/vc_logo-bg.png"
          alt="NexCap — Capital Management Platform"
          width={240}
          height={40}
          className="h-9 w-auto max-w-[200px] object-contain object-right drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] md:h-10 md:max-w-[240px]"
          priority
        />
      </div>

      <div className="relative z-20 flex w-full min-h-screen items-center justify-center px-4 py-10 md:justify-end md:px-16 md:py-10">
        <div className="pointer-events-none absolute bottom-10 left-4 top-10 z-20 hidden flex-col justify-between md:flex md:left-16" style={{ right: 'calc(380px + 4.5rem)' }}>
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
              <h1 className="text-[28px] font-bold leading-snug tracking-tight text-white md:text-[32px]">{HEADLINES[current].h}</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/75 md:text-base">{HEADLINES[current].s}</p>
            </div>
            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {WALLPAPERS.map((_w, i) => (
                  <button
                    key={_w.src}
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

        {children}
      </div>
    </div>
  );
}
