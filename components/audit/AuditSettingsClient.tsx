'use client';

import { useCallback, useEffect, useState } from 'react';

import { diffAuditStates, formatAuditSubtitle, formatAuditTitle, type AuditLogRow } from '@/lib/audit/format';
import { formatDateTime } from '@/lib/format-date';
import { Button } from '@/components/ui/button';

export function AuditSettingsClient() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = 40;

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/audit?limit=${limit}&offset=${nextOffset}`);
    const j = (await res.json()) as { events?: AuditLogRow[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load audit log');
      setRows([]);
      setLoading(false);
      return;
    }
    const next = j.events ?? [];
    setRows((prev) => (append ? [...prev, ...next] : next));
    setOffset(nextOffset + next.length);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
      <h2 className="text-lg font-semibold text-navy">Audit log (tenant)</h2>
      <p className="mt-1 text-sm text-navy/60">
        Full append-only history across entities. Visible to organization administrators only.
      </p>
      {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs text-navy">
          <thead className="border-b border-shell-border text-navy/55">
            <tr>
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Actor</th>
              <th className="py-2 pr-3 font-medium">Entity</th>
              <th className="py-2 pr-3 font-medium">Summary</th>
              <th className="py-2 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const diffs = diffAuditStates(row);
              return (
                <tr key={row.id} className="border-b border-shell-border/80 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-navy/70">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="py-2 pr-3">{row.actor_name ?? row.actor_email ?? '—'}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-navy/70">
                    {row.entity_type}
                    <br />
                    <span className="text-navy/50">{row.entity_id.slice(0, 8)}…</span>
                  </td>
                  <td className="py-2 pr-3 text-sm">
                    <div className="font-medium text-navy">{formatAuditTitle(row)}</div>
                    <div className="text-[11px] text-navy/50">{formatAuditSubtitle(row)}</div>
                  </td>
                  <td className="py-2 text-[11px] text-navy/75">
                    {diffs.length ? (
                      <ul className="list-inside list-disc space-y-0.5">
                        {diffs.map((d) => (
                          <li key={d.field}>
                            {d.field}: {d.before} → {d.after}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-center">
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void load(offset, true)}
          className="border-shell-border"
        >
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      </div>
    </section>
  );
}
