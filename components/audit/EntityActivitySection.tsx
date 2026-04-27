'use client';

import { ActivityTimeline } from '@/components/audit/ActivityTimeline';
import { cn } from '@/lib/utils';

export function EntityActivitySection({
  entityType,
  entityId,
  className,
}: {
  entityType: string;
  entityId: string;
  /** Optional; use to embed (e.g. remove top margin) inside another layout. */
  className?: string;
}) {
  return (
    <section className={cn('mt-10 rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell', className)}>
      <h3 className="text-sm font-semibold text-navy">Activity</h3>
      <p className="mt-1 text-xs text-navy/55">Audit trail for this record (who did what, and material field changes).</p>
      <div className="mt-4">
        <ActivityTimeline entityType={entityType} entityId={entityId} />
      </div>
    </section>
  );
}
