'use client';

import { useCallback, useEffect, useState } from 'react';

import { diffAuditStates, formatAuditSubtitle, formatAuditTitle, type AuditLogRow } from '@/lib/audit/format';
import { cn } from '@/lib/utils';

export type ActivityTimelineProps = {
  entityType: string;
  entityId: string;
  className?: string;
};

export function ActivityTimeline({ entityType, entityId, className }: ActivityTimelineProps) {
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
    const j = (await res.json()) as { events?: AuditLogRow[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load activity');
      setRows([]);
      return;
    }
    setRows(j.events ?? []);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) {
    return <p className="text-sm text-navy/55">Loading activity…</p>;
  }

  if (err) {
    return <p className="text-sm text-red-700">{err}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-navy/50">No audit events recorded for this record yet.</p>;
  }

  return (
    <ol className={cn('relative border-l border-shell-border pl-5', className)}>
      {rows.map((row) => {
        const diffs = diffAuditStates(row);
        return (
          <li key={row.id} className="mb-6 ml-1 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-shell-border bg-gold" aria-hidden />
            <p className="text-sm font-medium text-navy">{formatAuditTitle(row)}</p>
            <p className="text-xs text-navy/55">{formatAuditSubtitle(row)}</p>
            {diffs.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-lg bg-shell-bg/80 p-3 text-xs text-navy/80">
                {diffs.map((d) => (
                  <li key={d.field}>
                    <span className="font-medium text-navy/70">{d.field}</span>:{' '}
                    <span className="text-red-800/90">{d.before}</span>
                    {' → '}
                    <span className="text-teal">{d.after}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
