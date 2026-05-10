'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { TopBar } from '@/components/layout/TopBar';
import { cn } from '@/lib/utils';
import { dsLayout } from '@/components/ui/design-system';
import type { PortalDashboardFundEntry } from '@/types/portal-dashboard';

const TABLER_ICONS_CSS =
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.26.0/dist/tabler-icons.min.css';

type FundWorkspaceResponse = Pick<
  PortalDashboardFundEntry,
  'application' | 'portfolio_fund' | 'stage' | 'is_direct_portfolio'
>;

export interface FundPortalShellProps {
  applicationId: string;
  userId: string;
  children: React.ReactNode;
}

type NavItem = { label: string; href: string; icon: string; locked?: boolean };

function isNavActive(pathname: string, href: string, applicationId: string): boolean {
  const fundRoot = `/portal/funds/${applicationId}`;
  if (href === fundRoot) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function stageBadge(stage: 'onboarding' | 'portfolio') {
  if (stage === 'portfolio') return 'bg-teal-50 text-teal-700 border border-teal-100';
  return 'bg-blue-50 text-blue-700 border border-blue-100';
}

function SidebarUserFooter() {
  const { data: session } = useSession();
  const displayName = session?.user?.name?.trim() ? session.user.name.trim() : 'Fund Manager';
  const email = session?.user?.email?.trim();

  return (
    <div style={{ marginTop: 'auto' }}>
      <div
        style={{
          borderTop: '0.5px solid #E5E7EB',
          padding: '12px 16px',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#111827',
            marginBottom: 2,
          }}
        >
          {displayName}
        </div>
        {email ? (
          <div
            style={{
              fontSize: 11,
              color: '#9CA3AF',
              marginBottom: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {email}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/portal/login' })}
          style={{
            fontSize: 12,
            color: '#6B7280',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <i className="ti ti-logout" style={{ fontSize: 14 }} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function FundPortalShell({ applicationId, userId: _userId, children }: FundPortalShellProps) {
  const pathname = usePathname() ?? '';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fund, setFund] = useState<FundWorkspaceResponse | null>(null);

  useEffect(() => {
    const linkId = 'tabler-icons-webfont-fund-portal-shell';
    if (typeof document === 'undefined' || document.getElementById(linkId)) return;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = TABLER_ICONS_CSS;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    void fetch(`/api/portal/funds/${applicationId}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          setFund(null);
          return;
        }
        const j = (await r.json()) as FundWorkspaceResponse;
        setFund(j);
      })
      .catch(() => setFund(null));
  }, [applicationId]);

  const stage = fund?.stage ?? 'onboarding';
  const canUsePortfolio = stage === 'portfolio';
  const hideQuestionnaireNav = fund?.application == null;
  const fundDisplayName =
    fund?.portfolio_fund?.fund_name ?? fund?.application?.fund_name ?? `Fund ${applicationId.slice(0, 8)}`;
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const onboardingItems: NavItem[] = useMemo(() => {
    const overview = { label: 'Overview', href: `/portal/funds/${applicationId}`, icon: 'ti ti-layout-dashboard' } as const;
    if (hideQuestionnaireNav) {
      return [overview];
    }
    return [
      overview,
      { label: 'DD Questionnaire', href: `/portal/funds/${applicationId}/questionnaire`, icon: 'ti ti-file-description' },
    ];
  }, [applicationId, hideQuestionnaireNav]);
  const portfolioItems: NavItem[] = useMemo(
    () => [
      { label: 'Reports', href: `/portal/funds/${applicationId}/reports`, icon: 'ti ti-upload', locked: !canUsePortfolio },
      { label: 'Capital Calls', href: `/portal/funds/${applicationId}/capital-calls`, icon: 'ti ti-receipt', locked: !canUsePortfolio },
      { label: 'Documents', href: `/portal/funds/${applicationId}/documents`, icon: 'ti ti-folder', locked: !canUsePortfolio },
      { label: 'Compliance', href: `/portal/funds/${applicationId}/compliance`, icon: 'ti ti-shield-check', locked: !canUsePortfolio },
    ],
    [applicationId, canUsePortfolio],
  );

  const renderNavItem = (item: NavItem) => {
    const active = isNavActive(pathname, item.href, applicationId);
    const navIcon = (
      <i
        className={item.icon}
        style={{
          fontSize: 16,
          color: 'inherit',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    );
    if (item.locked) {
      return (
        <div
          key={item.href}
          title="Available after commitment"
          className="mx-2 flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-600 opacity-50 pointer-events-none"
        >
          <span className="flex items-center" style={{ gap: 8 }}>
            {navIcon}
            <span>{item.label}</span>
          </span>
          <i className="ti ti-lock" style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true" />
        </div>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeDrawer}
        className={cn(
          'mx-2 flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
          active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50',
        )}
        style={{ gap: 8 }}
      >
        {navIcon}
        <span>{item.label}</span>
      </Link>
    );
  };

  const topBarUser = {
    name: fundDisplayName,
    email: '',
    role: 'fund_manager',
  };

  return (
    <div className={cn('flex h-screen overflow-hidden', dsLayout.pageBg)}>
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-[220px] flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="border-b border-gray-100 px-4 py-4">
          <Link href="/portal" className="inline-flex" aria-label="NexCap">
            <Image
              src="/nexcap-logo.png"
              alt="NexCap"
              width={180}
              height={48}
              className="h-auto w-auto max-w-[180px] object-contain object-left"
              style={{ width: 'auto', height: 'auto' }}
              priority
            />
          </Link>
          <p className="mt-0.5 text-xs text-gray-400">Fund Manager Portal</p>
        </div>
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{fund ? fundDisplayName : 'Loading fund...'}</p>
          <p className="mt-1 text-xs text-gray-400">Viewing selected fund workspace</p>
          <span className={cn('mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium', stageBadge(stage))}>
            {stage === 'portfolio' ? 'Active Portfolio' : 'Onboarding'}
          </span>
          <Link href="/portal" className="mt-1 block text-xs text-gray-400 transition-colors duration-150 hover:text-teal-600">
            ← All Funds
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Onboarding</p>
          <div className="space-y-1">{onboardingItems.map(renderNavItem)}</div>
          <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Portfolio Management</p>
          <div className="space-y-1">{portfolioItems.map(renderNavItem)}</div>
        </div>
        <SidebarUserFooter />
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
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{fund ? fundDisplayName : 'Loading fund...'}</p>
          <p className="mt-1 text-xs text-gray-400">Viewing selected fund workspace</p>
          <span className={cn('mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium', stageBadge(stage))}>
            {stage === 'portfolio' ? 'Active Portfolio' : 'Onboarding'}
          </span>
          <Link
            href="/portal"
            onClick={closeDrawer}
            className="mt-1 block text-xs text-gray-400 transition-colors duration-150 hover:text-teal-600"
          >
            ← All Funds
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Onboarding</p>
          <div className="space-y-1">{onboardingItems.map(renderNavItem)}</div>
          <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Portfolio Management</p>
          <div className="space-y-1">{portfolioItems.map(renderNavItem)}</div>
        </div>
        <SidebarUserFooter />
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
