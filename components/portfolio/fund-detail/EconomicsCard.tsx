'use client';

import type { PortfolioFundRow } from '@/lib/portfolio/types';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';

export function EconomicsCard({ fund }: { fund: PortfolioFundRow }) {
  const perfLabel =
    fund.performance_fee_pct != null && fund.hurdle_rate_pct != null
      ? `${fund.performance_fee_pct}% above ${fund.hurdle_rate_pct}% hurdle`
      : fund.performance_fee_pct != null
        ? `${fund.performance_fee_pct}%`
        : '—';

  return (
    <FundDetailCardChrome title="Economics & fees">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 6,
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Target IRR</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {fund.target_irr_pct != null ? `${Number(fund.target_irr_pct).toFixed(1)}%` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Mgmt fee</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {fund.management_fee_pct != null ? `${Number(fund.management_fee_pct).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Hurdle</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {fund.hurdle_rate_pct != null ? `${Number(fund.hurdle_rate_pct).toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Performance fee</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{perfLabel}</div>
      </div>
    </FundDetailCardChrome>
  );
}
