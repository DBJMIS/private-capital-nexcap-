'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { breadcrumbsFromPathname, titleFromPathname } from '@/lib/navigation';
import { roleBadgeClass, roleDisplayLabel } from '@/lib/settings/role-visual';
import { cn } from '@/lib/utils';
import { dsType } from '@/components/ui/design-system';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type TopBarProps = {
  user: {
    name: string;
    email: string;
    role: string;
  };
  /** Optional override for the main title (e.g. from a nested server page later) */
  titleOverride?: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function TopBar({ user, titleOverride }: TopBarProps) {
  const pathname = usePathname() ?? '';
  const title = titleOverride?.trim() || titleFromPathname(pathname);
  const crumbs = breadcrumbsFromPathname(pathname);
  /** These routes render their own `<h1>` in the main content; hide the duplicate page title in this header. */
  const hideHeaderPageTitle =
    pathname === '/dashboard' ||
    pathname === '/portfolio' ||
    pathname.startsWith('/portfolio/') ||
    pathname === '/cfp' ||
    (pathname.startsWith('/cfp/') && pathname !== '/cfp') ||
    pathname === '/fund-applications' ||
    pathname.startsWith('/fund-applications/') ||
    pathname === '/assessments' ||
    (pathname.startsWith('/assessments/') && pathname !== '/assessments/new') ||
    pathname === '/questionnaires' ||
    pathname.startsWith('/questionnaires/') ||
    pathname.startsWith('/settings/users');

  async function handleSignOut() {
    await signOut({ callbackUrl: '/login' });
  }

  return (
    <header className="z-30 shrink-0 border-b border-gray-200 bg-white">
      <div className={cn('flex h-14 w-full items-center gap-4 px-6')}>
        <div className="min-w-0 flex-1">
          <nav className="mb-0.5 flex flex-wrap items-center gap-1 text-[12px] text-gray-400" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden />}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href} className="text-gray-400 hover:text-[#0F8A6E] hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className={cn(i === crumbs.length - 1 && 'font-medium text-gray-500')}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          {!hideHeaderPageTitle ? <h1 className={cn('truncate', dsType.pageTitle)}>{title}</h1> : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-gray-600 hover:bg-gray-100 hover:text-[#0B1F45]"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-10 gap-2 rounded-full px-2 hover:bg-gray-100 md:px-3"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#0B1F45] text-xs text-white">{initials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-left text-sm font-medium text-gray-900 md:inline">
                  {user.name}
                </span>
                <span
                  className={cn(
                    'hidden rounded-full px-2 py-0.5 text-[10px] font-semibold md:inline',
                    roleBadgeClass(user.role),
                  )}
                >
                  {roleDisplayLabel(user.role)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold leading-none text-gray-900">{user.name}</p>
                  <p className="text-xs leading-none text-gray-500">{user.email}</p>
                  <span
                    className={cn(
                      'mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      roleBadgeClass(user.role),
                    )}
                  >
                    {roleDisplayLabel(user.role)}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings">My Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-gray-900 focus:text-gray-900">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
