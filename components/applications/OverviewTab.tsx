import type { ReactNode } from 'react';

import { dsCard } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

type StageRow = {
  label: string;
  state: 'completed' | 'current' | 'pending';
  detail: ReactNode;
};

export function OverviewTab({
  application,
  stageRows,
}: {
  application: {
    fund_name: string;
    manager_name: string;
    country_of_incorporation: string;
    geographic_area: string;
    total_capital_commitment_usd: number;
    submitted_at: string | null;
  };
  stageRows: StageRow[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={dsCard.padded}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Application Details</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <Detail label="Fund name" value={application.fund_name} />
          <Detail label="Manager name" value={application.manager_name} />
          <Detail label="Country of incorporation" value={application.country_of_incorporation} />
          <Detail label="Geographic area" value={application.geographic_area} />
          <Detail
            label="Total capital commitment"
            value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
              Number(application.total_capital_commitment_usd ?? 0),
            )}
          />
          <Detail label="Submitted date" value={application.submitted_at ? formatDateTime(application.submitted_at) : '—'} />
        </dl>
      </section>

      <section className={dsCard.padded}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Pipeline Progress</h3>
        <div className="mt-4 space-y-3">
          {stageRows.map((row) => (
            <div key={row.label} className="flex items-start gap-3 border-b border-gray-100 pb-3 last:border-b-0">
              <span
                className={cn(
                  'mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
                  row.state === 'completed' && 'bg-teal-500 text-white',
                  row.state === 'current' && 'animate-pulse bg-[#0B1F45] text-white',
                  row.state === 'pending' && 'border border-gray-300 bg-white text-gray-400',
                )}
              >
                {row.state === 'completed' ? '✓' : row.state === 'current' ? '●' : '○'}
              </span>
              <div>
                <p className="text-sm font-medium text-[#0B1F45]">{row.label}</p>
                <div className="text-xs text-gray-500">{row.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-[#0B1F45]">{value}</dd>
    </div>
  );
}
