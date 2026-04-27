'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, ExternalLink } from 'lucide-react';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { DD_SECTION_SEQUENCE } from '@/lib/questionnaire/section-order';
import type { DdQuestionnaireWorkspace } from '@/lib/applications/dd-questionnaire-workspace';
import { formatShortDate } from '@/lib/format-date';

const SECTION_PILL_LABEL: Record<string, string> = {
  basic_info: 'Basic Info',
  sponsor: 'Sponsor',
  deal_flow: 'Deal Flow',
  portfolio_monitoring: 'Monitoring',
  investment_strategy: 'Strategy',
  governing_rules: 'Gov. Rules',
  investors_fundraising: 'Investors',
  legal: 'Legal',
  additional: 'Additional',
};

function questionnaireStatusForBadge(status: string | null): string {
  const v = (status ?? 'draft').trim().toLowerCase();
  if (v === 'draft') return 'not_started';
  return v;
}

function pillIcon(status: string) {
  const s = status.trim().toLowerCase();
  if (s === 'completed') return <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />;
  if (s === 'in_progress') return <Clock className="h-3 w-3 shrink-0" aria-hidden />;
  return <Circle className="h-3 w-3 shrink-0" aria-hidden />;
}

function pillClasses(status: string) {
  const s = status.trim().toLowerCase();
  if (s === 'completed') return 'bg-teal-50 text-teal-700';
  if (s === 'in_progress') return 'bg-amber-50 text-amber-600';
  return 'bg-gray-50 text-gray-400';
}

export function DueDiligenceTab({
  applicationId,
  questionnaire,
}: {
  applicationId: string;
  questionnaire: DdQuestionnaireWorkspace | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const onCreate = async () => {
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/dd-questionnaire`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
      if (!res.ok) {
        setCreateError(json.error ?? 'Request failed');
        return;
      }
      router.refresh();
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(false);
    }
  };

  if (!questionnaire) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">DD Questionnaire not yet created</p>
            <p className="mt-2 text-sm text-amber-700">
              Create a questionnaire to capture due diligence sections for this application.
            </p>
            <Button
              type="button"
              className="mt-4 bg-[#0B1F45] text-white hover:bg-[#162d5e]"
              disabled={creating}
              onClick={() => void onCreate()}
            >
              {creating ? 'Creating…' : 'Create DD Questionnaire'}
            </Button>
            {createError ? <p className="mt-2 text-xs text-red-600">{createError}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const byKey = new Map(questionnaire.sections.map((s) => [s.section_key, s.status]));
  const ordered = DD_SECTION_SEQUENCE.map((s) => ({
    key: s.key,
    status: byKey.get(s.key) ?? 'not_started',
    label: SECTION_PILL_LABEL[s.key] ?? s.key,
  }));

  const completedCount = ordered.filter((s) => s.status.toLowerCase() === 'completed').length;
  const pct = Math.round((completedCount / 9) * 100);
  const qStatus = (questionnaire.status ?? 'draft').trim().toLowerCase();
  const isCompleted = qStatus === 'completed';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[#0B1F45]">DD Questionnaire</h3>
        <StatusBadge status={questionnaireStatusForBadge(questionnaire.status)} />
      </div>

      <div className="mt-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-gray-400">Section progress</p>
        <div className="grid grid-cols-3 gap-2">
          {ordered.map((s) => (
            <div
              key={s.key}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${pillClasses(s.status)}`}
            >
              {pillIcon(s.status)}
              <span className="truncate">{s.label}</span>
            </div>
          ))}
        </div>

        <p className="mb-2 mt-4 text-xs text-gray-500">
          {completedCount} of 9 sections complete
        </p>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div className="h-2 rounded-full bg-[#0F8A6E] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {!isCompleted ? (
          <Button asChild className="rounded-xl bg-[#0B1F45] px-6 py-3 text-sm font-semibold text-white hover:bg-[#162d5e]">
            <Link href={`/questionnaires/${questionnaire.id}`} className="inline-flex items-center gap-2">
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open DD Questionnaire →
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="outline" className="rounded-xl px-6 py-3 text-sm font-semibold">
              <Link href={`/questionnaires/${questionnaire.id}`} className="inline-flex items-center gap-2">
                View Submission →
              </Link>
            </Button>
            <p className="w-full text-xs text-gray-400">
              Completed on {questionnaire.completed_at ? formatShortDate(questionnaire.completed_at) : '—'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
