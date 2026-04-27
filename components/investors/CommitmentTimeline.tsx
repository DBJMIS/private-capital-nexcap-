'use client';

import { formatShortDate } from '@/lib/format-date';

export type CommitmentRow = {
  id: string;
  application_id: string | null;
  investment_id: string | null;
  committed_amount_usd: number;
  deployed_amount_usd?: number;
  confirmed: boolean;
  commitment_date: string | null;
  notes: string | null;
  created_at: string;
};

export function CommitmentTimeline({ rows }: { rows: CommitmentRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-navy/50">No commitments recorded yet.</p>;
  }

  const sorted = [...rows].sort((a, b) => {
    const da = a.commitment_date ? new Date(a.commitment_date).getTime() : new Date(a.created_at).getTime();
    const db = b.commitment_date ? new Date(b.commitment_date).getTime() : new Date(b.created_at).getTime();
    return db - da;
  });

  return (
    <ol className="relative border-l border-shell-border pl-6">
      {sorted.map((r) => {
        const dep = Number(r.deployed_amount_usd ?? 0);
        const com = Number(r.committed_amount_usd);
        const when = r.commitment_date ?? r.created_at;
        return (
          <li key={r.id} className="mb-8 ml-1">
            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-shell-border bg-teal" />
            <time className="mb-1 block text-xs font-medium text-navy/55">{formatShortDate(when)}</time>
            <div className="rounded-lg border border-shell-border bg-white/70 p-3 text-sm">
              <p className="font-medium text-navy">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(com)}{' '}
                committed
                {dep > 0 && (
                  <>
                    {' · '}
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dep)}{' '}
                    deployed
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-navy/55">
                {r.application_id && <span>Application linked · </span>}
                {r.investment_id && <span>Investment linked · </span>}
                {r.confirmed ? 'Confirmed' : 'Unconfirmed'}
              </p>
              {r.notes && <p className="mt-2 text-navy/75">{r.notes}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
