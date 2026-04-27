'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type ExistingAssessmentLite = {
  id: string;
  assessment_period: string;
  status: string;
};

function toPeriod(quarter: number, year: number) {
  return `Q${quarter}-${year}`;
}

export function AssessmentPeriodStartClient({
  fundId,
  fundName,
  existingAssessments,
}: {
  fundId: string;
  fundName: string;
  existingAssessments: ExistingAssessmentLite[];
}) {
  const router = useRouter();
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() - 1];

  const existingByPeriod = useMemo(() => {
    const m = new Map<string, ExistingAssessmentLite>();
    for (const a of existingAssessments) m.set(a.assessment_period, a);
    return m;
  }, [existingAssessments]);

  const options = useMemo(() => {
    const out: Array<{ year: number; quarter: number; period: string; hasAssessment: boolean; status: string | null }> = [];
    for (const y of years) {
      for (const q of [4, 3, 2, 1]) {
        const p = toPeriod(q, y);
        const ex = existingByPeriod.get(p);
        out.push({
          year: y,
          quarter: q,
          period: p,
          hasAssessment: !!ex,
          status: ex?.status ?? null,
        });
      }
    }
    return out;
  }, [years, existingByPeriod]);

  const firstAvailable = options.find((o) => !o.hasAssessment) ?? null;
  const [year, setYear] = useState<number>(firstAvailable?.year ?? years[0]);
  const [quarter, setQuarter] = useState<number>(firstAvailable?.quarter ?? 4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictLink, setConflictLink] = useState<string | null>(null);

  const allRecentApproved = options.every((o) => {
    const ex = existingByPeriod.get(o.period);
    return ex?.status === 'approved';
  });

  const availableQuarters = useMemo(() => {
    return [4, 3, 2, 1].map((q) => {
      const p = toPeriod(q, year);
      const ex = existingByPeriod.get(p);
      return {
        quarter: q,
        disabled: !!ex,
        status: ex?.status ?? null,
      };
    });
  }, [year, existingByPeriod]);

  async function startAssessment() {
    setBusy(true);
    setError(null);
    setConflictLink(null);
    try {
      const period = toPeriod(quarter, year);
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment_period: period, assessment_date: today }),
      });
      const j = (await res.json()) as {
        assessment?: { id: string; status: string };
        redirected?: boolean;
        assessment_id?: string;
        error?: string;
      };
      if (res.ok && j.assessment?.id) {
        router.replace(`/portfolio/funds/${fundId}/assessments/${j.assessment.id}`);
        router.refresh();
        return;
      }
      if (res.status === 409) {
        setError(j.error ?? 'A quarterly assessment already exists for the selected period.');
        if (j.assessment_id) {
          setConflictLink(`/portfolio/funds/${fundId}/assessments/${j.assessment_id}`);
        }
        return;
      }
      setError(j.error ?? 'Failed to create assessment.');
    } catch {
      setError('Failed to create assessment.');
    } finally {
      setBusy(false);
    }
  }

  if (allRecentApproved) {
    return (
      <div className="w-full space-y-6 pb-16">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <Link href={`/portfolio/funds/${fundId}`} className="text-[#0F8A6E] hover:underline">
            ← {fundName}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-gray-700">Start quarterly assessment</span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-xl font-bold text-[#0B1F45]">{fundName}</h1>
          <p className="mt-3 text-sm text-gray-600">
            All recent periods have completed assessments. View the Assessments tab to review them.
          </p>
          <Link href={`/portfolio/funds/${fundId}?tab=assessments`} className="mt-3 inline-block text-sm font-medium text-[#0F8A6E] underline">
            Open Assessments tab
          </Link>
        </div>
      </div>
    );
  }

  const selected = existingByPeriod.get(toPeriod(quarter, year));
  const disabledStart = !!selected;

  return (
    <div className="w-full space-y-6 pb-16">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <Link href={`/portfolio/funds/${fundId}`} className="text-[#0F8A6E] hover:underline">
          ← {fundName}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-gray-700">Start quarterly assessment</span>
      </div>
      <div className="rounded-xl bg-[#0B1F45] px-6 py-5 text-white">
        <h1 className="text-xl font-bold">Start quarterly assessment</h1>
        <p className="mt-1 text-sm text-white/75">{fundName}</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-[#0B1F45]">Select period</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">Quarter</span>
            <select
              className="mt-1 h-10 w-full rounded border border-gray-300 px-3"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
            >
              {availableQuarters.map((q) => (
                <option key={q.quarter} value={q.quarter} disabled={q.disabled}>
                  {`Q${q.quarter}${q.disabled ? ` — ${q.status}` : ''}`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Year</span>
            <select className="mt-1 h-10 w-full rounded border border-gray-300 px-3" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selected ? (
          <p className="mt-3 text-sm text-amber-700">
            An assessment already exists for this period with status <span className="font-medium">{selected.status}</span>. Choose a different period.
          </p>
        ) : null}

        {error ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}{' '}
            {conflictLink ? (
              <Link href={conflictLink} className="font-medium underline">
                View assessment
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          <Button type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" disabled={busy || disabledStart} onClick={() => void startAssessment()}>
            {busy ? 'Starting…' : 'Start assessment'}
          </Button>
          <Link href={`/portfolio/funds/${fundId}?tab=assessments`} className="text-sm text-gray-600 underline">
            Cancel
          </Link>
        </div>
      </section>
    </div>
  );
}
