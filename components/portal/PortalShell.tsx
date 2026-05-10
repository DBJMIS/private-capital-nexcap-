'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useCallback, useState } from 'react';

import { TopBar } from '@/components/layout/TopBar';
import { cn } from '@/lib/utils';
import { dsLayout } from '@/components/ui/design-system';

export type PortalShellUser = {
  full_name: string;
  email?: string | null;
  role?: string | null;
};

export type PortalShellProps = {
  user: PortalShellUser;
  children: React.ReactNode;
};

const NAV = [
  {
    label: 'My Funds',
    href: '/portal',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <path fill="currentColor" opacity={0.9} d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" />
      </svg>
    ),
  },
] as const;

function navActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-3" aria-label="Portal navigation">
      {NAV.map((item) => {
        const active = navActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onNavigate?.()}
            className={cn(
              'mx-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <span className={cn('flex shrink-0 items-center text-gray-400 [&_svg]:text-[inherit]', active && 'text-gray-700')}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarChrome({
  pathname,
  user,
  variant,
  onNavigate,
}: {
  pathname: string;
  user: PortalShellUser;
  variant: 'sidebar' | 'drawer';
  onNavigate?: () => void;
}) {
  const emailDisplay = user.email?.trim() || '';
  const nameDisplay = user.full_name.trim() || emailDisplay || 'Guest';

  return (
    <>
      <div className="border-b border-gray-100 px-4 py-4">
        <Link href="/portal" className="inline-flex" aria-label="Home">
          <Image
            src="/nexcap-logo.png"
            alt="NexCap"
            width={180}
            height={48}
            className="h-auto w-auto max-w-[180px] object-contain object-left"
            style={{ width: 'auto', height: 'auto' }}
            priority={variant === 'sidebar'}
          />
        </Link>
        <p className="mt-0.5 text-xs text-gray-400">Fund Manager Portal</p>
      </div>
      <div className="border-b border-gray-100" />
      <SidebarNavLinks pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto border-t border-gray-100 px-4 py-3">
        <p className="truncate text-sm font-medium text-gray-700">{nameDisplay}</p>
        {emailDisplay ? <p className="mt-1 truncate text-xs text-gray-400">{emailDisplay}</p> : null}
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/portal/login' })}
          className="mt-4 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </div>
    </>
  );
}

export function PortalShell({ user, children }: PortalShellProps) {
  const pathname = usePathname() ?? '';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const topBarUser = {
    name: user.full_name.trim() || user.email?.trim() || 'User',
    email: user.email?.trim() ?? '',
    role: user.role ?? 'fund_manager',
  };

  return (
    <div className={cn('flex h-screen overflow-hidden', dsLayout.pageBg)}>
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-[220px] flex-col border-r border-gray-200 bg-white lg:flex">
        <SidebarChrome pathname={pathname} user={user} variant="sidebar" />
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!drawerOpen}
        onClick={closeDrawer}
      />
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-out lg:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-end px-2 pt-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
            aria-label="Close menu"
            onClick={closeDrawer}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <SidebarChrome pathname={pathname} user={user} variant="drawer" onNavigate={closeDrawer} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:ml-[220px]">
        <TopBar
          user={topBarUser}
          signOutRedirectUrl="/portal/login"
          profileHref="/portal/profile"
          leadingSlot={
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          }
        />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[#F9FAFB]">
          <div className="w-full p-4 md:p-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
