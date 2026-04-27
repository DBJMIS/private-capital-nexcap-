import { cn } from '@/lib/utils';
import { STATUS_BADGE_BASE } from '@/components/ui/design-system';

const CFP_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-teal-50 text-[#0F8A6E]',
  closed: 'bg-[#0B1F45] text-white',
  archived: 'bg-gray-50 text-gray-500 border border-gray-200',
};

function label(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CfpStatusBadge({ status }: { status: string }) {
  const key = status.trim().toLowerCase();
  const tone = CFP_STATUS_BADGE[key] ?? CFP_STATUS_BADGE.draft;
  return (
    <span className={cn(STATUS_BADGE_BASE, tone)} suppressHydrationWarning>
      {label(key)}
    </span>
  );
}
