'use client';

import { useMemo, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type UserAvatarSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<UserAvatarSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-24 w-24',
};

const TEXT_CLASS: Record<UserAvatarSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-2xl',
};

function initialsFromName(name: string, email: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  const local = email.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '??';
}

type UserAvatarProps = {
  name: string;
  email: string;
  size?: UserAvatarSize;
  className?: string;
};

export function UserAvatar({ name, email, size = 'md', className }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(() => initialsFromName(name, email), [name, email]);

  return (
    <Avatar className={cn(SIZE_CLASS[size], className)}>
      {!failed ? (
        <AvatarImage
          src="/api/me/avatar"
          alt={`${name} profile photo`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
      <AvatarFallback className={cn('bg-[#0B1F45] text-white', TEXT_CLASS[size])}>{initials}</AvatarFallback>
    </Avatar>
  );
}
