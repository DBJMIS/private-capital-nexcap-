'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { FundDetailCardChrome } from '@/components/portfolio/fund-detail/FundDetailCardChrome';
import { FundManagerAssociateModal } from '@/components/portfolio/FundManagerAssociateModal';
import { useFundManager } from '@/hooks/useFundManager';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function FundManagerCard({ fundId, canWrite }: { fundId: string; canWrite: boolean }) {
  const router = useRouter();
  const { linked, manager, fundManagerId, isLoading, error, reload } = useFundManager(fundId);
  const [associateOpen, setAssociateOpen] = useState(false);

  const onLinkedContinue = async () => {
    router.refresh();
    await reload();
  };

  let body: ReactNode;

  if (isLoading && linked === null) {
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--color-background-secondary)',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ height: 12, background: '#f3f4f6', borderRadius: 4, marginBottom: 6 }} />
          <div style={{ height: 10, width: '60%', background: '#f9fafb', borderRadius: 4 }} />
        </div>
      </div>
    );
  } else if (!isLoading && linked === null && error) {
    body = (
      <div style={{ fontSize: 12, color: '#b91c1c' }}>
        <p style={{ fontWeight: 500 }}>Could not load relationship data</p>
        <p style={{ marginTop: 4 }}>{error}</p>
      </div>
    );
  } else if (linked === false) {
    body = (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 12px',
          gap: 7,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--color-background-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className="ti ti-user-plus" style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }} aria-hidden="true" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 }}>No manager linked</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
            Link a manager to enable relationship intelligence
          </div>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setAssociateOpen(true)}
            style={{
              fontSize: 11,
              color: '#1D9E75',
              background: 'none',
              border: '0.5px solid #1D9E75',
              cursor: 'pointer',
              padding: '5px 12px',
              borderRadius: 'var(--border-radius-md)',
              fontWeight: 500,
            }}
          >
            Associate manager
          </button>
        ) : null}
      </div>
    );
  } else if (linked && manager && fundManagerId) {
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#E6F1FB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 500,
              color: '#185FA5',
              flexShrink: 0,
            }}
          >
            {getInitials(manager.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {manager.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{manager.firm_name}</div>
          </div>
        </div>
        <Link
          href={`/portfolio/fund-managers/${fundManagerId}`}
          style={{
            display: 'block',
            textAlign: 'center',
            fontSize: 12,
            color: '#1D9E75',
            textDecoration: 'none',
            fontWeight: 500,
            border: '0.5px solid #1D9E75',
            borderRadius: 'var(--border-radius-md)',
            padding: '5px 0',
          }}
        >
          View relationship profile →
        </Link>
      </>
    );
  } else {
    body = <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  }

  return (
    <>
      <FundDetailCardChrome title="Fund manager">{body}</FundDetailCardChrome>
      <FundManagerAssociateModal
        open={associateOpen}
        fundId={fundId}
        onClose={() => setAssociateOpen(false)}
        onLinked={() => void onLinkedContinue()}
      />
    </>
  );
}
