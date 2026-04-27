import type { InstrumentType } from '@/lib/investments/types';

export type InvestmentRow = {
  id: string;
  approved_amount_usd: number;
  disbursed_amount_usd: number;
  remaining_amount_usd: number;
  status: string;
  instrument_type: InstrumentType;
  investment_date: string | null;
  maturity_date: string | null;
  portfolio_reviewer_id?: string | null;
  portfolio_last_snapshot_date?: string | null;
  portfolio_latest_score?: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  on_hold: 'On hold',
  closed: 'Closed',
  written_off: 'Written off',
};

export function InvestmentSummary({
  investment,
  fundName,
}: {
  investment: InvestmentRow;
  fundName?: string;
}) {
  return (
    <div className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
      <h2 className="text-lg font-semibold text-navy">{fundName ?? 'Investment'}</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-navy/50">Status</dt>
          <dd className="font-medium text-navy">{STATUS_LABEL[investment.status] ?? investment.status}</dd>
        </div>
        <div>
          <dt className="text-navy/50">Instrument</dt>
          <dd className="font-medium text-navy">{investment.instrument_type}</dd>
        </div>
        <div>
          <dt className="text-navy/50">Approved (USD)</dt>
          <dd className="font-medium text-navy">${Number(investment.approved_amount_usd).toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt className="text-navy/50">Disbursed (USD)</dt>
          <dd className="font-medium text-navy">${Number(investment.disbursed_amount_usd).toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt className="text-navy/50">Remaining (USD)</dt>
          <dd className="font-medium text-navy">${Number(investment.remaining_amount_usd).toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt className="text-navy/50">Dates</dt>
          <dd className="text-navy">
            {investment.investment_date ?? '—'} → {investment.maturity_date ?? '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
