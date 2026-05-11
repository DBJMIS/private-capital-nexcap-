'use client';

import { fundCategoryLabel } from '@/lib/portfolio/fund-category';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';

function formatMonthYear(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function fundTenureSuffix(fund: PortfolioFundRow): string | null {
  if (fund.is_pvc) return null;
  const end = fund.fund_end_date;
  if (!end) return null;
  const endD = new Date(`${end}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (endD < now) return '(Expired)';
  const years = (endD.getTime() - now.getTime()) / (365.25 * 86400000);
  const rounded = Math.round(years * 10) / 10;
  return `(${rounded} years remaining)`;
}

function stripParens(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/^\(|\)$/g, '');
}

function statusBadgeStyle(fundStatus: string): { bg: string; color: string; border: string; label: string } {
  const s = fundStatus.toLowerCase();
  if (s.includes('closed') || s.includes('liquidat') || s.includes('realized')) {
    return { bg: '#F1EFE8', color: '#5F5E5A', border: '#D3D1C7', label: fundStatus.replace(/_/g, ' ') };
  }
  if (s.includes('active') || s.includes('invest')) {
    return { bg: '#E1F5EE', color: '#085041', border: '#5DCAA5', label: fundStatus.replace(/_/g, ' ') };
  }
  return { bg: '#F1EFE8', color: '#5F5E5A', border: '#D3D1C7', label: fundStatus.replace(/_/g, ' ') };
}

export function ClassificationCard({ fund }: { fund: PortfolioFundRow }) {
  const tenureSub = stripParens(fundTenureSuffix(fund));
  const statusStyle = statusBadgeStyle(fund.fund_status);

  return (
    <FundDetailCardChrome title="Classification & horizon">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 9,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Category</div>
          <span
            style={{
              background: '#E6F1FB',
              color: '#185FA5',
              border: '0.5px solid #85B7EB',
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 20,
              display: 'inline-block',
              fontWeight: 500,
            }}
          >
            {fundCategoryLabel(fund.fund_category)}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Fund tenure</div>
          {fund.is_pvc ? (
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              Permanent Capital Vehicle (PCV)
            </div>
          ) : fund.fund_end_date ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                {formatMonthYear(fund.fund_end_date)}
              </div>
              {tenureSub ? (
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>{tenureSub}</div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>—</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Status</div>
          <span
            style={{
              background: statusStyle.bg,
              color: statusStyle.color,
              border: `0.5px solid ${statusStyle.border}`,
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 20,
              display: 'inline-block',
              fontWeight: 500,
              textTransform: 'capitalize',
            }}
          >
            {statusStyle.label}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Inv. period</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {fund.investment_period_years != null ? `${fund.investment_period_years} years` : '—'}
          </div>
        </div>
      </div>
    </FundDetailCardChrome>
  );
}
