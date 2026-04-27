'use client';

import { Button } from '@/components/ui/button';

export type DisbursementRow = {
  id: string;
  tranche_number: number;
  amount_usd: number;
  disbursement_date: string | null;
  reference_number: string | null;
  status: string;
  notes: string | null;
  approval_id?: string | null;
  approval_status?: string | null;
};

export function DisbursementTable({
  rows,
  canApprove,
  onApprove,
  approvingId,
}: {
  rows: DisbursementRow[];
  canApprove: boolean;
  onApprove: (row: DisbursementRow) => void;
  approvingId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-shell-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-shell-border bg-navy/[0.03] text-xs uppercase text-navy/60">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Amount (USD)</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Reference</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Approval</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-shell-border/80">
              <td className="px-3 py-2">{r.tranche_number}</td>
              <td className="px-3 py-2">${Number(r.amount_usd).toLocaleString('en-US')}</td>
              <td className="px-3 py-2">{r.disbursement_date ?? '—'}</td>
              <td className="px-3 py-2">{r.reference_number ?? '—'}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 text-xs text-navy/70">{r.approval_status ?? '—'}</td>
              <td className="px-3 py-2 text-right">
                {r.status === 'pending' && canApprove && r.approval_id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={approvingId !== null}
                    onClick={() => onApprove(r)}
                  >
                    {approvingId === r.id ? 'Opening…' : 'Decide'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-4 text-center text-sm text-navy/50">No disbursements yet.</p>}
    </div>
  );
}
