import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { dsType } from '@/components/ui/design-system';

export type PageHeaderProps = {
  title: string;
  /** Plain text or rich content (e.g. status row) shown under the title. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className={dsType.pageTitle}>{title}</h1>
        {subtitle != null && subtitle !== '' ? (
          typeof subtitle === 'string' ? (
            <p className={cn('mt-1', dsType.muted)}>{subtitle}</p>
          ) : (
            <div className="mt-1">{subtitle}</div>
          )
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
