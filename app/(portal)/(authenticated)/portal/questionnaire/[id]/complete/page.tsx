'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const PORTAL_Q_BASE = '/portal/questionnaire';

type PortalCompleteViewState = 'loading' | 'success' | 'redirecting';

type QuestionnaireDetailJson = {
  questionnaire?: { status?: string | null };
  application?: { fund_name?: string | null } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseQuestionnaireDetail(json: unknown): QuestionnaireDetailJson {
  if (!isRecord(json)) {
    return {};
  }
  const questionnaire = isRecord(json.questionnaire) ? json.questionnaire : null;
  const application = isRecord(json.application) ? json.application : null;
  return {
    questionnaire: questionnaire
      ? { status: typeof questionnaire.status === 'string' ? questionnaire.status : null }
      : undefined,
    application: application
      ? { fund_name: typeof application.fund_name === 'string' ? application.fund_name : null }
      : undefined,
  };
}

function TealCheck64() {
  return (
    <svg width={64} height={64} viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#00A99D]">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PortalQuestionnaireCompletePage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;

  const [view, setView] = useState<PortalCompleteViewState>('loading');
  const [fundName, setFundName] = useState<string>('your fund');

  const verify = useCallback(async () => {
    if (!id) {
      setView('redirecting');
      return;
    }
    setView('loading');
    try {
      const res = await fetch(`/api/questionnaires/${id}`, { credentials: 'same-origin', cache: 'no-store' });
      const json: unknown = await res.json();
      if (!res.ok) {
        router.replace(`${PORTAL_Q_BASE}/${id}`);
        setView('redirecting');
        return;
      }
      const parsed = parseQuestionnaireDetail(json);
      const status = String(parsed.questionnaire?.status ?? '').toLowerCase().replace(/\s+/g, '_');
      if (status !== 'completed') {
        router.replace(`${PORTAL_Q_BASE}/${id}`);
        setView('redirecting');
        return;
      }
      const name = parsed.application?.fund_name;
      if (typeof name === 'string' && name.trim().length > 0) {
        setFundName(name.trim());
      }
      setView('success');
    } catch {
      router.replace(`${PORTAL_Q_BASE}/${id}`);
      setView('redirecting');
    }
  }, [id, router]);

  useEffect(() => {
    void verify();
  }, [verify]);

  if (!id) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center text-sm text-gray-600">
        <p>Invalid questionnaire link.</p>
        <Link href="/portal" className="mt-4 inline-block font-medium text-[#00A99D] hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (view === 'loading') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12">
        <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
        <p className="mt-4 text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (view === 'redirecting') {
    return null;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <div className="flex justify-center">
          <TealCheck64 />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900">Questionnaire Submitted</h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-gray-500">
          Your Due Diligence Questionnaire for <span className="font-medium text-gray-700">{fundName}</span> has been
          submitted to DBJ. Our team will review your submission and be in touch.
        </p>
        <Link
          href="/portal"
          className="mt-10 inline-flex w-full max-w-xs items-center justify-center rounded-lg bg-[#00A99D] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#008f85]"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
