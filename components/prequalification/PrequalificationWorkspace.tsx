'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileCheck, Loader2, Sparkles, Upload, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { dsCard, dsLayout, dsType } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { CfpInfoStrip } from '@/components/cfp/CfpInfoStrip';
import {
  CHECKLIST_ITEM_LABELS,
  RECOMMENDATION_COLORS,
  RECOMMENDATION_LABELS,
  S21_KEYS,
  S22_KEYS,
  allChecklistItemsReviewed,
  canDecidePrequal,
  mapAiKeyToColumn,
  type AiItemKey,
  type ChecklistResponse,
  type PrequalificationRow,
} from '@/lib/prequalification/types';

type AppRow = {
  id: string;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
};

type CfpStrip = { id: string; title: string; status: string; closing_date: string };

type Suggestion = { response: ChecklistResponse; reasoning: string };

const RESP: ChecklistResponse[] = ['yes', 'no', 'partial'];

function respButtonClass(v: ChecklistResponse, selected: ChecklistResponse) {
  const on = selected === v;
  const base = 'rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-150';
  if (!on) return `${base} bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600`;
  if (v === 'yes') return `${base} bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200`;
  if (v === 'no') return `${base} bg-red-500 text-white shadow-sm ring-2 ring-red-200`;
  return `${base} bg-amber-400 text-white shadow-sm ring-2 ring-amber-200`;
}

