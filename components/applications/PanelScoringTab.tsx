'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Paperclip, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { dsCard, dsField } from '@/components/ui/design-system';
import { PANEL_CRITERIA, PANEL_CRITERIA_COUNT, PANEL_SCORING_GROUPS, type PanelRating } from '@/lib/applications/panel-scoring';
import { cn } from '@/lib/utils';

type Member = {
  id: string;
  member_name: string;
  member_organisation: string | null;
  member_email?: string | null;
  member_type: string;
};

type PanelScoreStatus = 'not_scored' | 'in_progress' | 'submitted';

type Score = { criterion_key: string; category: string; rating: PanelRating | null; notes: string | null };
type AiRecommendation = {
  recommendation: 'full_dd' | 'conditional_dd' | 'no_dd';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  strengths: string[];
  concerns: string[];
  conditions: string;
  reasoning: string;
};

type Evaluation = {
  id: string;
  panel_member_id: string;
  status: 'pending' | 'in_progress' | 'submitted' | string;
  dd_vote: 'full_dd' | 'conditional_dd' | 'no_dd' | null;
  conditions: string | null;
  general_notes: string | null;
  submitted_at: string | null;
  scores: Score[];
  ai_recommendation?: unknown;
  ai_recommended_at?: string | null;
};

type MemberSummary = {
  member: Member;
  evaluation: Evaluation | null;
  scores: Score[];
  status: PanelScoreStatus;
};

type CollatedRow = {
  criterion_key: string;
  label: string;
  ratings: Record<string, PanelRating | null>;
};

function parseAiRecommendation(raw: unknown): AiRecommendation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rec = o.recommendation;
  if (rec !== 'full_dd' && rec !== 'conditional_dd' && rec !== 'no_dd') return null;
  const conf = o.confidence;
  if (conf !== 'high' && conf !== 'medium' && conf !== 'low') return null;
  return {
    recommendation: rec,
    confidence: conf,
    summary: typeof o.summary === 'string' ? o.summary : '',
    strengths: Array.isArray(o.strengths) ? o.strengths.map((x) => String(x)) : [],
    concerns: Array.isArray(o.concerns) ? o.concerns.map((x) => String(x)) : [],
    conditions: typeof o.conditions === 'string' ? o.conditions : '',
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
  };
}

function countValidRated(scores: Record<string, PanelRating | null>): number {
  return Object.values(scores).filter(
    (r): r is PanelRating => Boolean(r && (['S', 'R', 'W', 'I'] as const).includes(r)),
  ).length;
}

function aiDdShortLabel(rec: 'full_dd' | 'conditional_dd' | 'no_dd'): string {
  if (rec === 'full_dd') return 'Full DD';
  if (rec === 'conditional_dd') return 'Conditional DD';
  return 'No DD';
}

function titleCaseMemberName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => {
      const w = part.trim();
      if (!w) return '';
      if (w.length === 1) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(' ');
}

function initialsFromMemberName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const first = parts[0]![0] ?? '';
  const last = parts[parts.length - 1]![0] ?? '';
  const s = `${first}${last}`.toUpperCase();
  return s || '??';
}

type DdVoteValue = 'full_dd' | 'conditional_dd' | 'no_dd' | null | undefined;

function DdVoteBadge({ vote }: { vote: DdVoteValue }) {
  if (!vote) {
    return <span className="text-sm text-gray-300">—</span>;
  }
  if (vote === 'full_dd') {
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
        Full Due Diligence
      </span>
    );
  }
  if (vote === 'conditional_dd') {
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        Conditional DD
      </span>
    );
  }
  return (
    <span className="inline-block whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
      No Due Diligence
    </span>
  );
}

function majorityVoteLabel(totals: { full_dd: number; conditional_dd: number; no_dd: number }): string | null {
  const { full_dd, conditional_dd, no_dd } = totals;
  const max = Math.max(full_dd, conditional_dd, no_dd);
  if (max <= 0) return null;
  const winners: Array<'full_dd' | 'conditional_dd' | 'no_dd'> = [];
  if (full_dd === max) winners.push('full_dd');
  if (conditional_dd === max) winners.push('conditional_dd');
  if (no_dd === max) winners.push('no_dd');
  if (winners.length !== 1) return null;
  const w = winners[0]!;
  if (w === 'full_dd') return 'Full Due Diligence';
  if (w === 'conditional_dd') return 'Conditional DD';
  return 'No Due Diligence';
}

