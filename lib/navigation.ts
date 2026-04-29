import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Building2,
  Calendar,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  HandCoins,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  PieChart,
  PiggyBank,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * Nav audit (app routes under `app/(auth)/`, 2026-04): PIPELINE — /dashboard ok; /fund-applications ok;
 * /onboarding ok (fund_manager / client-facing only, hidden from DBJ staff nav). DUE DILIGENCE — /questionnaires ok;
 * /assessments ok (criteria scoring list); primary application hub is /fund-applications/[id] (pipeline). OPERATIONS — /tasks, /approvals, /reports, /settings ok.
 * POST-INVESTMENT (grouped in sidebar) — /deals ok; /investments/[id] exists but no /investments index (nav may 404);
 * /disbursements, /portfolio-companies, /monitoring-reports, /commitments have no matching pages in app/ (likely 404)
 * unless added elsewhere — left unchanged per scope. Pre-Screening: not in nav; manual route /applications/[id]/pre-screening exists.
 */

export type NavItemDef = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroupDef = {
  title: string;
  items: NavItemDef[];
  /** When set, this group shows expand/collapse in the expanded sidebar. */
  collapsible?: boolean;
  /** If collapsible, start with items hidden (users can still expand). */
  defaultCollapsed?: boolean;
};

export const AUTH_NAV_GROUPS: NavGroupDef[] = [
  {
    title: 'PORTFOLIO',
    items: [
      { label: 'Portfolio Dashboard', href: '/portfolio', icon: PieChart },
      { label: 'Fund Monitoring', href: '/portfolio/funds', icon: Building2 },
      { label: 'Reporting Calendar', href: '/portfolio/calendar', icon: Calendar },
      { label: 'Compliance', href: '/portfolio/compliance', icon: ShieldCheck },
      { label: 'Capital Calls', href: '/portfolio/capital-calls', icon: Banknote },
      { label: 'Distributions', href: '/portfolio/distributions', icon: TrendingUp },
    ],
  },
  {
    title: 'PIPELINE',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Calls for Proposals', href: '/cfp', icon: Megaphone },
      { label: 'Fund Applications', href: '/fund-applications', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'DUE DILIGENCE',
    items: [
      { label: 'DD Questionnaires', href: '/questionnaires', icon: ClipboardList },
      { label: 'Assessments & Scoring', href: '/assessments', icon: Scale },
    ],
  },
  {
    title: 'POST-INVESTMENT',
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { label: 'Deals', href: '/deals', icon: HandCoins },
      { label: 'Investments', href: '/investments', icon: TrendingUp },
      { label: 'Disbursements', href: '/disbursements', icon: Wallet },
      { label: 'Portfolio Companies', href: '/portfolio-companies', icon: Building2 },
      { label: 'Monitoring Reports', href: '/monitoring-reports', icon: FileText },
      { label: 'Investors', href: '/investors', icon: Users },
      { label: 'Commitments', href: '/commitments', icon: PiggyBank },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { label: 'Tasks', href: '/tasks', icon: ListTodo },
      { label: 'Approvals', href: '/approvals', icon: ShieldCheck },
      { label: 'Executive reporting', href: '/reports', icon: FileBarChart },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

/** Map pathname prefix → human-readable page title for the top bar */
export function titleFromPathname(pathname: string): string {
  const map: Record<string, string> = {
    '/profile': 'My Profile',
    '/dashboard': 'Dashboard',
    '/cfp': 'Calls for Proposals',
    '/fund-applications': 'Fund Applications',
    '/applications': 'Applications',
    '/onboarding': 'Fund Onboarding',
    '/application-status': 'Application Status',
    '/questionnaires': 'DD Questionnaires',
    '/assessments': 'Assessments & Scoring',
    '/deals': 'Deals',
    '/investments': 'Investments',
    '/disbursements': 'Disbursements',
    '/portfolio': 'Portfolio Dashboard',
    '/portfolio/funds': 'Fund Monitoring',
    '/portfolio/calendar': 'Reporting Calendar',
    '/portfolio/compliance': 'Compliance',
    '/portfolio/capital-calls': 'Capital Calls',
    '/portfolio/distributions': 'Distributions',
    '/portfolio-companies': 'Portfolio Companies',
    '/monitoring-reports': 'Monitoring Reports',
    '/investors': 'Investors',
    '/commitments': 'Commitments',
    '/tasks': 'Tasks',
    '/approvals': 'Approvals',
    '/reports': 'Executive reporting',
    '/settings': 'Settings',
    '/settings/roles': 'Role Management',
    '/settings/users': 'User Management',
    '/settings/users/invite': 'Invite User',
  };

  if (map[pathname]) return map[pathname];

  if (pathname.startsWith('/cfp/')) return 'Calls for Proposals';

  for (const [path, title] of Object.entries(map)) {
    if (pathname.startsWith(path + '/')) return title;
  }

  return 'DBJ VC Management';
}

/** Sidebar: fund managers only see their portal; DBJ staff see the full nav. */
export function navGroupsForRole(role: string | null | undefined): NavGroupDef[] {
  if (role === 'fund_manager') {
    return [
      {
        title: 'PORTAL',
        items: [
          { label: 'My Application', href: '/onboarding', icon: Sparkles },
          { label: 'Application Status', href: '/application-status', icon: FileText },
        ],
      },
    ];
  }
  return AUTH_NAV_GROUPS;
}

export function breadcrumbsFromPathname(pathname: string): { label: string; href?: string }[] {
  const root = { label: 'Home', href: '/dashboard' as const };
  if (pathname === '/dashboard') {
    return [root, { label: 'Dashboard' }];
  }

  const title = titleFromPathname(pathname);
  if (title === 'DBJ VC Management') {
    return [root, { label: pathname }];
  }

  // Under /settings/..., AUTH_NAV_GROUPS only lists /settings, so .find() would always label the crumb "Settings".
  if (pathname.startsWith('/settings/')) {
    const href = pathname.startsWith('/settings/roles')
      ? '/settings/roles'
      : pathname.startsWith('/settings/users')
        ? '/settings/users'
        : '/settings';
    return [root, { label: title, href }];
  }

  const segment = AUTH_NAV_GROUPS.flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(i.href + '/'));

  return [root, { label: segment?.label ?? title, href: segment?.href }];
}