function Toggle({ label, checked, isReadOnly, onChange }: { label: string; checked: boolean; isReadOnly?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={isReadOnly}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-left text-sm font-medium text-[#0B1F45] transition-colors',
        isReadOnly && 'cursor-not-allowed opacity-50',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border border-gray-200 transition-colors',
          checked ? 'bg-teal-500' : 'bg-gray-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function responseDotClass(v: ChecklistResponse) {
  if (v === 'yes') return 'bg-emerald-500';
  if (v === 'no') return 'bg-red-500';
  if (v === 'partial') return 'bg-amber-400';
  return 'bg-gray-300';
}

function SavedChip({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-xs font-semibold text-teal-600">Saved ✓</span>;
}

function extractFileName(path: string): string {
  const segment = path.split('/').pop() ?? path;
  return segment.split(':').pop() ?? segment;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PrequalificationWorkspace({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [application, setApplication] = useState<AppRow | null>(null);
  const [cfp, setCfp] = useState<CfpStrip | null>(null);
  const [draft, setDraft] = useState<PrequalificationRow | null>(null);
  const [suggestions, setSuggestions] = useState<Partial<Record<AiItemKey, Suggestion>>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [uploadMeta, setUploadMeta] = useState<{ name: string; size: number } | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedAnalysedAt, setUploadedAnalysedAt] = useState<string | null>(null);
  const [analysisNoticeOpen, setAnalysisNoticeOpen] = useState(false);
  const [aiPrefilled, setAiPrefilled] = useState<Partial<Record<AiItemKey, boolean>>>({});
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'success' | 'danger' | 'warning';
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    variant: 'warning',
    onConfirm: () => {},
  });

  const draftRef = useRef<PrequalificationRow | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  const checklistLocked = Boolean(
    !draft ||
      draft.overall_status !== 'pending' ||
      (application !== null &&
        application.status !== 'submitted' &&
        application.status !== 'pre_screening'),
  );

  const flushSave = useCallback(async () => {
    const d = draftRef.current;
    if (!d || checklistLocked) return;
    const body: Record<string, unknown> = {};
    for (const k of S21_KEYS) body[k] = d[k];
    for (const k of S22_KEYS) body[k] = d[k];
    body.s21_comments = d.s21_comments;
    body.s22_comments = d.s22_comments;
    body.date_received = d.date_received;
    body.time_received = d.time_received;
    body.soft_copy_received = d.soft_copy_received;
    body.hard_copy_received = d.hard_copy_received;
    const res = await fetch(`/api/applications/${applicationId}/prequalification`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { prequalification?: PrequalificationRow; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Save failed');
      return;
    }
    if (j.prequalification) {
      draftRef.current = j.prequalification;
      setDraft(j.prequalification);
    }
    setSavedTick((x) => x + 1);
  }, [applicationId, checklistLocked]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave();
    }, 1000);
  }, [flushSave]);

  const patchDraft = useCallback(
    (patch: Partial<PrequalificationRow>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        draftRef.current = next;
        scheduleSave();
        return next;
      });
    },
    [scheduleSave],
  );

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/applications/${applicationId}/prequalification`);
    const j = (await res.json()) as {
      application?: AppRow;
      cfp?: CfpStrip | null;
      prequalification?: PrequalificationRow | null;
      proposal_document_path?: string | null;
      ai_analysed_at?: string | null;
      template?: Omit<PrequalificationRow, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>;
      error?: string;
    };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load');
      setLoading(false);
      return;
    }
    setApplication(j.application ?? null);
    setCfp(j.cfp ?? null);
    const pq = j.prequalification;
    if (pq) {
      draftRef.current = pq;
      setDraft(pq);
      setUploadedFilePath(pq.proposal_document_path ?? j.proposal_document_path ?? null);
      setUploadedFileName(
        pq.proposal_document_path
          ? extractFileName(pq.proposal_document_path)
          : j.proposal_document_path
            ? extractFileName(j.proposal_document_path)
            : null,
      );
      setUploadedAnalysedAt(pq.ai_analysed_at ?? j.ai_analysed_at ?? null);
    } else if (j.template) {
      const t = j.template;
      const synthetic = {
        ...t,
        id: '',
        tenant_id: '',
        created_at: '',
        updated_at: '',
      } as PrequalificationRow;
      draftRef.current = synthetic;
      setDraft(synthetic);
      setUploadedFilePath(j.proposal_document_path ?? null);
      setUploadedFileName(j.proposal_document_path ? extractFileName(j.proposal_document_path) : null);
      setUploadedAnalysedAt(j.ai_analysed_at ?? null);
    } else {
      setDraft(null);
      setUploadedFilePath(null);
      setUploadedFileName(null);
      setUploadedAnalysedAt(null);
    }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewed21 = draft ? S21_KEYS.filter((k) => draft[k] !== 'not_reviewed').length : 0;
  const reviewed22 = draft ? S22_KEYS.filter((k) => draft[k] !== 'not_reviewed').length : 0;
  const reviewedTotal = reviewed21 + reviewed22;
  const progressPct = draft ? Math.round((reviewedTotal / 9) * 100) : 0;

  const gate = draft ? canDecidePrequal(draft) : { ok: false, reasons: [] as string[] };
  const allReviewed = draft ? allChecklistItemsReviewed(draft) : false;
  const onAnalyseFile = async (file: File | null) => {
    if (!file || checklistLocked) return;
    if (file.size > 20 * 1024 * 1024) {
      setErr('File exceeds 20MB');
      return;
    }
    setAiBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/api/applications/${applicationId}/prequalification/analyse`, {
        method: 'POST',
        body: fd,
      });
      const j = (await res.json()) as {
        suggestions?: Partial<Record<AiItemKey, Suggestion>>;
        summary?: {
          overall?: string;
          strengths?: string[];
          gaps?: string[];
          recommendation?: string;
          generated_at?: string;
        };
        proposal_document_path?: string;
        ai_analysed_at?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? 'Analysis failed');
        return;
      }
      const incoming = j.suggestions ?? {};
      setSuggestions(incoming);
      setUploadedFilePath(j.proposal_document_path ?? `upload:${file.name}`);
      setUploadedFileName(file.name);
      setUploadedAnalysedAt(j.ai_analysed_at ?? new Date().toISOString());
      setAiPrefilled(
        Object.fromEntries(
          Object.keys(incoming).map((k) => [k, true]),
        ) as Partial<Record<AiItemKey, boolean>>,
      );
      setAnalysisNoticeOpen(true);
      setDraft((prev) => {
        if (!prev) return prev;
        const patch: Partial<PrequalificationRow> = {};
        for (const key of Object.keys(incoming) as AiItemKey[]) {
          const s = incoming[key];
          const col = mapAiKeyToColumn(key);
          if (col && s && isResp(s.response)) (patch as Record<string, ChecklistResponse>)[col] = s.response;
        }
        const summary = j.summary
          ? {
              overall: j.summary.overall ?? '',
              strengths: j.summary.strengths ?? [],
              gaps: j.summary.gaps ?? [],
              recommendation: j.summary.recommendation ?? 'request_info',
              generated_at: j.summary.generated_at ?? new Date().toISOString(),
            }
          : prev.ai_summary;
        const next = { ...prev, ...patch, ai_summary: summary };
        draftRef.current = next;
        scheduleSave();
        return next;
      });
      await load();
    } finally {
      setAiBusy(false);
    }
  };

  const acceptAllSuggestions = () => {
    const patch: Partial<PrequalificationRow> = {};
    for (const key of Object.keys(suggestions) as AiItemKey[]) {
      const s = suggestions[key];
      const col = mapAiKeyToColumn(key);
      if (col && s && isResp(s.response)) (patch as Record<string, ChecklistResponse>)[col] = s.response;
    }
    if (Object.keys(patch).length) {
      patchDraft(patch);
      setAiPrefilled(
        Object.fromEntries(
          Object.keys(suggestions).map((k) => [k, true]),
        ) as Partial<Record<AiItemKey, boolean>>,
      );
    }
  };

  const onGenerateSummary = async () => {
    setSummaryBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/prequalification/summary`, { method: 'POST' });
      const j = (await res.json()) as { ai_summary?: unknown; prequalification?: PrequalificationRow; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Summary failed');
        return;
      }
      if (j.prequalification) {
        draftRef.current = j.prequalification;
        setDraft(j.prequalification);
      }
    } finally {
      setSummaryBusy(false);
    }
  };

  const onChooseFile = (file: File | null) => {
    if (!file) return;
    setUploadMeta({ name: file.name, size: file.size });
    void onAnalyseFile(file);
  };

  const handleManualPick = (key: AiItemKey, patch: Partial<PrequalificationRow>) => {
    setAiPrefilled((prev) => ({ ...prev, [key]: false }));
    patchDraft(patch);
  };

  const applyDecision = async (decision: 'prequalified' | 'not_prequalified') => {
    setDecisionBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/prequalification/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Decision failed');
        return;
      }
      await load();
    } finally {
      setDecisionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={cn(dsCard.padded, dsType.muted)}>
        <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (err && !draft) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        {err}
        <Button type="button" variant="outline" className="mt-4" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!application || !draft) {
    return <p className="text-sm text-gray-600">Unable to load application.</p>;
  }

  const aiSummary = draft.ai_summary as
    | {
        overall?: string;
        strengths?: string[];
        strong?: string[];
        gaps?: string[];
        recommendation?: string;
        generated_at?: string;
      }
    | null
    | undefined;
  const recommendation = normalizeRecommendation(aiSummary?.recommendation ?? '');

  return (
    <div className={cn(dsLayout.pageBg, 'min-h-screen pb-10')}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-gray-500">
          <Link href="/fund-applications" className="font-medium hover:text-[#0B1F45]">
            Applications
          </Link>
          <span className="mx-1.5 text-gray-300">→</span>
          <span className="font-medium text-gray-600">{application.fund_name}</span>
          <span className="mx-1.5 text-gray-300">→</span>
          <span className="text-gray-700">Pre-qualification</span>
        </nav>

        <div>
          <h2 className="text-2xl font-bold text-[#0B1F45]">{application.fund_name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={application.status} />
          </div>
        </div>

        {cfp ? <CfpInfoStrip cfp={cfp} /> : null}

        {err ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-gray-900">{err}</div> : null}

        <div className="grid gap-6 lg:grid-cols-10">
          <div className="space-y-6 lg:col-span-7">
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">Pre-qualification</p>
                  <h3 className="text-base font-semibold text-[#0B1F45]">Submission Details</h3>
                </div>
                <SavedChip show={savedTick > 0} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  Date received
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0B1F45]"
                    value={draft.date_received ?? ''}
                    disabled={checklistLocked}
                    onChange={(e) => patchDraft({ date_received: e.target.value || null })}
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Time received
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0B1F45]"
                    value={draft.time_received?.slice(0, 5) ?? ''}
                    disabled={checklistLocked}
                    onChange={(e) => patchDraft({ time_received: e.target.value ? `${e.target.value}:00` : null })}
                  />
                </label>
              </div>

              <div className="mt-5 rounded-lg border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Copies received</div>
                <div className="divide-y divide-gray-200">
                  <Toggle
                    label="Soft copy"
                    checked={!!draft.soft_copy_received}
                    isReadOnly={checklistLocked}
                    onChange={(v) => patchDraft({ soft_copy_received: v })}
                  />
                  <Toggle
                    label="Hard copy"
                    checked={!!draft.hard_copy_received}
                    isReadOnly={checklistLocked}
                    onChange={(v) => patchDraft({ hard_copy_received: v })}
                  />
                </div>
              </div>

              <div className="mt-6">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  disabled={checklistLocked || aiBusy}
                  onChange={(e) => onChooseFile(e.target.files?.[0] ?? null)}
                />

                {aiBusy ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0B1F45]">{uploadMeta?.name ?? uploadedFileName ?? 'proposal.pdf'}</p>
                        <p className="text-xs text-gray-500">
                          {uploadMeta ? `${(uploadMeta.size / (1024 * 1024)).toFixed(2)} MB` : 'Processing upload'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-[#0B1F45]" />
                      </div>
                      <p className="mt-2 text-sm text-gray-600">Analysing document...</p>
                      <p className="text-xs text-gray-500">This may take 10-20 seconds</p>
                    </div>
                  </div>
                ) : uploadedFilePath ? (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center">
                        <FileCheck className="mr-3 h-5 w-5 text-teal-600" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">{uploadedFileName ?? extractFileName(uploadedFilePath)}</p>
                          {uploadedAnalysedAt ? (
                            <p className="text-xs text-gray-500">Analysed on {formatDateTime(uploadedAnalysedAt)}</p>
                          ) : (
                            <p className="text-xs text-gray-500">Uploaded</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-gray-400 underline transition-colors hover:text-gray-600"
                        onClick={() => {
                          setUploadedFilePath(null);
                          setUploadedFileName(null);
                          setUploadedAnalysedAt(null);
                          setUploadMeta(null);
                          if (uploadInputRef.current) uploadInputRef.current.value = '';
                        }}
                      >
                        Replace document
                      </button>
                    </div>
                    <p className={cn('mt-2 text-xs', uploadedAnalysedAt ? 'text-teal-600' : 'text-amber-600')}>
                      {uploadedAnalysAtText(uploadedAnalysedAt)}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={checklistLocked || aiBusy}
                    className={cn(
                      'w-full rounded-xl border-2 border-dashed border-gray-300 p-6 text-center transition-colors',
                      'hover:border-[#0B1F45]',
                      (checklistLocked || aiBusy) && 'cursor-not-allowed opacity-60',
                    )}
                    onClick={() => uploadInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (checklistLocked || aiBusy) return;
                      onChooseFile(e.dataTransfer.files?.[0] ?? null);
                    }}
                  >
                    <Upload className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                    <p className="text-sm font-medium text-[#0B1F45]">Upload proposal document</p>
                    <p className="mt-1 text-xs text-gray-500">PDF preferred for AI analysis · Max 20MB</p>
                  </button>
                )}
              </div>
            </section>

            {analysisNoticeOpen ? (
              <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-sm text-blue-900">
                  ✨ AI has pre-filled this checklist based on the uploaded document. Please review each item and adjust if needed.
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={checklistLocked} onClick={() => acceptAllSuggestions()}>
                    Confirm AI selections
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAnalysisNoticeOpen(false)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="relative">
              {aiBusy ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#0B1F45]" />
                    <p className="mt-2 text-sm font-medium text-[#0B1F45]">AI is analysing your document...</p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-6">
                <ChecklistCard title="Executive Summary" badge="Section 2.1" complete={reviewed21} total={5}>
              <ItemBlock
                label="Company Information"
                aiKey="company_info"
                field="s21_company_info"
                draft={draft}
                suggestion={suggestions.company_info}
                aiPrefilled={!!aiPrefilled.company_info}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('company_info', { s21_company_info: v })}
              />
              <ItemBlock
                label="Fund Information"
                aiKey="fund_info"
                field="s21_fund_info"
                draft={draft}
                suggestion={suggestions.fund_info}
                aiPrefilled={!!aiPrefilled.fund_info}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('fund_info', { s21_fund_info: v })}
              />
              <ItemBlock
                label="Fund Strategy"
                aiKey="fund_strategy"
                field="s21_fund_strategy"
                draft={draft}
                suggestion={suggestions.fund_strategy}
                aiPrefilled={!!aiPrefilled.fund_strategy}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('fund_strategy', { s21_fund_strategy: v })}
              />
              <ItemBlock
                label="Fund Management"
                aiKey="fund_management"
                field="s21_fund_management"
                draft={draft}
                suggestion={suggestions.fund_management}
                aiPrefilled={!!aiPrefilled.fund_management}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('fund_management', { s21_fund_management: v })}
              />
              <ItemBlock
                label="Legal and Regulatory Requirements"
                aiKey="legal_regulatory"
                field="s21_legal_regulatory"
                draft={draft}
                suggestion={suggestions.legal_regulatory}
                aiPrefilled={!!aiPrefilled.legal_regulatory}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('legal_regulatory', { s21_legal_regulatory: v })}
              />
              <div className="mt-2 border-t border-gray-100 pt-4">
                <label className="block text-sm text-gray-500">
                  Comments (optional)
                  <textarea
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0B1F45]"
                    rows={3}
                    value={draft.s21_comments ?? ''}
                    disabled={checklistLocked}
                    onChange={(e) => patchDraft({ s21_comments: e.target.value || null })}
                  />
                </label>
              </div>
                </ChecklistCard>

                <ChecklistCard title="Detailed Information" badge="Section 2.2" complete={reviewed22} total={4}>
              <ItemBlock
                label="Company and Management Team"
                aiKey="company_management"
                field="s22_company_management"
                draft={draft}
                suggestion={suggestions.company_management}
                aiPrefilled={!!aiPrefilled.company_management}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('company_management', { s22_company_management: v })}
              />
              <ItemBlock
                label="Fund Details — General"
                aiKey="fund_general"
                field="s22_fund_general"
                draft={draft}
                suggestion={suggestions.fund_general}
                aiPrefilled={!!aiPrefilled.fund_general}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('fund_general', { s22_fund_general: v })}
              />
              <ItemBlock
                label="Fund Details — Financial"
                aiKey="fund_financial"
                field="s22_fund_financial"
                draft={draft}
                suggestion={suggestions.fund_financial}
                aiPrefilled={!!aiPrefilled.fund_financial}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('fund_financial', { s22_fund_financial: v })}
              />
              <ItemBlock
                label="Fund Details — ESG"
                aiKey="fund_esg"
                field="s22_fund_esg"
                draft={draft}
                suggestion={suggestions.fund_esg}
                aiPrefilled={!!aiPrefilled.fund_esg}
                isReadOnly={checklistLocked}
                onPick={(v) => handleManualPick('fund_esg', { s22_fund_esg: v })}
              />
              <div className="mt-2 border-t border-gray-100 pt-4">
                <label className="block text-sm text-gray-500">
                  Comments (optional)
                  <textarea
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0B1F45]"
                    rows={3}
                    value={draft.s22_comments ?? ''}
                    disabled={checklistLocked}
                    onChange={(e) => patchDraft({ s22_comments: e.target.value || null })}
                  />
                </label>
              </div>
                </ChecklistCard>
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-3">
            <section className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Review Status</h2>
              <p className="text-[32px] font-bold leading-none text-[#0B1F45]">{reviewedTotal} of 9</p>
              <p className="mt-1 text-sm text-gray-500">items reviewed</p>
              <div className="mb-4 mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#0B1F45] transition-all" style={{ width: `${progressPct}%` }} />
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-gray-700">
                  <span>Section 2.1</span>
                  <span>{reviewed21}/5</span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <span key={`s21-dot-${idx}`} className={cn('h-3 w-3 rounded-full', idx < reviewed21 ? 'bg-[#0F8A6E]' : 'bg-gray-200')} />
                  ))}
                </div>
                <div className="flex items-center justify-between text-gray-700">
                  <span>Section 2.2</span>
                  <span>{reviewed22}/4</span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <span key={`s22-dot-${idx}`} className={cn('h-3 w-3 rounded-full', idx < reviewed22 ? 'bg-[#0F8A6E]' : 'bg-gray-200')} />
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2 py-1 text-gray-700">
                    {draft.date_received ? <CheckCircle2 className="h-4 w-4 text-[#0F8A6E]" /> : <XCircle className="h-4 w-4 text-red-500" />}
                    Date received
                  </p>
                  <p className="flex items-center gap-2 py-1 text-gray-700">
                    {draft.soft_copy_received || draft.hard_copy_received ? (
                      <CheckCircle2 className="h-4 w-4 text-[#0F8A6E]" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    Soft or hard copy received
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4">
                {draft.overall_status === 'pending' ? (
                  !gate.ok ? (
                    <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-400">
                      Complete all checklist items and submission details to enable the decision
                    </div>
                  ) : (
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Make a Decision</p>
                      <Button
                        type="button"
                        className="mb-2 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
                        disabled={decisionBusy}
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            title: 'Confirm Prequalification',
                            message:
                              'This will mark the application as prequalified and advance it to the next stage. This action cannot be easily reversed.',
                            confirmLabel: '✓ Prequalify',
                            variant: 'success',
                            onConfirm: () => applyDecision('prequalified'),
                          })
                        }
                      >
                        ✓ Prequalified
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-semibold text-red-600 hover:border-red-300 hover:bg-red-50"
                        disabled={decisionBusy}
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            title: 'Confirm Rejection',
                            message:
                              'This will mark the application as not prequalified and reject it from this CFP round.',
                            confirmLabel: '✗ Not Prequalified',
                            variant: 'danger',
                            onConfirm: () => applyDecision('not_prequalified'),
                          })
                        }
                      >
                        ✗ Not Prequalified
                      </Button>
                    </div>
                  )
                ) : (
                  <div
                    className={cn(
                      'rounded-xl border p-4 text-center',
                      draft.overall_status === 'prequalified' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
                    )}
                  >
                    {draft.overall_status === 'prequalified' ? (
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                    ) : (
                      <XCircle className="mx-auto h-8 w-8 text-red-600" />
                    )}
                    <p className={cn('mt-2 text-base font-bold', draft.overall_status === 'prequalified' ? 'text-emerald-700' : 'text-red-700')}>
                      {draft.overall_status === 'prequalified' ? 'Prequalified' : 'Not Prequalified'}
                    </p>
                    {draft.reviewer_name && draft.reviewed_at ? (
                      <div className="mt-2 space-y-1 text-xs text-gray-400">
                        <p>Reviewed by {draft.reviewer_name}</p>
                        <p>{formatDateTime(draft.reviewed_at)}</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                <p className="text-sm font-semibold text-indigo-700">AI Assessment</p>
                {aiSummary && Object.keys(aiSummary).length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-auto px-2 py-1 text-xs text-indigo-700"
                    disabled={summaryBusy || checklistLocked}
                    onClick={() => void onGenerateSummary()}
                  >
                    {summaryBusy ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Regenerating
                      </>
                    ) : (
                      'Regenerate'
                    )}
                  </Button>
                ) : null}
              </div>

              {!aiSummary || Object.keys(aiSummary).length === 0 ? (
                allReviewed ? (
                  <Button
                    type="button"
                    className="mt-3 w-full rounded-lg bg-indigo-500 py-2 text-sm font-medium text-white hover:bg-indigo-600"
                    disabled={summaryBusy || checklistLocked}
                    onClick={() => void onGenerateSummary()}
                  >
                    {summaryBusy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating summary...
                      </>
                    ) : (
                      'Generate AI Summary'
                    )}
                  </Button>
                ) : (
                  <p className="mt-3 text-sm text-indigo-700/80">
                    Upload a proposal document to automatically generate checklist suggestions and AI assessment.
                  </p>
                )
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="mb-4 text-sm leading-relaxed text-gray-700">{aiSummary.overall}</p>
                  {(aiSummary.strong?.length || aiSummary.strengths?.length) ? (
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        STRENGTHS
                      </p>
                      <ul className="list-inside list-disc text-sm text-gray-600">
                        {(aiSummary.strengths ?? aiSummary.strong ?? []).map((item) => (
                          <li key={`strong-${item}`}>{CHECKLIST_ITEM_LABELS[item] ?? item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {aiSummary.gaps?.length ? (
                    <div>
                      <p className="mb-2 mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        GAPS
                      </p>
                      <ul className="list-inside list-disc text-sm text-gray-600">
                        {aiSummary.gaps.map((item) => (
                          <li key={`gap-${item}`}>{CHECKLIST_ITEM_LABELS[item] ?? item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p
                    className={cn(
                      'rounded-lg py-2 text-center text-sm font-semibold',
                      RECOMMENDATION_COLORS[recommendation] ?? 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {RECOMMENDATION_LABELS[recommendation] ?? aiSummary.recommendation}
                  </p>
                  {aiSummary.generated_at ? <p className="text-right text-xs text-gray-400">{formatDateTime(aiSummary.generated_at)}</p> : null}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmVariant={confirmModal.variant}
        isLoading={decisionBusy}
        onConfirm={async () => {
          await Promise.resolve(confirmModal.onConfirm());
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

function isResp(x: string): x is ChecklistResponse {
  return x === 'yes' || x === 'no' || x === 'partial' || x === 'not_reviewed';
}

function normalizeRecommendation(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (v.includes('not_prequalify') || v.includes('not prequalify') || v.includes('do not')) return 'not_prequalify';
  if (v.includes('request_info') || v.includes('request') || v.includes('additional')) return 'request_info';
  if (v.includes('prequalify')) return 'prequalify';
  return v;
}

function uploadedAnalysAtText(analysedAt: string | null): string {
  if (!analysedAt) return 'Document uploaded · AI analysis pending';
  return `✓ AI analysis complete · Analysed ${formatRelativeTime(analysedAt)}`;
}

function ChecklistCard({
  title,
  badge,
  complete,
  total,
  children,
}: {
  title: string;
  badge: string;
  complete: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-[#0B1F45] px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#C8973A] px-2 py-0.5 text-xs font-semibold text-white">{badge}</span>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-white">
          {complete}/{total} complete
        </p>
      </div>
      <div className="px-6 py-4">{children}</div>
    </section>
  );
}

function ItemBlock({
  label,
  aiKey,
  field,
  draft,
  suggestion,
  aiPrefilled,
  isReadOnly,
  onPick,
}: {
  label: string;
  aiKey: AiItemKey;
  field: keyof PrequalificationRow;
  draft: PrequalificationRow;
  suggestion?: Suggestion;
  aiPrefilled: boolean;
  isReadOnly: boolean;
  onPick: (v: ChecklistResponse) => void;
}) {
  const val = draft[field] as ChecklistResponse;
  return (
    <div className="border-b border-gray-100 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <span className={cn('h-2 w-2 rounded-full', responseDotClass(val))} />
          {label}
        </p>
        <div className="flex gap-2">
          {RESP.map((r) => (
            <div key={r} className="relative">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => onPick(r)}
                className={cn(respButtonClass(r, val), isReadOnly && 'cursor-not-allowed opacity-60')}
              >
                {r === 'yes' ? 'YES' : r === 'no' ? 'NO' : 'PARTIAL'}
              </button>
              {aiPrefilled && r === val ? (
                <span className="absolute -right-1.5 -top-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                  AI
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {suggestion && isResp(suggestion.response) ? (
        <p className="mt-0.5 text-xs italic text-gray-400">AI: {suggestion.reasoning}</p>
      ) : null}
    </div>
  );
}
