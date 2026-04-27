'use client';

import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { navGroupsForRole } from '@/lib/navigation';
import { Sidebar, type SidebarUser } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { dsLayout } from '@/components/ui/design-system';

const STORAGE_KEY = 'dbj-vc-sidebar-collapsed';

export type AuthenticatedShellProps = {
  tenantName: string;
  user: SidebarUser;
  children: React.ReactNode;
  watchlistCount?: number;
};

export function AuthenticatedShell({ tenantName, user, children, watchlistCount = 0 }: AuthenticatedShellProps) {
  const navGroups = navGroupsForRole(user.role);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className={cn('flex h-screen overflow-hidden', dsLayout.pageBg)}>
      <Sidebar
        tenantName={tenantName}
        user={user}
        collapsed={mounted && collapsed}
        onToggleCollapsed={toggleCollapsed}
        navGroups={navGroups}
        watchlistCount={watchlistCount}
      />
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out',
          mounted && collapsed ? 'ml-[72px]' : 'ml-[220px]',
        )}
      >
        <TopBar user={user} />
        <main className={cn('min-h-0 flex-1 overflow-y-auto', 'bg-[#F3F4F6]')}>
          <div className={cn(dsLayout.contentMax, 'space-y-6')}>{children}</div>
        </main>
      </div>
    </div>
  );
}
