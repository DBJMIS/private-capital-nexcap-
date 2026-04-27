import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dsType, iconBadgeVariant, type IconBadgeVariant } from '@/components/ui/design-system';

export type SectionHeaderProps = {
  icon: LucideIcon;
  iconVariant?: IconBadgeVariant;
  title: string;
  count?: number | null;
  /** Optional supporting line under the title (body/muted tone). */
  description?: string | null;
  right?: React.ReactNode;
  className?: string;
};

export function SectionHeader({
  icon: Icon,
  iconVariant = 'navy',
  title,
  count,
  description,
  right,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={iconBadgeVariant[iconVariant]}>
          <Icon aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className={dsType.sectionTitle}>{title}</h2>
          {count != null && Number.isFinite(count) ? (
            <span className="mt-0.5 inline-block text-xs font-medium text-gray-500">{count}</span>
          ) : null}
          {description ? <p className={cn('mt-1', dsType.muted)}>{description}</p> : null}
        </div>
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}
