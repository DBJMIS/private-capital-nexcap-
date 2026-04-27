type SummaryPayload = {
  active_investment_count: number;
  total_approved_usd: number;
  total_disbursed_usd: number;
  average_performance_score: number | null;
  investments_at_risk_count: number;
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    n,
  );
}

export function PortfolioSummaryCards({ summary }: { summary: SummaryPayload }) {
  const cards = [
    {
      label: 'Active investments',
      value: String(summary.active_investment_count),
      hint: fmtUsd(summary.total_approved_usd) + ' approved',
    },
    {
      label: 'Total disbursed',
      value: fmtUsd(summary.total_disbursed_usd),
      hint: 'Capital deployed to date',
    },
    {
      label: 'Avg performance score',
      value:
        summary.average_performance_score != null ? summary.average_performance_score.toFixed(1) : '—',
      hint: 'Across investments with a score',
    },
    {
      label: 'At risk',
      value: String(summary.investments_at_risk_count),
      hint: 'Underperforming, critical, or overdue reporting',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-navy/50">{c.label}</p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-navy">{c.value}</p>
          <p className="mt-2 text-xs text-navy/55">{c.hint}</p>
          <div className="mt-4 h-1 w-12 rounded-full bg-gold/80" aria-hidden />
        </div>
      ))}
    </div>
  );
}
