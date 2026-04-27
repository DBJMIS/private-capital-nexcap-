'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';

import type { AssessmentAiNarrative } from '@/lib/assessment/ai-narrative-types';
import { isAssessmentAiNarrative } from '@/lib/assessment/ai-narrative-types';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { formatDateTime } from '@/lib/format-date';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  assessmentId: string;
  /** Assessment must be completed (or approved) to use this panel. */
  isUnlocked: boolean;
  rawNarrative: unknown;
  onRefresh: () => Promise<void>;
  canUse: boolean;
};

type SectionKey =
  | 'executive_summary'
  | 'strengths'
  | 'concerns'
  | 'red_flags'
  | 'recommended_conditions'
  | 'ic_questions';

function cloneNarrative(n: AssessmentAiNarrative): AssessmentAiNarrative {
  return JSON.parse(JSON.stringify(n)) as AssessmentAiNarrative;
}

export function AIInsightsPanel({ assessmentId, isUnlocked, rawNarrative, onRefresh, canUse }: Props) {
  const narrative = useMemo(() => (isAssessmentAiNarrative(rawNarrative) ? rawNarrative : null), [rawNarrative]);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState<AssessmentAiNarrative | null>(null);
  const [busy, setBusy] = useState<'regen' | 'save' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);

  const working = draft ?? narrative;

  const startEdit = (key: SectionKey) => {
    if (!narrative || !canUse) return;
    setErr(null);
    setDraft(cloneNarrative(narrative));
    setEditing(key);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!draft || !editing) return;
    setErr(null);
    setBusy('save');
    try {
      const body: Record<string, unknown> = {};
      if (editing === 'executive_summary') body.executive_summary = draft.executive_summary;
      if (editing === 'strengths') body.strengths = draft.strengths;
      if (editing === 'concerns') body.concerns = draft.concerns;
      if (editing === 'red_flags') body.red_flags = draft.red_flags;
      if (editing === 'recommended_conditions') body.recommended_conditions = draft.recommended_conditions;
      if (editing === 'ic_questions') body.ic_questions = draft.ic_questions;

      const res = await fetch(`/api/assessments/${assessmentId}/ai-narrative`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Save failed');
        return;
      }
      cancelEdit();
      await onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const runRegenerate = useCallback(async () => {
    if (!canUse) return;
    setErr(null);
    setBusy('regen');
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/generate-insights`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Regeneration failed');
        return;
      }
      cancelEdit();
      await onRefresh();
      setRegenConfirmOpen(false);
    } finally {
      setBusy(null);
    }
  }, [assessmentId, canUse, onRefresh]);

  if (!isUnlocked) {
    return (
      <p className="text-sm text-navy/70">
        Complete the assessment to generate AI narrative insights. Scores and formal recommendations are set only
        through the scoring workflow.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-navy">
        <p className="font-semibold text-amber-950">Advisory only — scores are not affected</p>
        <p className="mt-1 text-navy/80">
          This narrative is {narrative?.disclaimer_label ?? 'AI-Generated — For Reference Only'}. It does not change
          the quantitative score, pass threshold, or recommendation. Investment Committee should rely on the official
          assessment record.
        </p>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{err}</div>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canUse || busy !== null}
          onClick={() => setRegenConfirmOpen(true)}
        >
          {busy === 'regen' ? 'Regenerating…' : 'Regenerate'}
        </Button>
      </div>

      <ConfirmModal
        isOpen={regenConfirmOpen}
        title="Regenerate AI narrative?"
        message="Regenerate the AI narrative from current scores and questionnaire data? Unsaved local edits will be lost."
        confirmLabel="Regenerate"
        confirmVariant="warning"
        isLoading={busy === 'regen'}
        onConfirm={() => void runRegenerate()}
        onCancel={() => setRegenConfirmOpen(false)}
      />

      {!narrative && (
        <p className="text-sm text-navy/70">
          No AI narrative has been generated yet. Use Regenerate (or complete the assessment again if generation was
          skipped) to create one.
        </p>
      )}

      {working && (
        <div className="space-y-8">
          <NarrativeBlock
            title="Executive summary"
            canEdit={canUse}
            isEditing={editing === 'executive_summary'}
            busy={busy}
            onEdit={() => startEdit('executive_summary')}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
          >
            {editing === 'executive_summary' && draft ? (
              <Textarea
                value={draft.executive_summary}
                onChange={(e) => setDraft({ ...draft, executive_summary: e.target.value })}
                rows={6}
                className="text-sm"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">{working.executive_summary}</p>
            )}
          </NarrativeBlock>

          <ListBlock
            title="Top strengths"
            items={editing === 'strengths' && draft ? draft.strengths : working.strengths}
            isEditing={editing === 'strengths'}
            canEdit={canUse}
            busy={busy}
            onEdit={() => startEdit('strengths')}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
            onChange={(items) => draft && setDraft({ ...draft, strengths: items })}
          />

          <ListBlock
            title="Concerns or gaps"
            items={editing === 'concerns' && draft ? draft.concerns : working.concerns}
            isEditing={editing === 'concerns'}
            canEdit={canUse}
            busy={busy}
            onEdit={() => startEdit('concerns')}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
            onChange={(items) => draft && setDraft({ ...draft, concerns: items })}
          />

          <NarrativeBlock
            title="Due diligence red flags"
            canEdit={canUse}
            isEditing={editing === 'red_flags'}
            busy={busy}
            onEdit={() => startEdit('red_flags')}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
          >
            {editing === 'red_flags' && draft ? (
              <Textarea
                value={draft.red_flags.join('\n')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    red_flags: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={8}
                className="text-sm"
                placeholder="One flag per line (optional)"
              />
            ) : working.red_flags.length ? (
              <ul className="list-inside list-disc space-y-2 text-sm text-red-900/90">
                {working.red_flags.map((t, i) => (
                  <li key={i} className="leading-relaxed">
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-navy/50">None highlighted.</p>
            )}
          </NarrativeBlock>

          <NarrativeBlock
            title="Recommended conditions"
            canEdit={canUse}
            isEditing={editing === 'recommended_conditions'}
            busy={busy}
            onEdit={() => startEdit('recommended_conditions')}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
          >
            {editing === 'recommended_conditions' && draft ? (
              <Textarea
                value={draft.recommended_conditions.join('\n')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    recommended_conditions: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={8}
                className="text-sm"
                placeholder="One condition per line (optional)"
              />
            ) : working.recommended_conditions.length ? (
              <ul className="list-inside list-decimal space-y-2 text-sm text-navy">
                {working.recommended_conditions.map((t, i) => (
                  <li key={i} className="leading-relaxed">
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-navy/50">None listed.</p>
            )}
          </NarrativeBlock>

          <ListBlock
            title="Suggested IC questions"
            items={editing === 'ic_questions' && draft ? draft.ic_questions : working.ic_questions}
            isEditing={editing === 'ic_questions'}
            canEdit={canUse}
            busy={busy}
            onEdit={() => startEdit('ic_questions')}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
            onChange={(items) => draft && setDraft({ ...draft, ic_questions: items })}
          />

          {working.meta?.generated_at && (
            <p className="text-xs text-navy/50">
              Generated {formatDateTime(working.meta.generated_at)}
              {working.meta.last_edited_at && (
                <> · Last edited {formatDateTime(working.meta.last_edited_at)}</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NarrativeBlock(props: {
  title: string;
  children: ReactNode;
  canEdit: boolean;
  isEditing: boolean;
  busy: 'regen' | 'save' | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">{props.title}</h2>
        <div className="flex gap-2">
          {!props.isEditing ? (
            <Button type="button" variant="ghost" size="sm" disabled={!props.canEdit} onClick={props.onEdit}>
              Edit
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" disabled={props.busy !== null} onClick={props.onCancel}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="bg-navy text-navy-foreground" disabled={props.busy !== null} onClick={props.onSave}>
                {props.busy === 'save' ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>
      {props.children}
    </section>
  );
}

function ListBlock(props: {
  title: string;
  items: string[];
  isEditing: boolean;
  canEdit: boolean;
  busy: 'regen' | 'save' | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (items: string[]) => void;
  emptyHint?: string;
}) {
  return (
    <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">{props.title}</h2>
        <div className="flex gap-2">
          {!props.isEditing ? (
            <Button type="button" variant="ghost" size="sm" disabled={!props.canEdit} onClick={props.onEdit}>
              Edit
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" disabled={props.busy !== null} onClick={props.onCancel}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="bg-navy text-navy-foreground" disabled={props.busy !== null} onClick={props.onSave}>
                {props.busy === 'save' ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>
      {props.isEditing ? (
        <div className="space-y-2">
          {props.items.map((line, i) => (
            <Textarea
              key={i}
              value={line}
              onChange={(e) => {
                const next = [...props.items];
                next[i] = e.target.value;
                props.onChange(next);
              }}
              rows={3}
              className="text-sm"
            />
          ))}
        </div>
      ) : props.items.length ? (
        <ul className="list-inside list-disc space-y-2 text-sm text-navy">
          {props.items.map((t, i) => (
            <li key={i} className="leading-relaxed">
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-navy/50">{props.emptyHint ?? '—'}</p>
      )}
    </section>
  );
}
