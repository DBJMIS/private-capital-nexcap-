'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import type { PortalDashboardResponse } from '@/types/portal-dashboard';
import { formatApplicationStatus } from '@/lib/portal/format-helpers';
import { cn } from '@/lib/utils';

const WELCOME_STORAGE_KEY = 'portal_welcomed';

function WelcomeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="mb-6 rounded-xl bg-gradient-to-r from-[#0B1F45] to-[#00A99D] p-5 text-white"
      role="region"
      aria-label="Welcome to NexCap"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">Welcome to NexCap</p>
          <p className="mt-1 text-sm text-white/70">
            Your fund manager portal is ready. Select your fund below to get started.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1.5 text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Dismiss welcome message"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function FundSelectorSkeleton() {
  return (
    <div className="w-full" aria-busy="true">
      <div className="animate-pulse">
        <div className="h-8 max-w-[10rem] rounded-md bg-gray-200" />
        <div className="mt-2 h-4 max-w-[14rem] rounded-md bg-gray-200" />
        <div className="mt-6 h-44 max-w-xl rounded-xl border border-gray-100 bg-gray-100" />
      </div>
      <span className="sr-only">Loading funds</span>
    </div>
  );
}

function portalFundsLabel(activeCount: number): string {
  return `${activeCount} fund${activeCount === 1 ? '' : 's'} linked to your account`;
}

function DocumentIcon48() {
  return (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#00A99D]">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FundSelectorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PortalDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [welcomeBannerVisible, setWelcomeBannerVisible] = useState(false);

  const dismissWelcome = useCallback(() => {
    try {
      sessionStorage.setItem(WELCOME_STORAGE_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    setWelcomeBannerVisible(false);
    router.replace('/portal');
  }, [router]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(WELCOME_STORAGE_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    if (searchParams.get('welcome') === '1') {
      setWelcomeBannerVisible(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!welcomeBannerVisible) return;
    const id = window.setTimeout(() => {
      dismissWelcome();
    }, 10_000);
    return () => window.clearTimeout(id);
  }, [welcomeBannerVisible, dismissWelcome]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/dashboard', { credentials: 'same-origin', cache: 'no-store' });
      const json = (await res.json()) as PortalDashboardResponse & { message?: string };
      if (!res.ok) {
        setError(typeof json.message === 'string' ? json.message : 'Could not load dashboard.');
        setData(null);
        return;
      }
      setData(json as PortalDashboardResponse);
    } catch {
      setError('Network error. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const welcomeSlot = welcomeBannerVisible ? <WelcomeBanner onDismiss={dismissWelcome} /> : null;

  if (loading) {
    return (
      <div className="w-full">
        {welcomeSlot}
        <FundSelectorSkeleton />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        {welcomeSlot}
        <h1 className="text-2xl font-semibold text-gray-900">My Funds</h1>
        <p className="mt-1 text-sm text-gray-500">Linked funds couldn&apos;t be loaded.</p>
        <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="w-full">
        {welcomeSlot}
        <FundSelectorSkeleton />
      </div>
    );
  }

  const fundsCount = data.state === 'active' ? data.funds.length : 0;
  const fundsLabel = portalFundsLabel(fundsCount);

  if (data.state === 'no_application') {
    return (
      <div className="mx-auto w-full max-w-7xl">
        {welcomeSlot}
        <h1 className="text-2xl font-semibold text-gray-900">My Funds</h1>
        <p className="mt-1 text-sm text-gray-500">{fundsLabel}</p>
        <div className="mt-6 flex min-h-[50vh] w-full flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="flex justify-center">
              <DocumentIcon48 />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-gray-900">Welcome to NexCap</h1>
            <p className="mt-3 text-sm text-gray-500">
              Your fund application will appear here once DBJ creates your application record. Please contact your DBJ relationship manager if
              you have not received further instructions.
            </p>
            <a
              href="mailto:info@dbankjm.com"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg border-2 border-[#00A99D] px-4 py-2.5 text-sm font-semibold text-[#00A99D] hover:bg-[#00A99D]/5"
            >
              Contact DBJ
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {welcomeSlot}
      <h1 className="text-2xl font-semibold text-gray-900">My Funds</h1>
      <p className="mt-1 text-sm text-gray-500">{fundsLabel}</p>
      <div
        className={cn(
          'mt-6 grid grid-cols-1 gap-4',
          data.funds.length === 1 ? 'mx-auto max-w-xl' : 'md:grid-cols-2',
        )}
      >
        {data.funds.map((fund) => {
          const routeId = fund.is_direct_portfolio ? fund.portfolio_fund_id ?? fund.portfolio_fund?.id : fund.application?.id;
          const fundName = fund.portfolio_fund?.fund_name ?? fund.application?.fund_name ?? 'Fund';
          const managerName = fund.portfolio_fund?.manager_name ?? fund.application?.manager_name ?? '';
          const statusLabel =
            fund.is_direct_portfolio || !fund.application
              ? (fund.portfolio_fund?.fund_status ?? 'active').replace(/_/g, ' ')
              : formatApplicationStatus(fund.application.status);

          if (!routeId) return null;

          return (
            <div
              key={routeId}
              onClick={() => router.push(`/portal/funds/${routeId}`)}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition-all duration-150 hover:border-teal-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{fundName}</h3>
                  {managerName ? <p className="mt-0.5 text-sm text-gray-500">{managerName}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs font-medium',
                      fund.stage === 'portfolio' ? 'border-teal-100 bg-teal-50 text-teal-700' : 'border-blue-100 bg-blue-50 text-blue-700',
                    )}
                  >
                    {fund.stage === 'portfolio' ? 'Active Portfolio' : 'Onboarding'}
                  </span>
                  <span className="text-xs capitalize text-gray-400">{statusLabel}</span>
                </div>
              </div>
              {fund.stage === 'onboarding' && fund.questionnaire ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500">
                    {fund.questionnaire.completed_sections}
                    {' of '}
                    {fund.questionnaire.total_sections}
                    {' questionnaire sections complete'}
                  </p>
                </div>
              ) : null}
              <div className="mt-4 flex justify-end">
                <span className="text-xs font-medium text-teal-600 hover:text-teal-700">Open Fund →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FundSelectorClient() {
  return (
    <Suspense fallback={<FundSelectorSkeleton />}>
      <FundSelectorInner />
    </Suspense>
  );
}
