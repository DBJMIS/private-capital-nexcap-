import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dsActionLink } from '@/components/ui/design-system';

export type ActionButtonProps = {
  children: React.ReactNode;
  className?: string;
  /** When set, renders as Next.js `Link` (navigation). */
  href?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'href'>;

export function ActionButton({ children, className, href, ...props }: ActionButtonProps) {
  const classes = cn(dsActionLink, className);
  const inner = (
    <>
      <span>{children}</span>
      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {inner}
    </button>
  );
}
