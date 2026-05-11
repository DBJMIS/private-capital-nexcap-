'use client';

import type { CSSProperties } from 'react';

import type { PortfolioFundRow } from '@/lib/portfolio/types';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';

function impactLabel(id: number): string {
  switch (id) {
    case 1:
      return 'Ecosystem Development';
    case 2:
      return 'Access to Finance';
    case 3:
      return 'Investment Returns';
    default:
      return `Objective ${id}`;
  }
}

function impactStyleByIndex(index: number): CSSProperties {
  switch (index) {
    case 0:
      return {
        background: '#E1F5EE',
        color: '#0F6E56',
        border: '0.5px solid #5DCAA5',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 20,
        display: 'inline-block',
      };
    case 1:
      return {
        background: '#E6F1FB',
        color: '#185FA5',
        border: '0.5px solid #85B7EB',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 20,
        display: 'inline-block',
      };
    case 2:
      return {
        background: '#FAEEDA',
        color: '#633806',
        border: '0.5px solid #EF9F27',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 20,
        display: 'inline-block',
      };
    default:
      return {
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 20,
        display: 'inline-block',
      };
  }
}

const sectorPillStyle: CSSProperties = {
  background: 'var(--color-background-secondary)',
  color: 'var(--color-text-secondary)',
  fontSize: 10,
  padding: '2px 6px',
  borderRadius: 20,
  border: '0.5px solid var(--color-border-tertiary)',
  display: 'inline-block',
  marginRight: 4,
  marginBottom: 4,
};

export function StrategyCard({ fund }: { fund: PortfolioFundRow }) {
  const sectors = fund.sector_focus ?? [];
  const impactIds = [...new Set(fund.impact_objectives ?? [])].sort((a, b) => a - b);

  return (
    <FundDetailCardChrome title="Strategy">
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Sector focus</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sectors.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>—</span>
          ) : (
            sectors.map((s) => (
              <span key={s} style={sectorPillStyle}>
                {s}
              </span>
            ))
          )}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Impact objectives</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {impactIds.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>—</span>
          ) : (
            impactIds.map((id, idx) => (
              <span key={id} style={impactStyleByIndex(idx)}>
                {impactLabel(id)}
              </span>
            ))
          )}
        </div>
      </div>
    </FundDetailCardChrome>
  );
}
