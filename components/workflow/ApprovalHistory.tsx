'use client';

import { useCallback, useEffect, useState } from 'react';

import { formatDateTime } from '@/lib/format-date';

type Row = {
  id: string;
  approval_type: string;
  status: string;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
  requested_by: string;
  approved_by: string | null;
};

export function ApprovalHistory({
  entityType,
  entityId,
  title = 'Approval history',
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(
      `/api/approvals?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&limit=100`,
    );
    const j = (await res.json()) as { approvals?: Row[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load');
      return;
    }
    setRows(j.approvals ?? []);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) {
    return <p className="text-sm text-red-700">{err}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-navy/50">No approval records for this item yet.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-navy">{title}</h3>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-shell-border/80 bg-white/60 p-3">
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="font-medium capitalize text-navy">{r.approval_type.replace(/_/g, ' ')}</span>
              <span className="text-navy/60">·</span>
              <span className="uppercase text-navy/70">{r.status}</span>
            </div>
            {r.decision_notes && <p className="mt-2 text-navy/85">{r.decision_notes}</p>}
            <p className="mt-2 text-xs text-navy/50">
              {r.decided_at ? formatDateTime(r.decided_at) : formatDateTime(r.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
