'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import type { PortalDashboardResponse } from '@/types/portal-dashboard';

export default function PortalQuestionnairePage() {
  const router = useRouter();

  useEffect(() => {
    void fetch('/api/portal/dashboard', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json() as Promise<PortalDashboardResponse>)
      .then((json) => {
        if (json.state === 'active' && json.funds.length === 1) {
          const f = json.funds[0]!;
          if (f.is_direct_portfolio || f.application == null) {
            const routeId = f.portfolio_fund_id ?? f.portfolio_fund?.id;
            if (routeId) {
              router.replace(`/portal/funds/${routeId}`);
              return;
            }
            router.replace('/portal');
            return;
          }
          router.replace(`/portal/funds/${f.application.id}/questionnaire`);
          return;
        }
        router.replace('/portal');
      })
      .catch(() => router.replace('/portal'));
  }, [router]);

  return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Redirecting…</div>;
}
