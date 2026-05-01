'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, FileText, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';

type HeadlineStat = { label: string; value: string; context: string };
type NarrativePayload = {
  narrative: string;
  headline_stats: HeadlineStat[];
  generated_at: string;
} | null;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PortfolioIntelligenceCard({
  initial,
  canRegenerate,
}: {
  initial: NarrativePayload;
  canRegenerate: boolean;
}) {
  const [data, setData] = useState<NarrativePayload>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasData = !!data?.narrative;
  const headlineStats = useMemo(() => data?.headline_stats ?? [], [data]);

  const generate = async (force: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/ai/benchmark-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'full_portfolio', force }),
      });
      const j = (await res.json()) as { narrative?: string; headline_stats?: HeadlineStat[]; generated_at?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed to generate');
      setData({
        narrative: j.narrative ?? '',
        headline_stats: j.headline_stats ?? [],
        generated_at: j.generated_at ?? new Date().toISOString(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!hasData) {
      void generate(false);
    }
  }, [hasData]);

  const exportPdf = () => {
    window.print();
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-[#00A99D]" />
          <h2 className="text-lg font-semibold text-[#0B1F45]">Portfolio Intelligence</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F7F6] px-2 py-0.5 text-xs font-medium text-[#00A99D]">
            <Sparkles className="h-3 w-3" />
            AI Generated
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canRegenerate ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void generate(true)}>
              Regenerate
            </Button>
          ) : null}
          <Button size="sm" className="bg-[#0B1F45] text-white hover:bg-[#162d5e]" disabled={!hasData} onClick={exportPdf}>
            Export as PDF
          </Button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Intelligence Unavailable</p>
                <p className="mt-1 text-sm text-amber-800">Unable to generate portfolio analysis at this time. Please try regenerating.</p>
              </div>
            </div>
            {canRegenerate ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void generate(true)}>
                Regenerate
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(headlineStats.length > 0 ? headlineStats : [{ label: 'Generating', value: '—', context: 'Preparing benchmark narrative...' }]).map((s, idx) => {
              const isNegative = s.value.trim().startsWith('-');
              return (
                <div key={`${s.label}-${idx}`} className="rounded-lg border border-gray-200 border-t-2 border-t-[#00A99D] bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${isNegative ? 'text-[#DC2626]' : 'text-[#00A99D]'}`}>{s.value}</p>
                  <p className="mt-1 text-xs text-gray-500">{s.context}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-lg border-l-4 border-teal-500 bg-gray-50 p-6 pl-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <FileText className="h-3.5 w-3.5" />
              Analysis
            </div>
            <div className="prose prose-sm max-w-none text-gray-700">
              {(data?.narrative ?? 'Generating narrative...').split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p.trim()}</p>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-400">
          Benchmarks sourced from Cambridge Associates and regional estimates. Generated by Claude
          {data?.generated_at ? ` on ${fmtDate(data.generated_at)}` : ''}. For internal use only.
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-400">
          <Sparkles className="h-3 w-3" />
          Powered by Claude
        </span>
      </div>
    </section>
  );
}
