'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type NavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
};

export function NavItem({ href, label, icon: Icon, isActive, collapsed }: NavItemProps) {
  const inner = (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-2',
        isActive
          ? 'bg-[#0B1F45] text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0',
          isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-700',
        )}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) {
    return inner;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
