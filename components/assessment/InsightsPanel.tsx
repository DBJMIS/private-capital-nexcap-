'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ListChecks, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

export type InsightsPanelProps = {
  assessmentId: string;
  /** `columns`: three-column grid for assessment insights tab. */
  variant?: 'stacked' | 'columns';
};

type Insights = {
  strengths: string[];
  weaknesses: string[];
  red_flags: string[];
};

export function InsightsPanel({ assessmentId, variant = 'stacked' }: InsightsPanelProps) {
  const [data, setData] = useState<Insights | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/assessments/${assessmentId}/insights`);
      const j = (await res.json()) as { insights?: Insights; error?: string };
      if (!res.ok) {
        if (!cancelled) setErr(j.error ?? 'Failed to load insights');
        return;
      }
      if (!cancelled) {
        setErr(null);
        setData(j.insights ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  if (err) {
    return <p className="text-xs text-gold-muted">{err}</p>;
  }
  if (!data) {
    return <p className="text-xs text-navy/50">Loading insights…</p>;
  }

  if (variant === 'columns') {
    const col = (title: string, icon: ReactNode, bg: string, items: string[], empty: string) => (
      <div className={cn('rounded-xl border p-4', bg)}>
        <div className="mb-2 flex items-center gap-2">
          {icon}
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-700">{title}</p>
        </div>
        {items.length === 0 ? (
          <p className="text-xs italic text-gray-400">{empty}</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-gray-700">
            {items.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    );

    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {col(
          'Strengths',
          <Sparkles className="h-4 w-4 text-teal-600" aria-hidden />,
          'border-teal-200/60 bg-teal-50/60',
          data.strengths,
          'None flagged yet.',
        )}
        {col(
          'Weaknesses',
          <ListChecks className="h-4 w-4 text-amber-600" aria-hidden />,
          'border-amber-200/60 bg-amber-50/50',
          data.weaknesses,
          'None flagged yet.',
        )}
        {col(
          'Red flags',
          <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />,
          'border-red-200/60 bg-red-50/50',
          data.red_flags,
          'None flagged yet.',
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm text-navy">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal">Strengths</p>
        {data.strengths.length === 0 ? (
          <p className="text-xs text-navy/50">None flagged yet.</p>
        ) : (
          <ul className="mt-1 list-inside list-disc text-xs leading-relaxed">
            {data.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-muted">Weaknesses</p>
        {data.weaknesses.length === 0 ? (
          <p className="text-xs text-navy/50">None flagged yet.</p>
        ) : (
          <ul className="mt-1 list-inside list-disc text-xs leading-relaxed">
            {data.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-navy">Red flags</p>
        {data.red_flags.length === 0 ? (
          <p className="text-xs text-navy/50">None flagged.</p>
        ) : (
          <ul className="mt-1 list-inside list-disc text-xs font-medium leading-relaxed text-navy">
            {data.red_flags.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
