'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type ViewState = 'loading' | 'success' | 'redirecting';

type QuestionnaireDetailJson = {
  questionnaire?: { status?: string | null };
  application?: { fund_name?: string | null } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseQuestionnaireDetail(json: unknown): QuestionnaireDetailJson {
  if (!isRecord(json)) return {};
  const questionnaire = isRecord(json.questionnaire) ? json.questionnaire : null;
  const application = isRecord(json.application) ? json.application : null;
  return {
    questionnaire: questionnaire ? { status: typeof questionnaire.status === 'string' ? questionnaire.status : null } : undefined,
    application: application ? { fund_name: typeof application.fund_name === 'string' ? application.fund_name : null } : undefined,
  };
}

export default function FundQuestionnaireCompletePage() {
  const router = useRouter();
  const params = useParams();
  const fundId = typeof params?.id === 'string' ? params.id : null;
  const qid = typeof params?.qid === 'string' ? params.qid : null;
  const [view, setView] = useState<ViewState>('loading');
  const [fundName, setFundName] = useState('your fund');

  const verify = useCallback(async () => {
    if (!fundId || !qid) {
      setView('redirecting');
      return;
    }
    setView('loading');
    try {
      const res = await fetch(`/api/questionnaires/${qid}`, { credentials: 'same-origin', cache: 'no-store' });
      const json: unknown = await res.json();
      if (!res.ok) {
        router.replace(`/portal/funds/${fundId}/questionnaire/${qid}`);
        setView('redirecting');
        return;
      }
      const parsed = parseQuestionnaireDetail(json);
      const status = String(parsed.questionnaire?.status ?? '').toLowerCase().replace(/\s+/g, '_');
      if (status !== 'completed') {
        router.replace(`/portal/funds/${fundId}/questionnaire/${qid}`);
        setView('redirecting');
        return;
      }
      if (parsed.application?.fund_name?.trim()) setFundName(parsed.application.fund_name.trim());
      setView('success');
    } catch {
      router.replace(`/portal/funds/${fundId}/questionnaire/${qid}`);
      setView('redirecting');
    }
  }, [fundId, qid, router]);

  useEffect(() => {
    void verify();
  }, [verify]);

  if (view === 'loading') return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Loading…</div>;
  if (view === 'redirecting') return null;

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <svg width={64} height={64} viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#00A99D]">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">Questionnaire Submitted</h1>
      <p className="mt-4 max-w-md text-sm text-gray-500">
        Your Due Diligence Questionnaire for <span className="font-medium text-gray-700">{fundName}</span> has been submitted to DBJ.
        Our team will review your submission and be in touch.
      </p>
      <Link
        href={`/portal/funds/${fundId}`}
        className="mt-8 inline-flex rounded-lg bg-[#00A99D] px-5 py-3 text-sm font-semibold text-white hover:bg-[#008f85]"
      >
        Return to Overview
      </Link>
    </div>
  );
}
