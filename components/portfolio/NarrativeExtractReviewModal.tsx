'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cloneNarrativePayload, NarrativeExtractFormBody } from '@/components/portfolio/NarrativeExtractFormBody';
import type { NarrativeExtractionPayload } from '@/lib/portfolio/narrative-extraction';

export function NarrativeExtractReviewModal({
  open,
  narrativeExtractId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  narrativeExtractId: string;
  initial: NarrativeExtractionPayload;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<NarrativeExtractionPayload>(() => cloneNarrativePayload(initial));

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setDraft(cloneNarrativePayload(initial));
  }, [open, initial]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    setErr(null);
    const body = {
      narrative: draft.narrative,
      indicators: draft.indicators,
      fund_profile: draft.fund_profile,
      allocations: draft.allocations,
      fund_lps: draft.fund_lps,
      pipeline_stats: draft.pipeline_stats,
      capital_account_detail: draft.capital_account_detail,
      confidence: draft.confidence,
      source_snippets: draft.source_snippets,
    };
    const res = await fetch(`/api/portfolio/narrative-extracts/${narrativeExtractId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(j.error ?? 'Save failed');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold text-[#0B1F45]">Review narrative extraction</h2>
        <p className="mt-1 text-xs text-gray-500">
          AI-suggested fields from the report. Edit as needed, then save to store this extract (including structured fund data).
        </p>

        {err ? <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

        <div className="mt-6">
          <NarrativeExtractFormBody draft={draft} setDraft={setDraft} />
        </div>

        <div className="mt-8 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save extract'}
          </Button>
        </div>
      </div>
    </div>
  );
}
