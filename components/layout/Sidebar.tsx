'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  BarChart2,
  Building2,
  Calendar,
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  LayoutDashboard,
  Megaphone,
  Settings,
  Shield,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { NavGroupDef } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export type SidebarUser = {
  name: string;
  email: string;
  role: string;
  allowedModules?: string[];
};

export type SidebarProps = {
  tenantName: string;
  user: SidebarUser;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  navGroups?: NavGroupDef[];
  watchlistCount?: number;
};

type OpenSection = 'portfolio' | 'pipeline' | 'operations' | null;

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  moduleId?: string;
  isSoon?: boolean;
};

const PORTFOLIO_ITEMS: NavItem[] = [
  { label: 'Portfolio Dashboard', href: '/portfolio', icon: LayoutDashboard, moduleId: 'portfolio_dashboard' },
  { label: 'Fund Monitoring', href: '/portfolio/funds', icon: Building2, moduleId: 'fund_monitoring' },
  { label: 'Reporting Calendar', href: '/portfolio/calendar', icon: Calendar, moduleId: 'reporting_calendar' },
  { label: 'Compliance', href: '/portfolio/compliance', icon: ShieldCheck, moduleId: 'compliance' },
  { label: 'Capital Calls', href: '/portfolio/capital-calls', icon: Banknote, moduleId: 'capital_calls' },
  { label: 'Distributions', href: '/portfolio/distributions', icon: TrendingUp, moduleId: 'distributions' },
  { label: 'Watchlist', href: '/portfolio/watchlist', icon: Eye, moduleId: 'watchlist' },
  { label: 'Divestment Summary', href: '/portfolio/divestment', icon: ArrowRightLeft, moduleId: 'divestment' },
  { label: 'Executive View', href: '/portfolio/executive', icon: BarChart2, moduleId: 'executive_view' },
];

const PIPELINE_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, moduleId: 'pipeline_dashboard' },
  { label: 'Calls for Proposals', href: '/cfp', icon: Megaphone, moduleId: 'cfp' },
  { label: 'Fund Applications', href: '/fund-applications', icon: FileText, moduleId: 'fund_applications' },
  { label: 'DD Questionnaires', href: '/dd-questionnaires', icon: ClipboardList, moduleId: 'dd_questionnaires' },
  { label: 'Assessments & Scoring', href: '/assessments', icon: Star, moduleId: 'assessments' },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings, moduleId: 'settings' },
  { label: 'Role Management', href: '/settings/roles', icon: Shield, moduleId: 'settings' },
  { label: 'User Management', href: '/settings/users', icon: Users, moduleId: 'user_management' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/portfolio') return pathname === '/portfolio';
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  // Exact only: /settings/roles and /settings/users are separate links; prefix match would highlight both Settings + child.
  if (href === '/settings') return pathname === '/settings';

  const prefixHrefs = new Set([
    '/portfolio/funds',
    '/portfolio/calendar',
    '/portfolio/compliance',
    '/portfolio/capital-calls',
    '/portfolio/distributions',
    '/portfolio/watchlist',
    '/portfolio/divestment',
    '/portfolio/executive',
    '/cfp',
    '/fund-applications',
    '/dd-questionnaires',
    '/assessments',
    '/settings/roles',
    '/settings/users',
  ]);

  if (prefixHrefs.has(href)) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href;
}

