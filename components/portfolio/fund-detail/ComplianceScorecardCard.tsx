'use client';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';

export type ComplianceScoresBlock = {
  quarterly_financial: number;
  quarterly_inv_mgmt: number;
  audited_annual: number;
  inhouse_quarterly: number;
};

function scoreColor(pct: number): string {
  if (pct === 0) return '#A32D2D';
  if (pct < 50) return '#854F0B';
  return 'var(--color-text-primary)';
}

function barColor(pct: number): string {
  if (pct === 0) return '#E24B4A';
  if (pct < 50) return '#EF9F27';
  return '#1D9E75';
}

type OverallStatus = 'compliant' | 'non-compliant' | 'partial';

function OverallBadge({ status }: { status: OverallStatus }) {
  const badgeConfig: Record<OverallStatus, { bg: string; color: string; border: string; label: string }> = {
    compliant: { bg: '#E1F5EE', color: '#085041', border: '#5DCAA5', label: 'Compliant' },
    'non-compliant': { bg: '#FCEBEB', color: '#791F1F', border: '#F09595', label: 'Non-compliant' },
    partial: { bg: '#FAEEDA', color: '#633806', border: '#EF9F27', label: 'Partial' },
  };
  const c = badgeConfig[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        border: `0.5px solid ${c.border}`,
        fontSize: 11,
        fontWeight: 500,
        padding: '4px 12px',
        borderRadius: 20,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  );
}

const ROWS: { key: keyof ComplianceScoresBlock; label: string }[] = [
  { key: 'quarterly_financial', label: 'Quarterly Financial' },
  { key: 'quarterly_inv_mgmt', label: 'Quarterly Inv. Mgmt' },
  { key: 'audited_annual', label: 'Audited Annual' },
  { key: 'inhouse_quarterly', label: 'In-house Quarterly' },
];

export function ComplianceScorecardCard({
  scores,
  overallStatus,
}: {
  scores: ComplianceScoresBlock | null;
  overallStatus: OverallStatus | null;
}) {
  if (scores == null) {
    return (
      <FundDetailCardChrome title="Compliance scorecard">
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center', padding: '8px 0' }}>
          No reporting obligations loaded yet.
        </div>
      </FundDetailCardChrome>
    );
  }

  return (
    <FundDetailCardChrome title="Compliance scorecard">
      {ROWS.map(({ key, label }) => {
        const pct = scores[key];
        return (
          <div key={key} style={{ marginBottom: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 2,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: scoreColor(pct) }}>{pct}%</div>
            </div>
            <div
              style={{
                background: 'var(--color-background-secondary)',
                borderRadius: 3,
                height: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: barColor(pct),
                  height: '100%',
                  width: `${pct}%`,
                }}
              />
            </div>
          </div>
        );
      })}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: '0.5px solid var(--color-border-tertiary)',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Overall
        </div>
        {overallStatus ? <OverallBadge status={overallStatus} /> : <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>}
      </div>
    </FundDetailCardChrome>
  );
}
