'use client';

import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

export function NavTableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      role="link"
      tabIndex={0}
      className={cn('cursor-pointer transition-colors hover:bg-[#F8F9FF]', className)}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      {children}
    </tr>
  );
}
