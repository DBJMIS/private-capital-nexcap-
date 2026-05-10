'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { QuestionnaireWorkspace } from '@/components/questionnaire/QuestionnaireWorkspace';
import type { PortalDashboardResponse } from '@/types/portal-dashboard';

type FundData = Extract<PortalDashboardResponse, { state: 'active' }>['funds'][number];

export default function FundQuestionnairePage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [fund, setFund] = useState<FundData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void fetch(`/api/portal/funds/${id}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        const json = (await r.json()) as FundData & { message?: string; error?: string };
        if (!r.ok) {
          setError(json.message ?? json.error ?? 'Could not load fund.');
          return;
        }
        if (json.application == null && json.portfolio_fund == null) {
          setError(json.message ?? 'Could not load fund.');
          return;
        }
        const fd = json as FundData;
        if (fd.is_direct_portfolio || fd.application == null) {
          router.replace(`/portal/funds/${id}`);
          return;
        }
        setFund(fd);
        setError(null);
      })
      .catch(() => setError('Could not load fund.'));
  }, [id, router]);

  if (error) return <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  if (!fund) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Loading…</div>;
  if (!fund.questionnaire?.id) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700">
        No questionnaire assigned for this fund yet.
      </div>
    );
  }

  return (
    <QuestionnaireWorkspace
      questionnaireId={fund.questionnaire.id}
      basePath={`/portal/funds/${id}/questionnaire`}
    />
  );
}
