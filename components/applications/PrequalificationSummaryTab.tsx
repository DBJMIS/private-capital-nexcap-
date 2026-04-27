import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { CHECKLIST_ITEM_LABELS, S21_KEYS, S22_KEYS, type PrequalificationRow } from '@/lib/prequalification/types';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { dsCard } from '@/components/ui/design-system';
import { ShortlistingSection } from '@/components/applications/ShortlistingSection';

function tone(v: string): string {
  if (v === 'yes') return 'bg-emerald-50 text-emerald-700';
  if (v === 'no') return 'bg-red-50 text-red-700';
  if (v === 'partial') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-500';
}

function parseShortlist(meta: Record<string, unknown> | null): {
  notes: string | null;
  decided_at: string | null;
  decision: string | null;
} | null {
  if (!meta) return null;
  const s = meta.shortlisting;
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  return {
    notes: o.notes != null ? String(o.notes) : null,
    decided_at: o.decided_at != null ? String(o.decided_at) : null,
    decision: o.decision != null ? String(o.decision) : null,
  };
}

export function PrequalificationSummaryTab({
  applicationId,
  applicationStatus,
  prequalification,
  pipelineMetadata,
  canWrite,
}: {
  applicationId: string;
  applicationStatus: string;
  prequalification: PrequalificationRow | null;
  pipelineMetadata: Record<string, unknown> | null;
  canWrite: boolean;
}) {
  if (!prequalification) {
    return (
      <section className={dsCard.padded}>
        <p className="text-sm text-gray-600">Pre-qualification has not started yet.</p>
        <Button asChild className="mt-4 bg-[#0B1F45] text-white hover:bg-[#162d5e]">
          <Link href={`/applications/${applicationId}/prequalification`}>Start Pre-qualification</Link>
        </Button>
      </section>
    );
  }

  const meta = pipelineMetadata && typeof pipelineMetadata === 'object' ? pipelineMetadata : null;
  const shortlist = parseShortlist(meta);

  return (
    <section className={dsCard.padded}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Pre-qualification Summary</h3>
        <Button asChild variant="outline" size="sm">
          <Link href={`/applications/${applicationId}/prequalification`}>View Full Pre-qualification →</Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <Summary label="Date received" value={prequalification.date_received ?? '—'} />
        <Summary label="Time received" value={prequalification.time_received ? prequalification.time_received.slice(0, 5) : '—'} />
        <Summary label="Soft copy" value={prequalification.soft_copy_received ? 'Yes' : 'No'} />
        <Summary label="Hard copy" value={prequalification.hard_copy_received ? 'Yes' : 'No'} />
        <Summary
          label="Decision"
          value={prequalification.overall_status === 'pending' ? 'Pending' : prequalification.overall_status === 'prequalified' ? 'Prequalified' : 'Not prequalified'}
        />
        <Summary
          label="Reviewed"
          value={prequalification.reviewed_at ? `${prequalification.reviewer_name ?? 'Officer'} · ${formatDateTime(prequalification.reviewed_at)}` : '—'}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChecklistBlock title="Section 2.1" keys={S21_KEYS} row={prequalification} />
        <ChecklistBlock title="Section 2.2" keys={S22_KEYS} row={prequalification} />
      </div>

      {prequalification.ai_summary ? (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-semibold text-[#0B1F45]">AI Summary</p>
          <p className="mt-1">{String((prequalification.ai_summary as { overall?: string })?.overall ?? 'Available in full view')}</p>
        </div>
      ) : null}

      {prequalification.overall_status === 'prequalified' ? (
        <ShortlistingSection
          applicationId={applicationId}
          applicationStatus={applicationStatus}
          shortlist={shortlist}
          canWrite={canWrite}
        />
      ) : null}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium text-[#0B1F45]">{value}</p>
    </div>
  );
}

function ChecklistBlock({
  title,
  keys,
  row,
}: {
  title: string;
  keys: readonly string[];
  row: PrequalificationRow;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-[#0B1F45]">{title}</div>
      <ul className="divide-y divide-gray-100">
        {keys.map((k) => (
          <li key={k} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="text-gray-700">{CHECKLIST_ITEM_LABELS[k] ?? k}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold uppercase', tone(String((row as Record<string, unknown>)[k])))}>
              {String((row as Record<string, unknown>)[k]).replace('_', ' ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
