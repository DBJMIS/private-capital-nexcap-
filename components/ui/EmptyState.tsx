import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dsEmpty } from '@/components/ui/design-system';

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  children?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, subtitle, children, className }: EmptyStateProps) {
  return (
    <div className={cn(dsEmpty.wrap, className)}>
      <Icon className={dsEmpty.icon} aria-hidden />
      <p className={dsEmpty.title}>{title}</p>
      {subtitle ? <p className={dsEmpty.subtitle}>{subtitle}</p> : null}
      {children}
    </div>
  );
}
