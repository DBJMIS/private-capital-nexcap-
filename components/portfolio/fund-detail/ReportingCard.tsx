'use client';

import Link from 'next/link';

import type { PortfolioFundRow } from '@/lib/portfolio/types';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';

const neutralPill = {
  background: 'var(--color-background-secondary)',
  color: 'var(--color-text-secondary)',
  fontSize: 10,
  padding: '2px 6px',
  borderRadius: 20,
  border: '0.5px solid var(--color-border-tertiary)',
  display: 'inline-block' as const,
  marginRight: 4,
  marginBottom: 4,
};

export function ReportingCard({ fund, fundId }: { fund: PortfolioFundRow; fundId: string }) {
  return (
    <FundDetailCardChrome
      title="Reporting"
      headerRight={
        <Link
          href={`/portfolio/funds/${fundId}?tab=settings`}
          style={{
            fontSize: 11,
            color: '#1D9E75',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Edit →
        </Link>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Quarterly due</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {`${fund.quarterly_report_due_days} days`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>after quarter end</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Audit due</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {`${fund.audit_report_due_days} days`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>after year end</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Report types</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {fund.requires_quarterly_financial ? <span style={neutralPill}>Quarterly Financial</span> : null}
          {fund.requires_quarterly_inv_mgmt ? <span style={neutralPill}>Inv. Mgmt</span> : null}
          {fund.requires_audited_annual ? <span style={neutralPill}>Audited Annual</span> : null}
          {fund.requires_inhouse_quarterly ? <span style={neutralPill}>In-house</span> : null}
          {!fund.requires_quarterly_financial &&
          !fund.requires_quarterly_inv_mgmt &&
          !fund.requires_audited_annual &&
          !fund.requires_inhouse_quarterly ? (
            <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>—</span>
          ) : null}
        </div>
      </div>
    </FundDetailCardChrome>
  );
}