export function Sidebar({ user, collapsed: _collapsed, onToggleCollapsed: _onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname() ?? '';
  const role = user.role;
  const allowedModules = user.allowedModules ?? [];
  const canSeeAllModules = role === 'admin' || allowedModules.includes('*');
  const moduleAllowed = (moduleId?: string) => {
    if (!moduleId) return true;
    if (canSeeAllModules) return true;
    return allowedModules.includes(moduleId);
  };
  const [openSection, setOpenSection] = useState<OpenSection>('portfolio');
  const canManageUsers = role === 'admin' || role === 'it_admin';
  const canSeePortfolio = role === 'admin' || role === 'pctu_officer' || role === 'senior_management' || role === 'portfolio_manager';
  const canSeePipeline = role === 'admin' || role === 'investment_officer' || role === 'panel_member' || role === 'portfolio_manager';
  const canSeeOperations = role === 'admin' || role === 'it_admin';

  const visiblePortfolioItems = PORTFOLIO_ITEMS.filter((item) => {
    if (!canSeePortfolio) return false;
    if (!moduleAllowed(item.moduleId)) return false;
    if (role === 'senior_management') return item.href === '/portfolio/executive';
    return true;
  });
  const visiblePipelineItems = PIPELINE_ITEMS.filter((item) => {
    if (!canSeePipeline) return false;
    if (!moduleAllowed(item.moduleId)) return false;
    if (role === 'panel_member') return item.href === '/assessments';
    if (role === 'portfolio_manager') {
      return item.href === '/dashboard' || item.href === '/cfp' || item.href === '/fund-applications';
    }
    return true;
  });
  const visibleOperationsItems = OPERATIONS_ITEMS.filter((item) => {
    if (!canSeeOperations) return false;
    if (item.href === '/settings/roles') return role === 'admin' || role === 'it_admin';
    if (!moduleAllowed(item.moduleId)) return false;
    if (item.href === '/settings/users') return canManageUsers;
    return true;
  });

  const hasPortfolioNav = visiblePortfolioItems.length > 0;
  const hasPipelineNav = visiblePipelineItems.length > 0;
  const hasOperationsNav = visibleOperationsItems.length > 0;

  function pickDefaultOpenSection(): OpenSection {
    if (hasPortfolioNav) return 'portfolio';
    if (hasPipelineNav) return 'pipeline';
    if (hasOperationsNav) return 'operations';
    return null;
  }

  const toggle = (section: Exclude<OpenSection, null>) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  useEffect(() => {
    const saved = localStorage.getItem('vc_sidebar_open_section');
    if (saved === 'portfolio' && hasPortfolioNav) {
      setOpenSection('portfolio');
    } else if (saved === 'pipeline' && hasPipelineNav) {
      setOpenSection('pipeline');
    } else if (saved === 'operations' && hasOperationsNav) {
      setOpenSection('operations');
    } else {
      const next = pickDefaultOpenSection();
      if (next) setOpenSection(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount using initial visibility
  }, []);

  useEffect(() => {
    if (openSection) {
      localStorage.setItem('vc_sidebar_open_section', openSection);
    } else {
      localStorage.removeItem('vc_sidebar_open_section');
    }
  }, [openSection]);

  useEffect(() => {
    if (hasPortfolioNav && pathname.startsWith('/portfolio')) {
      setOpenSection('portfolio');
    } else if (hasOperationsNav && pathname.startsWith('/settings')) {
      setOpenSection('operations');
    } else if (pathname === '/' || pathname === '/dashboard') {
      const next = pickDefaultOpenSection();
      if (next) setOpenSection(next);
    } else if (
      hasPipelineNav &&
      (pathname.startsWith('/cfp') ||
        pathname.startsWith('/fund-applications') ||
        pathname.startsWith('/dd-questionnaires') ||
        pathname.startsWith('/assessments') ||
        (pathname.startsWith('/dashboard') && pathname !== '/dashboard'))
    ) {
      setOpenSection('pipeline');
    }
  }, [
    pathname,
    hasPortfolioNav,
    hasPipelineNav,
    hasOperationsNav,
  ]);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[240px] flex-col border-r border-[#E5E9F2] bg-[#FFFFFF]">
      <div className="border-b border-[#E5E9F2] px-4 py-3">
        <Link href="/dashboard" className="inline-flex" aria-label="Home">
          <Image
            src="/nexcap-logo.png"
            alt="NexCap"
            width={180}
            height={48}
            className="h-auto w-auto max-w-[180px] object-contain object-left"
            priority
          />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Main navigation">
        {visiblePortfolioItems.length > 0 ? (
          <Section
            title="Portfolio"
            open={openSection === 'portfolio'}
            onToggle={() => toggle('portfolio')}
            maxHeightClass="max-h-[600px]"
          >
            {visiblePortfolioItems.map((item) => (
              <NavItemLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </Section>
        ) : null}

        {visiblePortfolioItems.length > 0 && (visiblePipelineItems.length > 0 || visibleOperationsItems.length > 0) ? (
          <div className="my-1 h-px bg-[#E5E9F2]" />
        ) : null}

        {visiblePipelineItems.length > 0 ? (
          <Section
            title="Pipeline"
            open={openSection === 'pipeline'}
            onToggle={() => toggle('pipeline')}
            maxHeightClass="max-h-[400px]"
          >
            {visiblePipelineItems.map((item) => (
              <NavItemLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </Section>
        ) : null}

        {visiblePipelineItems.length > 0 && visibleOperationsItems.length > 0 ? <div className="my-1 h-px bg-[#E5E9F2]" /> : null}

        {visibleOperationsItems.length > 0 ? (
          <Section
            title="Operations"
            open={openSection === 'operations'}
            onToggle={() => toggle('operations')}
            maxHeightClass="max-h-[200px]"
          >
            {visibleOperationsItems.map((item) => (
              <NavItemLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </Section>
        ) : null}
      </nav>
    </aside>
  );
}

function Section({
  title,
  open,
  onToggle,
  maxHeightClass,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  maxHeightClass: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button onClick={onToggle} className="group flex w-full items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8896B0] transition-colors group-hover:text-[#6f7e9b]">
          {title}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 flex-shrink-0 text-[#A7B3C8] transition-all duration-200 group-hover:text-[#6f7e9b]',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-[250ms] ease-in-out',
          open ? `${maxHeightClass} opacity-100` : 'max-h-0 opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function NavItemLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-[10px] border-l-2 px-4 py-[7px] transition-colors duration-100',
        active
          ? 'border-[#0B1F45] bg-[#EEF1F8] text-[#0B1F45]'
          : 'border-transparent text-[#0B1F45] hover:bg-[#F5F7FA] hover:text-[#0B1F45]',
      )}
    >
      <Icon className={cn('h-[14px] w-[14px] flex-shrink-0', active ? 'text-[#0B1F45]' : 'text-[#8896B0]')} />
      <span className="flex-1 text-[13.5px] leading-none">{item.label}</span>
      {item.isSoon ? (
        <span className="flex-shrink-0 rounded-[3px] bg-[#EEF1F8] px-[5px] py-[1px] text-[9px] text-[#8896B0]">Soon</span>
      ) : null}
    </Link>
  );
}
