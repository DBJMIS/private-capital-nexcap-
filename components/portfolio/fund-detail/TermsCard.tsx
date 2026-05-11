'use client';

import type { PortfolioFundRow } from '@/lib/portfolio/types';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const raw = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-JM', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Jamaica',
  });
}

export function TermsCard({ fund }: { fund: PortfolioFundRow }) {
  return (
    <FundDetailCardChrome title="Terms & currency">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 9,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Currency</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{fund.currency}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Listed</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {fund.listed ? 'Yes' : 'No'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>FX rate</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {fund.exchange_rate_jmd_usd != null ? String(Number(fund.exchange_rate_jmd_usd)) : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Committed</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {formatShortDate(fund.commitment_date || null)}
          </div>
        </div>
      </div>
    </FundDetailCardChrome>
  );
}
