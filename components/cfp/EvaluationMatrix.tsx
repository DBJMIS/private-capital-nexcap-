'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import type { CfpApplicationListRow } from '@/lib/cfp/detail-data';

export type EvaluationMatrixMember = {
  id: string;
  member_name: string;
  member_type: string;
};

type MatrixPayload = {
  applications: Array<{ id: string; fund_name: string; status: string }>;
  panel_members: EvaluationMatrixMember[];
  votes: Array<{ panel_member_id: string; application_id: string; dd_vote: string | null }>;
  dd_decisions: Array<{ application_id: string; final_decision: string | null }>;
};

type DdVote = 'full_dd' | 'conditional_dd' | 'no_dd' | null;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function VoteCell({ vote }: { vote: DdVote }) {
  if (!vote) {
    return <span className="text-center text-xs text-gray-300">—</span>;
  }
  if (vote === 'full_dd') {
    return <span className="block rounded px-2 py-1 text-center text-xs font-semibold text-teal-700 bg-teal-50">DD</span>;
  }
  if (vote === 'conditional_dd') {
    return <span className="block rounded px-2 py-1 text-center text-xs font-semibold text-amber-700 bg-amber-50">CDD</span>;
  }
  return <span className="block rounded px-2 py-1 text-center text-xs font-semibold text-red-700 bg-red-50">NDD</span>;
}

function DecisionBadge({ d }: { d: string | null }) {
  if (!d) {
    return <span className="text-center text-xs font-medium text-gray-400">Pending</span>;
  }
  if (d === 'full_dd') {
    return <span className="block rounded-md px-2 py-1.5 text-center text-xs font-semibold text-teal-700 bg-teal-50">DD</span>;
  }
  if (d === 'conditional_dd') {
    return <span className="block rounded-md px-2 py-1.5 text-center text-xs font-semibold text-amber-700 bg-amber-50">CDD</span>;
  }
  if (d === 'no_dd') {
    return <span className="block rounded-md px-2 py-1.5 text-center text-xs font-semibold text-red-700 bg-red-50">NDD</span>;
  }
  return <span className="text-center text-xs text-gray-500">{d}</span>;
}

function voteCountsForApp(votes: MatrixPayload['votes'], applicationId: string) {
  const subset = votes.filter((v) => v.application_id === applicationId);
  let full = 0;
  let cond = 0;
  let no = 0;
  for (const v of subset) {
    if (v.dd_vote === 'full_dd') full += 1;
    else if (v.dd_vote === 'conditional_dd') cond += 1;
    else if (v.dd_vote === 'no_dd') no += 1;
  }
  return { full, cond, no };
}

export function EvaluationMatrix({
  cfpId,
  applications,
  panelMembers,
}: {
  cfpId: string;
  applications: CfpApplicationListRow[];
  panelMembers: EvaluationMatrixMember[];
}) {
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cfp/${cfpId}/evaluation-matrix`, { cache: 'no-store' });
      const j = (await res.json()) as MatrixPayload & { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Failed to load');
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setError('Network error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [cfpId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decisionByApp = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of data?.dd_decisions ?? []) {
      if (!m.has(d.application_id)) m.set(d.application_id, d.final_decision);
    }
    return m;
  }, [data?.dd_decisions]);

  const voteLookup = useMemo(() => {
    const m = new Map<string, DdVote>();
    for (const v of data?.votes ?? []) {
      m.set(`${v.panel_member_id}:${v.application_id}`, v.dd_vote as DdVote);
    }
    return m;
  }, [data?.votes]);

  const apps = data?.applications ?? applications.map((a) => ({ id: a.id, fund_name: a.fund_name, status: a.status }));
  const members = data?.panel_members ?? panelMembers;

  const hasAnyVote = (data?.votes ?? []).some((v) => v.dd_vote != null);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading evaluation matrix…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (apps.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500">No applications linked to this CFP yet.</p>
      </div>
    );
  }

  if (!hasAnyVote) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-base font-semibold text-[#0B1F45]">No panel evaluations submitted yet</p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
          Panel members need to complete scoring for their evaluations to appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-10 min-w-[160px] border-r border-gray-200 bg-white px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Panel Member
              </th>
              {apps.map((a) => (
                <th key={a.id} className="min-w-[120px] px-2 py-3 text-center text-xs font-semibold text-[#0B1F45]">
                  <span className="block truncate" title={a.fund_name}>
                    {truncate(a.fund_name, 20)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-3 py-2 align-middle">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-[#0B1F45]">{m.member_name}</span>
                    <span
                      className={cn(
                        'w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        m.member_type === 'observer' ? 'bg-gray-100 text-gray-600' : 'bg-[#0B1F45] text-white',
                      )}
                    >
                      {m.member_type === 'observer' ? 'Observer' : 'Voting'}
                    </span>
                  </div>
                </td>
                {apps.map((a) => (
                  <td key={a.id} className="px-2 py-2 align-middle">
                    <VoteCell vote={voteLookup.get(`${m.id}:${a.id}`) ?? null} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 bg-gray-50/80">
              <td className="sticky left-0 z-10 border-r border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                Votes
              </td>
              {apps.map((a) => {
                const c = voteCountsForApp(data?.votes ?? [], a.id);
                return (
                  <td key={a.id} className="px-2 py-2 text-xs leading-relaxed">
                    <span className="block text-teal-700">DD: {c.full}</span>
                    <span className="block text-amber-700">CDD: {c.cond}</span>
                    <span className="block text-red-700">NDD: {c.no}</span>
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-gray-200 bg-white">
              <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#0B1F45]">
                DBJ Decision
              </td>
              {apps.map((a) => (
                <td key={a.id} className="px-2 py-2 align-middle">
                  <DecisionBadge d={decisionByApp.get(a.id) ?? null} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