export function PanelScoringTab({ applicationId, fundName = 'Fund manager' }: { applicationId: string; fundName?: string }) {
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSummaries, setMemberSummaries] = useState<MemberSummary[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [collated, setCollated] = useState<CollatedRow[]>([]);
  const [voteTotals, setVoteTotals] = useState({ full_dd: 0, conditional_dd: 0, no_dd: 0 });

  const [openMember, setOpenMember] = useState<Member | null>(null);
  const [scores, setScores] = useState<Record<string, PanelRating | null>>({});
  const [ddVote, setDdVote] = useState<'full_dd' | 'conditional_dd' | 'no_dd' | null>(null);
  const [conditions, setConditions] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [sheet, setSheet] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [aiRecommendation, setAiRecommendation] = useState<AiRecommendation | null>(null);
  const [aiRecommendBusy, setAiRecommendBusy] = useState(false);
  const [aiRecommendErr, setAiRecommendErr] = useState<string | null>(null);
  const [recommendationApplied, setRecommendationApplied] = useState(false);
  const [revealAiCard, setRevealAiCard] = useState(false);
  const [conclusiveFromAi, setConclusiveFromAi] = useState(false);
  const [aiVisualReady, setAiVisualReady] = useState(false);

  const autoAiAttemptDoneRef = useRef(false);
  const recommendationRef = useRef<HTMLDivElement | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/panel-scores`, { cache: 'no-store' });
      const j = (await res.json()) as {
        data: {
          members: Member[];
          member_summaries?: MemberSummary[];
          evaluations: Evaluation[];
          collated: CollatedRow[];
          vote_totals: { full_dd: number; conditional_dd: number; no_dd: number };
        } | null;
        error: string | null;
      };
      if (!res.ok || !j.data) {
        setErr(j.error ?? 'Failed to load panel evaluations');
        return;
      }
      setMembers(j.data.members);
      setEvaluations(j.data.evaluations);
      setCollated(j.data.collated);
      setVoteTotals(j.data.vote_totals);

      const summaries: MemberSummary[] =
        j.data.member_summaries ??
        j.data.members.map((m) => {
          const evaluation = j.data!.evaluations.find((e) => e.panel_member_id === m.id) ?? null;
          const raw = evaluation?.status ?? 'pending';
          const status: PanelScoreStatus =
            raw === 'submitted' ? 'submitted' : raw === 'in_progress' ? 'in_progress' : 'not_scored';
          return {
            member: m,
            evaluation,
            scores: evaluation?.scores ?? [],
            status,
          };
        });
      setMemberSummaries(summaries);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const completedCount = memberSummaries.filter((s) => s.status === 'submitted').length;
  const progressPct = memberSummaries.length ? Math.round((completedCount / memberSummaries.length) * 100) : 0;
  const voteMajorityLabel = useMemo(() => majorityVoteLabel(voteTotals), [voteTotals]);

  const clearRevealTimeout = () => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  };

  const closeScoringModal = () => {
    clearRevealTimeout();
    autoAiAttemptDoneRef.current = false;
    setOpenMember(null);
    setAiRecommendation(null);
    setAiRecommendBusy(false);
    setAiRecommendErr(null);
    setRecommendationApplied(false);
    setRevealAiCard(false);
    setConclusiveFromAi(false);
    setAiVisualReady(false);
  };

  const applyDdFromRecommendation = useCallback((rec: AiRecommendation) => {
    setDdVote(rec.recommendation);
    if (rec.recommendation === 'conditional_dd' && rec.conditions.trim()) {
      setConditions(rec.conditions.trim());
    }
  }, []);

  const openScoring = (member: Member) => {
    clearRevealTimeout();
    autoAiAttemptDoneRef.current = false;
    const ev = evaluations.find((e) => e.panel_member_id === member.id);
    const nextScores: Record<string, PanelRating | null> = {};
    for (const group of PANEL_SCORING_GROUPS) {
      for (const item of group.items) {
        nextScores[item.key] = ev?.scores.find((s) => s.criterion_key === item.key)?.rating ?? null;
      }
    }
    setOpenMember(member);
    setScores(nextScores);
    setDdVote(ev?.dd_vote ?? null);
    setConditions(ev?.conditions ?? '');
    setGeneralNotes(ev?.general_notes ?? '');
    setSheet(null);
    const parsedAi = parseAiRecommendation(ev?.ai_recommendation ?? null);
    setAiRecommendation(parsedAi);
    setAiRecommendErr(null);
    setRecommendationApplied(false);
    setRevealAiCard(Boolean(parsedAi));
    setAiVisualReady(Boolean(parsedAi));
    setConclusiveFromAi(Boolean(parsedAi && ev?.dd_vote && ev.dd_vote === parsedAi.recommendation));
  };

  const fetchAiRecommendation = useCallback(
    async (opts?: { isRegenerate?: boolean }) => {
      if (!openMember) return;
      for (const c of PANEL_CRITERIA) {
        if (!scores[c.key]) {
          setAiRecommendErr(`All ${PANEL_CRITERIA_COUNT} criteria must be rated first.`);
          return;
        }
      }
      autoAiAttemptDoneRef.current = true;
      if (opts?.isRegenerate) {
        clearRevealTimeout();
        setRevealAiCard(false);
      }
      setAiRecommendBusy(true);
      setAiRecommendErr(null);
      let success = false;
      try {
        const body = {
          panel_member_id: openMember.id,
          member_name: openMember.member_name,
          fund_name: fundName,
          scores: PANEL_CRITERIA.map((c) => ({ criterion_key: c.key, rating: scores[c.key] as string })),
        };
        const res = await fetch(`/api/applications/${applicationId}/panel-scores/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { data: { recommendation: AiRecommendation } | null; error: string | null };
        if (!res.ok || !j.data?.recommendation) {
          setAiRecommendErr(j.error ?? 'Failed to get AI recommendation');
          return;
        }
        const rec = j.data.recommendation;
        setAiRecommendation(rec);
        applyDdFromRecommendation(rec);
        setConclusiveFromAi(true);
        setRecommendationApplied(true);
        await load();
        success = true;
      } finally {
        setAiRecommendBusy(false);
      }
      if (success) {
        clearRevealTimeout();
        setRevealAiCard(false);
        revealTimeoutRef.current = setTimeout(() => {
          setRevealAiCard(true);
          requestAnimationFrame(() => {
            recommendationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          revealTimeoutRef.current = null;
        }, 300);
      }
    },
    [applyDdFromRecommendation, applicationId, fundName, load, openMember, scores],
  );

  const applyAiRecommendation = () => {
    if (!aiRecommendation) return;
    applyDdFromRecommendation(aiRecommendation);
    setConclusiveFromAi(true);
    setRecommendationApplied(true);
  };

  const ratedCount = useMemo(() => countValidRated(scores), [scores]);
  const allCriteriaRated = ratedCount === PANEL_CRITERIA_COUNT;
  const showAiLoadingPanel =
    Boolean(openMember) &&
    allCriteriaRated &&
    !aiRecommendErr &&
    (aiRecommendBusy || (Boolean(aiRecommendation) && !revealAiCard));
  const showAiRecommendationCard = Boolean(openMember && aiRecommendation && revealAiCard && !aiRecommendBusy);
  const opinionDiffersFromAi = Boolean(
    aiRecommendation && ddVote && aiRecommendation.recommendation !== ddVote,
  );

  useEffect(() => {
    if (!showAiRecommendationCard) {
      setAiVisualReady(false);
      return;
    }
    setAiVisualReady(false);
    const id = window.requestAnimationFrame(() => setAiVisualReady(true));
    return () => window.cancelAnimationFrame(id);
  }, [showAiRecommendationCard]);

  const selectOpinion = (vote: 'full_dd' | 'conditional_dd' | 'no_dd') => {
    setConclusiveFromAi(false);
    setDdVote(vote);
  };

  useEffect(() => {
    if (!openMember) return;
    const n = countValidRated(scores);
    if (n < PANEL_CRITERIA_COUNT) {
      autoAiAttemptDoneRef.current = false;
      return;
    }
    if (aiRecommendation) return;
    if (aiRecommendBusy) return;
    if (aiRecommendErr) return;
    if (autoAiAttemptDoneRef.current) return;

    void fetchAiRecommendation();
  }, [aiRecommendBusy, aiRecommendErr, aiRecommendation, fetchAiRecommendation, openMember, scores]);

  useEffect(() => {
    return () => clearRevealTimeout();
  }, []);

  const save = async () => {
    if (!openMember) return;
    setBusy(true);
    setErr(null);
    try {
      const payloadScores = Object.entries(scores).map(([criterion_key, rating]) => {
        const category = PANEL_SCORING_GROUPS.find((g) => g.items.some((i) => i.key === criterion_key))?.category ?? 'GENERAL';
        return { criterion_key, category, rating };
      });
      const fd = new FormData();
      fd.set('panel_member_id', openMember.id);
      fd.set('dd_vote', ddVote ?? '');
      fd.set('conditions', conditions);
      fd.set('general_notes', generalNotes);
      fd.set('scores', JSON.stringify(payloadScores));
      if (sheet) fd.set('sheet', sheet);
      const res = await fetch(`/api/applications/${applicationId}/panel-scores`, {
        method: 'POST',
        body: fd,
      });
      const j = (await res.json()) as { error: string | null };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to save scores');
        return;
      }
      closeScoringModal();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className={dsCard.padded}>Loading panel scoring…</div>;

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0B1F45]">Panel Evaluation Scoring</h3>
          <p className="mt-0.5 text-sm text-gray-400">Enter scores for each panel member</p>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 self-start rounded-full bg-gray-100 px-3 py-1.5 sm:w-auto sm:self-center">
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-[#0F8A6E] transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-600">
            {completedCount} of {memberSummaries.length} scored
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {memberSummaries.map(({ member: m, status }) => (
          <div
            key={m.id}
            className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B1F45] text-sm font-semibold text-white"
                aria-hidden
              >
                {initialsFromMemberName(m.member_name)}
              </span>
              <ScoringStatusBadge status={status} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0B1F45]">{titleCaseMemberName(m.member_name)}</p>
              {m.member_organisation ? (
                <p className="mt-0.5 truncate text-xs text-gray-400">{m.member_organisation}</p>
              ) : null}
              <span
                className={cn(
                  'mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                  m.member_type === 'voting' ? 'bg-[#0B1F45]/10 text-[#0B1F45]' : 'bg-gray-100 text-gray-500',
                )}
              >
                {m.member_type === 'voting' ? 'Voting' : 'Observer'}
              </span>
            </div>
            <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={() => openScoring(m)}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition-colors',
                  status === 'submitted'
                    ? 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    : 'bg-[#0B1F45] text-white hover:bg-[#162d5e]',
                )}
              >
                {status === 'submitted' ? 'Edit scores' : 'Score →'}
              </button>
              <button
                type="button"
                title="Attach scoring sheet"
                onClick={() => openScoring(m)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              >
                <Paperclip className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      {collated.length > 0 ? (
        <section className={dsCard.shell}>
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="font-semibold text-[#0B1F45]">Evaluation Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Criteria</th>
                  {members.map((m) => (
                    <th
                      key={`head-${m.id}`}
                      className="max-w-[10rem] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                      title={m.member_name}
                    >
                      {titleCaseMemberName(m.member_name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {collated.map((row) => (
                  <tr key={row.criterion_key}>
                    <td className="px-4 py-2 text-[#0B1F45]">{row.label}</td>
                    {members.map((m) => (
                      <td key={`${row.criterion_key}-${m.id}`} className="px-4 py-2 text-center font-semibold text-gray-700">
                        {row.ratings[m.id] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="px-4 py-2 font-semibold text-[#0B1F45]">DD Vote</td>
                  {members.map((m) => {
                    const vote = evaluations.find((e) => e.panel_member_id === m.id)?.dd_vote as DdVoteValue;
                    return (
                      <td key={`vote-${m.id}`} className="px-4 py-2 text-center align-middle">
                        <DdVoteBadge vote={vote} />
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-6 py-3">
            <div className="flex items-center gap-1.5">
              <DdVoteBadge vote="full_dd" />
              <span className="font-bold text-[#0B1F45]">{voteTotals.full_dd}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DdVoteBadge vote="conditional_dd" />
              <span className="font-bold text-[#0B1F45]">{voteTotals.conditional_dd}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DdVoteBadge vote="no_dd" />
              <span className="font-bold text-[#0B1F45]">{voteTotals.no_dd}</span>
            </div>
            {voteMajorityLabel ? (
              <span className="ml-2 text-xs text-gray-500">· Majority: {voteMajorityLabel}</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {openMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-[#0B1F45]">Scoring — {openMember.member_name}</h3>
            <p className="text-sm text-gray-500">Enter S/R/W/I ratings from their evaluation form.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Legend tone="bg-[#0F8A6E] text-white" label="S · Strong" />
              <Legend tone="bg-blue-500 text-white" label="R · Regular" />
              <Legend tone="bg-amber-400 text-white" label="W · Weak" />
              <Legend tone="bg-gray-500 text-white" label="I · Incomplete" />
            </div>

            <div className="mt-4 space-y-4">
              {PANEL_SCORING_GROUPS.map((group) => (
                <div key={group.category} className="rounded-lg border border-gray-200">
                  <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.category}</div>
                  <div className="divide-y divide-gray-100 px-4">
                    {group.items.map((item) => (
                      <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <p className="text-sm text-gray-700">{item.label}</p>
                        <div className="flex gap-1.5">
                          {(['S', 'R', 'W', 'I'] as const).map((r) => (
                            <button
                              key={`${item.key}-${r}`}
                              type="button"
                              className={cn(
                                'h-8 w-8 rounded-lg text-xs font-bold transition-all duration-100',
                                scores[item.key] === r
                                  ? r === 'S'
                                    ? 'bg-[#0F8A6E] text-white'
                                    : r === 'R'
                                      ? 'bg-blue-500 text-white'
                                      : r === 'W'
                                        ? 'bg-amber-400 text-white'
                                        : 'bg-gray-500 text-white'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                              )}
                              onClick={() => setScores((prev) => ({ ...prev, [item.key]: r }))}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {ratedCount > 0 && ratedCount < PANEL_CRITERIA_COUNT ? (
              <p className="py-2 text-center text-xs text-gray-400">
                {ratedCount} of {PANEL_CRITERIA_COUNT} criteria rated · AI recommendation will generate automatically when complete
              </p>
            ) : null}

            {allCriteriaRated && aiRecommendErr && !aiRecommendBusy ? (
              <div className="mt-5 text-center text-xs text-red-500">
                AI recommendation failed ·{' '}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => {
                    autoAiAttemptDoneRef.current = false;
                    setAiRecommendErr(null);
                    void fetchAiRecommendation({});
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {showAiLoadingPanel ? (
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
                <div
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-indigo-700">Generating AI recommendation…</p>
                  <p className="mt-0.5 text-xs text-indigo-400">Analysing your {PANEL_CRITERIA_COUNT} criteria scores</p>
                </div>
              </div>
            ) : null}

            {showAiRecommendationCard && aiRecommendation ? (
              <div
                ref={recommendationRef}
                className={cn(
                  'mt-5 rounded-xl border border-indigo-200 bg-white p-4 transition-all duration-300 ease-in-out',
                  aiVisualReady ? 'translate-y-0 opacity-100' : 'translate-y-0.5 opacity-0',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                    <span className="text-sm font-semibold text-indigo-700">AI Recommendation</span>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    disabled={aiRecommendBusy}
                    onClick={() => void fetchAiRecommendation({ isRegenerate: true })}
                  >
                    Regenerate
                  </button>
                </div>

                {aiRecommendation.recommendation === 'full_dd' ? (
                  <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-center">
                    <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-teal-600" aria-hidden />
                    <p className="font-bold text-teal-700">Full Due Diligence</p>
                  </div>
                ) : aiRecommendation.recommendation === 'conditional_dd' ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="font-bold text-amber-700">Conditional Due Diligence</p>
                  </div>
                ) : (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                    <p className="font-bold text-red-700">No Due Diligence</p>
                  </div>
                )}

                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Confidence:</span>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      aiRecommendation.confidence === 'high' && 'bg-teal-100 text-teal-700',
                      aiRecommendation.confidence === 'medium' && 'bg-amber-100 text-amber-700',
                      aiRecommendation.confidence === 'low' && 'bg-red-100 text-red-700',
                    )}
                  >
                    {aiRecommendation.confidence.charAt(0).toUpperCase() + aiRecommendation.confidence.slice(1)}
                  </span>
                </div>

                {aiRecommendation.summary ? (
                  <p className="mb-3 text-sm italic leading-relaxed text-gray-600">{aiRecommendation.summary}</p>
                ) : null}

                {aiRecommendation.strengths.length > 0 ? (
                  <div className="mb-1">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">Strengths</p>
                    <ul className="space-y-1.5">
                      {aiRecommendation.strengths.map((s, i) => (
                        <li key={`str-${i}`} className="flex items-start gap-1.5 text-sm text-gray-600">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" aria-hidden />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {aiRecommendation.concerns.length > 0 ? (
                  <div className="mt-2">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Concerns</p>
                    <ul className="space-y-1.5">
                      {aiRecommendation.concerns.map((c, i) => (
                        <li key={`con-${i}`} className="flex items-start gap-1.5 text-sm text-gray-600">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {aiRecommendation.recommendation === 'conditional_dd' && aiRecommendation.conditions.trim() ? (
                  <div className="mt-2 rounded-lg bg-amber-50 p-3">
                    <p className="mb-1 text-xs font-semibold text-amber-700">Recommended conditions</p>
                    <p className="text-sm text-amber-800">{aiRecommendation.conditions}</p>
                  </div>
                ) : null}

                {aiRecommendation.reasoning ? (
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">{aiRecommendation.reasoning}</p>
                ) : null}

                <button
                  type="button"
                  className={cn(
                    'mt-3 w-full rounded-lg border border-indigo-200 py-2 text-sm font-medium transition-colors',
                    recommendationApplied
                      ? 'cursor-default text-teal-600'
                      : 'text-indigo-600 hover:bg-indigo-50',
                  )}
                  disabled={recommendationApplied}
                  onClick={applyAiRecommendation}
                >
                  {recommendationApplied ? '✓ Recommendation applied' : 'Apply this recommendation →'}
                </button>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-[#0B1F45]">Conclusive Opinion</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col items-center gap-1">
                  <VoteButton selected={ddVote === 'full_dd'} tone="teal" label="Due Diligence" onClick={() => selectOpinion('full_dd')} />
                  {ddVote === 'full_dd' && conclusiveFromAi && aiRecommendation?.recommendation === 'full_dd' ? (
                    <span className="text-xs text-indigo-500">AI suggested</span>
                  ) : null}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <VoteButton
                    selected={ddVote === 'conditional_dd'}
                    tone="amber"
                    label="Conditional DD"
                    onClick={() => selectOpinion('conditional_dd')}
                  />
                  {ddVote === 'conditional_dd' && conclusiveFromAi && aiRecommendation?.recommendation === 'conditional_dd' ? (
                    <span className="text-xs text-indigo-500">AI suggested</span>
                  ) : null}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <VoteButton selected={ddVote === 'no_dd'} tone="red" label="No Due Diligence" onClick={() => selectOpinion('no_dd')} />
                  {ddVote === 'no_dd' && conclusiveFromAi && aiRecommendation?.recommendation === 'no_dd' ? (
                    <span className="text-xs text-indigo-500">AI suggested</span>
                  ) : null}
                </div>
              </div>
              {opinionDiffersFromAi && aiRecommendation ? (
                <p className="text-xs text-amber-500">
                  Differs from AI recommendation (AI: {aiDdShortLabel(aiRecommendation.recommendation)})
                </p>
              ) : null}
              {ddVote === 'conditional_dd' ? (
                <label className={labelClass}>
                  Conditions for due diligence
                  <textarea className={cn('mt-1 min-h-[84px]', dsField.textarea)} value={conditions} onChange={(e) => setConditions(e.target.value)} />
                </label>
              ) : null}
              <label className={labelClass}>
                General notes
                <textarea className={cn('mt-1 min-h-[84px]', dsField.textarea)} value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} />
              </label>
              <label className={labelClass}>
                Attach scoring sheet
                <input type="file" className="mt-1 block w-full text-sm" onChange={(e) => setSheet(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {ratedCount} of {PANEL_CRITERIA_COUNT} criteria rated
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeScoringModal}>
                  Cancel
                </Button>
                <Button type="button" className="bg-[#0B1F45] text-white hover:bg-[#162d5e]" disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save Scores'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScoringStatusBadge({ status }: { status: PanelScoreStatus }) {
  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-600">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
        Scored
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">In progress</span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">Not scored</span>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return <span className={cn('rounded-full px-2 py-1', tone)}>{label}</span>;
}

function VoteButton({
  selected,
  tone,
  label,
  onClick,
}: {
  selected: boolean;
  tone: 'teal' | 'amber' | 'red';
  label: string;
  onClick: () => void;
}) {
  const cls =
    tone === 'teal'
      ? selected
        ? 'border-teal-500 bg-teal-500 text-white'
        : 'border-teal-200 bg-teal-50 text-teal-700'
      : tone === 'amber'
        ? selected
          ? 'border-amber-400 bg-amber-400 text-white'
          : 'border-amber-200 bg-amber-50 text-amber-800'
        : selected
          ? 'border-red-500 bg-red-500 text-white'
          : 'border-red-200 bg-red-50 text-red-700';
  return (
    <button type="button" className={cn('rounded-lg border px-3 py-2 text-sm font-semibold transition-colors', cls)} onClick={onClick}>
      {label}
    </button>
  );
}
