'use client';

import type { ReactNode } from 'react';

export function FundDetailCardChrome({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '9px 12px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {title}
        </div>
        {headerRight ?? null}
      </div>
      <div style={{ padding: '11px 12px' }}>{children}</div>
    </div>
  );
}
