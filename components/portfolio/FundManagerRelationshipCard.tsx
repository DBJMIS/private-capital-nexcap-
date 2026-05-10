'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ContactManagementPanel } from '@/components/fund-managers/ContactManagementPanel';
import { FundManagerAssociateModal } from '@/components/portfolio/FundManagerAssociateModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFundManager } from '@/hooks/useFundManager';
import { cn } from '@/lib/utils';

function fmtDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const raw = iso.includes('T') ? iso : `${iso}T12:00:00`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function healthBadgeClass(health: string): string {
  switch (health) {
    case 'STRONG':
      return 'bg-teal-50 text-teal-700';
    case 'STRAINED':
      return 'bg-amber-50 text-amber-700';
    case 'INACTIVE':
      return 'bg-gray-100 text-gray-500';
    case 'DEVELOPING':
    default:
      return 'bg-blue-50 text-blue-700';
  }
}

function weakSectionsSummary(sections: string[] | undefined): string {
  const w = sections ?? [];
  if (w.length === 0) return '—';
  if (w.length <= 2) return w.join(', ');
  return `${w.length} sections`;
}

/** Fund manager + AI relationship intelligence — right sidebar on fund detail Overview. */
export function FundManagerRelationshipCard({ fundId, canWrite }: { fundId: string; canWrite: boolean }) {
  const router = useRouter();
  const {
    linked,
    fundManagerId,
    manager,
    profile,
    profileRecord,
    notes,
    lastContact,
    isLoading,
    isRegenerating,
    error,
    reload,
    regenerate,
    addNote,
  } = useFundManager(fundId);

  const [expanded, setExpanded] = useState(false);
  const [associateOpen, setAssociateOpen] = useState(false);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);

  const health = (profile?.relationship_health as string) ?? 'DEVELOPING';
  const timeline = useMemo(() => {
    const rows = profile?.interaction_timeline ?? [];
    return rows
      .filter((r) => r && typeof r.date === 'string' && typeof r.event === 'string')
      .map((r) => ({
        date: r.date,
        event: r.event,
        outcome: typeof r.outcome === 'string' ? r.outcome : '',
      }));
  }, [profile?.interaction_timeline]);

  const timelineVisible = showAllTimeline ? timeline : timeline.slice(0, 4);
  const dd = profile?.dd_history;

  const summaryText = profile?.summary?.trim() ?? '';
  const hasGeneratedSummary = summaryText.length > 0;

  const onLinkedContinue = async () => {
    router.refresh();
    const mid = await reload();
    if (mid) await regenerate(mid);
  };

  const submitNote = async () => {
    if (!noteDraft.trim()) return;
    setNoteBusy(true);
    setNoteErr(null);
    try {
      await addNote(noteDraft.trim());
      setNoteDraft('');
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : 'Failed to add note');
    } finally {
      setNoteBusy(false);
    }
  };

  const showSummarySkeleton = isRegenerating;

  const associateModal = (
    <FundManagerAssociateModal open={associateOpen} fundId={fundId} onClose={() => setAssociateOpen(false)} onLinked={onLinkedContinue} />
  );

  if (!isLoading && linked === null && error) {
    return (
      <>
        <section className="rounded-xl border border-red-100 bg-red-50/50 p-5">
          <p className="text-sm font-medium text-red-800">Could not load relationship data</p>
          <p className="mt-1 text-xs text-red-700">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={() => void reload()}>
            Try again
          </Button>
        </section>
        {associateModal}
      </>
    );
  }

  if (isLoading && linked === null) {
    return (
      <>
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex animate-pulse items-center justify-between gap-2">
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="h-6 w-20 rounded-full bg-gray-100" />
          </div>
          <div className="mt-3 space-y-2 animate-pulse">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="mt-4 h-px w-full bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-14 w-full rounded bg-gray-100" />
          </div>
        </section>
        {associateModal}
      </>
    );
  }

  if (linked === false) {
    return (
      <>
        <section className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <UserPlus className="mx-auto h-8 w-8 text-[#00A99D]" />
          <p className="mt-2 text-sm font-medium text-gray-900">No fund manager linked</p>
          <p className="mt-1 text-xs text-gray-500">Associate a fund manager to enable relationship intelligence</p>
          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-8 border-[#00A99D] text-xs text-[#00A99D] hover:bg-[#E6F7F6]"
              onClick={() => setAssociateOpen(true)}
            >
              Associate Manager
            </Button>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </section>
        {associateModal}
      </>
    );
  }

  if (!manager || !fundManagerId) {
    return associateModal;
  }

  return (
    <div className="w-full">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-[#00A99D]" />
            <span className="text-sm font-semibold text-gray-700">Fund Manager</span>
          </div>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', healthBadgeClass(health))}>
            {health}
          </span>
        </div>

        <div className="mt-3 space-y-1">
          <p className="font-medium text-gray-900">{manager.name}</p>
          <p className="text-sm text-gray-500">{manager.firm_name}</p>
          {manager.email ? (
            <a href={`mailto:${manager.email}`} className="block text-xs text-gray-400 hover:text-[#00A99D]">
              {manager.email}
            </a>
          ) : null}
          <p className="text-xs text-gray-400">{lastContact ? `Last contact: ${fmtDisplayDate(lastContact)}` : 'No interactions recorded'}</p>
        </div>

        <div className="my-4 border-t border-gray-100" />

        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-3 w-3 shrink-0 text-[#00A99D]" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">AI Summary</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F7F6] px-2 py-0.5 text-[10px] font-medium text-[#00A99D]">
            <Sparkles className="h-3 w-3" aria-hidden />
            AI Generated
          </span>
        </div>

        {showSummarySkeleton && hasGeneratedSummary ? (
          <div className="mt-2 h-14 animate-pulse rounded-md bg-gray-100" aria-hidden />
        ) : showSummarySkeleton && !hasGeneratedSummary ? (
          <div className="mt-2 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-[83%] animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-[66%] animate-pulse rounded bg-gray-100" />
          </div>
        ) : summaryText ? (
          <p className="mt-2 text-sm italic text-gray-600">{summaryText}</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-400">No profile generated yet</p>
            {canWrite ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-[#00A99D] px-2 text-xs text-[#00A99D] hover:bg-[#E6F7F6]"
                disabled={isRegenerating}
                onClick={() => void regenerate()}
              >
                {isRegenerating ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Generating...
                  </span>
                ) : (
                  'Generate'
                )}
              </Button>
            ) : null}
          </div>
        )}

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-1 text-xs font-medium text-[#00A99D] hover:text-[#008c82]"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          View Full Profile
          {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </button>

        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </section>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          expanded ? 'mt-3 max-h-[8000px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2">
            <Sparkles className="h-3 w-3 shrink-0 text-[#00A99D]" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">AI Generated content</span>
          </div>

          <div className={cn(isRegenerating && 'animate-pulse')} aria-busy={isRegenerating}>
            <section className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-[#00A99D]">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Strengths
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(profile?.strengths ?? []).map((s, i) => (
                  <span key={`${s}-${i}`} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                    {s}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-4 space-y-1">
              <div className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Concerns
              </div>
              <div className="flex flex-wrap gap-2">
                {(profile?.concerns ?? []).map((s, i) => (
                  <span key={`${s}-${i}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    {s}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-gray-600">Recommended Next Steps</p>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F7F6] px-1.5 py-0.5 text-[9px] font-medium text-[#00A99D]">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  AI Generated
                </span>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                {(profile?.recommended_next_steps ?? []).map((x, i) => (
                  <li key={`${x}-${i}`}>{x}</li>
                ))}
              </ol>
            </section>

            <section className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">DD History</p>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F7F6] px-1.5 py-0.5 text-[9px] font-medium text-[#00A99D]">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  AI Generated
                </span>
              </div>
              <div className="flex divide-x divide-gray-100 overflow-hidden rounded-lg border border-gray-100 bg-[#fafafa]">
                <div className="min-w-0 flex-1 px-2 py-2 text-center sm:px-3 sm:text-left">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Submissions</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">{dd?.submissions ?? 0}</p>
                </div>
                <div className="min-w-0 flex-1 px-2 py-2 text-center sm:px-3 sm:text-left">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Avg Score</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">{Number(dd?.avg_score ?? 0).toFixed(1)}</p>
                </div>
                <div className="min-w-0 flex-1 px-2 py-2 text-center sm:px-3 sm:text-left">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Weak Sections</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-gray-900">{weakSectionsSummary(dd?.sections_consistently_weak)}</p>
                </div>
              </div>
            </section>

            <section className="mt-4 border-t border-gray-100 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-gray-600">Interaction Timeline</p>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F7F6] px-1.5 py-0.5 text-[9px] font-medium text-[#00A99D]">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  AI Generated
                </span>
              </div>
              <div className="mt-2 space-y-2">
                {timelineVisible.map((e, i) => (
                  <div key={`${e.date}-${i}`} className="flex gap-2 border-l-2 border-[#00A99D] pl-3">
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400">{fmtDisplayDate(e.date)}</p>
                      <p className="text-xs font-medium text-gray-900">{e.event}</p>
                      {e.outcome ? <p className="text-[11px] text-gray-500">{e.outcome}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
              {timeline.length > 4 ? (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-[#00A99D] hover:underline"
                  onClick={() => setShowAllTimeline((s) => !s)}
                >
                  {showAllTimeline ? 'Show less' : 'Show more'}
                </button>
              ) : null}
            </section>

            <section className="mt-4 space-y-1 border-t border-gray-100 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                  <Info className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                  Data Gaps
                </div>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F7F6] px-1.5 py-0.5 text-[9px] font-medium text-[#00A99D]">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  AI Generated
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(profile?.data_gaps ?? []).map((g, i) => (
                  <span key={`${g}-${i}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {g}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-4 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600">Staff Notes</p>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="rounded-md border border-gray-100 bg-gray-50 p-2">
                  <p className="text-sm text-gray-800">{n.note}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {n.author_name} · {fmtDisplayDate(n.created_at)}
                  </p>
                </div>
              ))}
            </div>
            {canWrite ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  className="text-sm"
                  placeholder="Add a note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  disabled={noteBusy}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0 gap-2 bg-[#0B1F45] text-white hover:bg-[#162d5e]"
                  disabled={noteBusy || !noteDraft.trim()}
                  onClick={() => void submitNote()}
                >
                  {noteBusy ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : null}
                  Submit
                </Button>
              </div>
            ) : null}
            {noteErr ? <p className="mt-1 text-xs text-red-600">{noteErr}</p> : null}
          </section>

          <div className="my-4 border-t border-gray-100" />
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0 text-[#00A99D]"
                aria-hidden
              >
                <path
                  d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13-1a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM23 21v-2a5 5 0 0 0-3.8-4.8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Portal Contacts
            </div>
            <ContactManagementPanel fundManagerId={fundManagerId} firmName={manager.firm_name} portfolioFundId={fundId} readonly={!canWrite} />
          </section>

          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-10 w-full gap-2 border-[#00A99D] text-sm text-[#00A99D] hover:bg-[#E6F7F6]"
              disabled={isRegenerating}
              onClick={() => void regenerate()}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  Regenerating...
                </>
              ) : (
                'Regenerate Profile'
              )}
            </Button>
          ) : null}

          <p className="mt-2 text-center text-xs text-gray-400">Last generated: {profileRecord?.generated_at ? fmtDisplayDate(profileRecord.generated_at) : '—'}</p>
          <p className="mt-1 text-center text-xs italic text-gray-400">AI-generated profile — review before acting on recommendations</p>
        </div>
      </div>

      {associateModal}
    </div>
  );
}
