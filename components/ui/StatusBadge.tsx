import { cn } from '@/lib/utils';
import { formatStatusDisplayLabel, statusBadgeClasses } from '@/components/ui/design-system';

export type StatusBadgeProps = {
  status: string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeClasses(status), className)} suppressHydrationWarning>
      {formatStatusDisplayLabel(status)}
    </span>
  );
}
