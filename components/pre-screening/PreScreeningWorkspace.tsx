'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { PreScreeningCategory } from '@/lib/pre-screening/catalog';
import { PRE_SCREENING_CATEGORY_ORDER } from '@/lib/pre-screening/catalog';
import type { CompletionOutcome } from '@/lib/pre-screening/evaluate';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { dsCard, dsType } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { EntityActivitySection } from '@/components/audit/EntityActivitySection';
import { ChecklistCategory } from '@/components/pre-screening/ChecklistCategory';
import type { ChecklistItemData } from '@/components/pre-screening/ChecklistItem';
import { CfpInfoStrip } from '@/components/cfp/CfpInfoStrip';

type ApiItem = ChecklistItemData & { category: string };

type ProgressRow = {
  category: PreScreeningCategory;
  title: string;
  total: number;
  answered: number;
  complete: boolean;
};

type Payload = {
  application: {
    id: string;
    status: string;
    fund_name: string;
    submitted_at: string | null;
    cfp?: { id: string; title: string; status: string; closing_date: string } | null;
  };
  checklist: {
    overall_pass: boolean;
    flagged_for_review: boolean;
    reviewed_at: string | null;
  };
  items: ApiItem[];
  progress: ProgressRow[];
  evaluation: CompletionOutcome;
};

function summaryLabel(evaluation: CompletionOutcome): {
  headline: string;
  detail: string;
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
} {
  switch (evaluation) {
    case 'passed':
      return {
        headline: 'Pass',
        detail:
          'All checklist items are Yes. You may complete pre-screening to advance to Due Diligence.',
        tone: 'ok',
      };
    case 'failed':
      return {
        headline: 'Fail',
        detail: 'One or more items are No. Application remains in Pre-Screening after completion.',
        tone: 'bad',
      };
    case 'legal_review_required':
      return {
        headline: 'Review required',
        detail:
          'A Legal & Regulatory item is No — automatically flagged for assigned officer review.',
        tone: 'warn',
      };
    default:
      return {
        headline: 'Pending',
        detail: 'Answer every line item with Y or N before completing pre-screening.',
        tone: 'neutral',
      };
  }
}

const toneClass: Record<ReturnType<typeof summaryLabel>['tone'], string> = {
  ok: 'border border-[#0F8A6E]/30 bg-teal-50 text-[#0B1F45]',
  warn: 'border border-amber-200 bg-amber-50 text-[#0B1F45]',
  bad: 'border border-red-200 bg-red-50 text-red-900',
  neutral: 'border border-gray-200 bg-white text-[#0B1F45]',
};

export function PreScreeningWorkspace({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const readonly = useMemo(() => {
    const s = data?.application.status;
    return s === 'due_diligence' || s === 'approved' || s === 'rejected';
  }, [data?.application.status]);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/applications/${applicationId}/pre-screening`, { method: 'GET' });
    const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
    if (!res.ok) {
      setLoadError(json.error ?? 'Failed to load pre-screening');
      setData(null);
      return;
    }
    setData(json as Payload);
  }, [applicationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<PreScreeningCategory, ApiItem[]>();
    for (const c of PRE_SCREENING_CATEGORY_ORDER) map.set(c, []);
    for (const row of data?.items ?? []) {
      const list = map.get(row.category as PreScreeningCategory);
      if (list) list.push(row);
    }
    return map;
  }, [data?.items]);

  const onUpdateItem = useCallback(
    async (itemKey: string, status: 'yes' | 'no' | 'pending', notes: string | null) => {
      setActionError(null);
      const res = await fetch(`/api/applications/${applicationId}/pre-screening`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: itemKey, status, notes }),
      });
      const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? 'Update failed');
        return;
      }
      setData(json as Payload);
    },
    [applicationId],
  );

  const onComplete = useCallback(async () => {
    setActionError(null);
    setCompleting(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/pre-screening/complete`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        outcome?: string;
        application_status?: string;
        dd_questionnaire_id?: string | null;
        flagged_for_review?: boolean;
      };
      if (!res.ok) {
        setActionError(json.error ?? 'Completion failed');
        return;
      }
      await refresh();
    } finally {
      setCompleting(false);
    }
  }, [applicationId, refresh]);

  if (loading) {
    return (
      <div className={cn(dsCard.padded, dsType.muted)}>
        Loading pre-screening…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-gray-900 shadow-sm">
        <p className="font-medium">{loadError ?? 'Unable to load data.'}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const summary = summaryLabel(data.evaluation);
  const canComplete = data.evaluation !== 'incomplete' && !readonly;

  return (
    <div className="space-y-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-[#0B1F45]">{data.application.fund_name}</h2>
          <div className={cn('mt-1 flex flex-wrap items-center gap-2', dsType.muted)}>
            <span className="font-mono text-xs text-gray-500">{data.application.id}</span>
            <StatusBadge status={data.application.status} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/onboarding">Back to onboarding</Link>
          </Button>
        </div>
      </div>

      {data.application.cfp ? <CfpInfoStrip cfp={data.application.cfp} /> : null}

      <div className={cn('rounded-xl p-5 shadow-sm', toneClass[summary.tone])}>
        <p className={dsType.sectionTitle}>Summary</p>
        <p className="mt-1 text-lg font-semibold text-[#0B1F45]">{summary.headline}</p>
        <p className={cn('mt-2 text-sm', dsType.body)}>{summary.detail}</p>
        {data.checklist.reviewed_at && (
          <p className={cn('mt-3 text-xs', dsType.muted)}>
            Last completed: {formatDateTime(data.checklist.reviewed_at)}
            {data.checklist.flagged_for_review ? ' · Flagged for officer review' : ''}
          </p>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gray-900">{actionError}</div>
      )}

      <div className="space-y-10">
        {PRE_SCREENING_CATEGORY_ORDER.map((category) => {
          const slice = data.progress.find((p) => p.category === category);
          const items = itemsByCategory.get(category) ?? [];
          return (
            <ChecklistCategory
              key={category}
              category={category}
              items={items}
              progress={slice ? { category, total: slice.total, answered: slice.answered } : undefined}
              disabled={readonly}
              onUpdateItem={onUpdateItem}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn('text-xs', dsType.muted)}>
          Completing runs DBJ rules: all items must be answered; all Yes advances to Due Diligence and opens a DD
          questionnaire. Any No in Legal & Regulatory flags officer review.
        </p>
        <Button type="button" disabled={!canComplete || completing} onClick={() => void onComplete()}>
          {completing ? 'Processing…' : 'Complete Pre-Screening'}
        </Button>
      </div>

      <EntityActivitySection entityType="fund_application" entityId={applicationId} />
    </div>
  );
}
