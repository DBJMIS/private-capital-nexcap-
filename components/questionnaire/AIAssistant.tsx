'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Sparkles, X } from 'lucide-react';

import { useQuestionnaireShell } from '@/components/questionnaire/QuestionnaireContext';
import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  identified_gaps?: string[];
  reference?: string;
};

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}`;
}

export function AIAssistant() {
  const { questionnaireId, aiSurface, sections, completedCount, totalSections } =
    useQuestionnaireShell();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [reviewPaste, setReviewPaste] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [focusedQuestionKey, setFocusedQuestionKey] = useState<string>('');
  const [streaming, setStreaming] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sectionConfig = useMemo(() => {
    if (!aiSurface.sectionKey) return null;
    return getSectionConfig(aiSurface.sectionKey as DdSectionKey);
  }, [aiSurface.sectionKey]);

  const sectionRow = useMemo(
    () => sections.find((s) => s.section_key === aiSurface.sectionKey),
    [sections, aiSurface.sectionKey],
  );

  const sectionPct = sectionRow
    ? sectionRow.status === 'completed'
      ? 100
      : sectionRow.status === 'in_progress'
        ? 50
        : 0
    : null;

  const overallPct =
    totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, isStreaming]);

  const runStream = useCallback(
    async (params: {
      user_message: string;
      mode: 'chat' | 'help_question' | 'review_answer' | 'section_gaps' | 'summarize_all';
      pasted_answer?: string;
      question_key?: string | null;
    }) => {
      setError(null);
      setIsStreaming(true);
      setStreaming('');

      const referenceParts = [
        aiSurface.sectionTitle ?? 'Overview',
        params.question_key ? `Question: ${params.question_key}` : '',
      ].filter(Boolean);
      const reference = referenceParts.join(' · ');

      const userMsg: ChatMsg = {
        id: id(),
        role: 'user',
        content: params.user_message,
        reference,
      };

      const priorForApi = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));

      setMessages((m) => [...m, userMsg]);

      const res = await fetch(`/api/questionnaires/${questionnaireId}/ai-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_key: aiSurface.sectionKey,
          question_key: params.question_key ?? null,
          user_message: params.user_message,
          current_answers: aiSurface.currentAnswers,
          mode: params.mode,
          messages: priorForApi,
          pasted_answer: params.pasted_answer,
        }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? 'Request failed');
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let carry = '';
      let fullText = '';
      let suggestions: string[] = [];
      let gaps: string[] = [];
      let streamError: string | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          carry += decoder.decode(value, { stream: true });
          const parts = carry.split('\n\n');
          carry = parts.pop() ?? '';
          for (const block of parts) {
            const line = block.trim();
            if (!line.startsWith('data:')) continue;
            const payloadLine = line.startsWith('data: ') ? line.slice(6) : line.slice(5).trimStart();
            const json = JSON.parse(payloadLine) as {
              type?: string;
              content?: string;
              reply?: string;
              suggestions?: string[];
              identified_gaps?: string[];
              message?: string;
            };
            if (json.type === 'text' && json.content) {
              fullText += json.content;
              setStreaming(fullText);
            }
            if (json.type === 'done') {
              fullText = json.reply ?? fullText;
              suggestions = json.suggestions ?? [];
              gaps = json.identified_gaps ?? [];
            }
            if (json.type === 'error') {
              streamError = json.message ?? 'Stream error';
              setError(streamError);
            }
          }
        }
      } finally {
        setIsStreaming(false);
        setStreaming('');
        if (!streamError) {
          setMessages((m) => [
            ...m,
            {
              id: id(),
              role: 'assistant',
              content: fullText.trim() || '—',
              suggestions,
              identified_gaps: gaps,
              reference,
            },
          ]);
        }
      }
    },
    [questionnaireId, aiSurface, messages],
  );

  const onSend = () => {
    const t = input.trim();
    if (!t || isStreaming) return;
    setInput('');
    void runStream({ user_message: t, mode: 'chat' });
  };

  const qk = focusedQuestionKey || null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-medium text-navy-foreground shadow-lg transition hover:bg-navy/90',
          open && 'pointer-events-none opacity-0',
        )}
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
        AI Assistant
      </button>

      <div
        className={cn(
          'fixed inset-0 z-[60] bg-navy/40 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      <aside
        className={cn(
          'fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[400px] flex-col border-l border-shell-border bg-shell-card shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-shell-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" aria-hidden />
            <span className="font-semibold text-navy">DBJ AI Assistant</span>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="border-b border-shell-border bg-navy/[0.04] px-4 py-3 text-xs text-navy/80">
          <p className="font-medium text-navy">
            {aiSurface.sectionTitle ?? 'Questionnaire'}
            {sectionPct !== null && (
              <span className="ml-2 text-teal">· Section ~{sectionPct}%</span>
            )}
          </p>
          <p className="mt-1 text-navy/60">
            Overall DD completion: {completedCount}/{totalSections} sections ({overallPct}%)
          </p>
          {qk ? (
            <p className="mt-1 font-mono text-[10px] text-navy/50">
              Focused question_key: {qk}
            </p>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-2 border-b border-shell-border p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-navy/50">Quick actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal border-shell-border py-2 text-left text-xs leading-snug"
                disabled={isStreaming}
                onClick={() => {
                  const label =
                    sectionConfig?.questions.find((q) => q.key === focusedQuestionKey)?.label ??
                    'this section';
                  void runStream({
                    mode: 'help_question',
                    question_key: qk,
                    user_message: `Help me answer this question for DBJ: "${label}". Explain what institutional reviewers expect, what level of detail to include, and common pitfalls. Do not write my answer for me.`,
                  });
                }}
              >
                Help me answer this
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal border-shell-border py-2 text-left text-xs leading-snug"
                disabled={isStreaming}
                onClick={() => setShowReview((s) => !s)}
              >
                Review my answer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal border-shell-border py-2 text-left text-xs leading-snug"
                disabled={isStreaming}
                onClick={() =>
                  void runStream({
                    mode: 'section_gaps',
                    user_message:
                      'Review all answers I have entered in this section so far. List concrete gaps, missing themes (e.g. ESG, risk, governance), or places where depth is weak compared to typical DBJ expectations. Do not rewrite my answers.',
                  })
                }
              >
                What&apos;s missing?
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal border-shell-border py-2 text-left text-xs leading-snug"
                disabled={isStreaming}
                onClick={() =>
                  void runStream({
                    mode: 'summarize_all',
                    user_message:
                      'Summarize the substance of what I have entered across the questionnaire so far: themes, strengths, and obvious gaps. This is for my orientation only.',
                  })
                }
              >
                Summarize application
              </Button>
            </div>
            {sectionConfig && sectionConfig.questions.length > 0 && (
              <div className="pt-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-navy/50">
                  Question for &quot;Help me answer&quot;
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-shell-border bg-white px-2 text-xs text-navy"
                  value={focusedQuestionKey}
                  onChange={(e) => setFocusedQuestionKey(e.target.value)}
                >
                  <option value="">Whole section (general)</option>
                  {sectionConfig.questions.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label.slice(0, 72)}
                      {q.label.length > 72 ? '…' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showReview && (
              <div className="space-y-2 pt-2">
                <Textarea
                  placeholder="Paste a draft answer here for structured feedback…"
                  value={reviewPaste}
                  onChange={(e) => setReviewPaste(e.target.value)}
                  rows={5}
                  className="text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-teal text-teal-foreground hover:bg-teal/90"
                  disabled={isStreaming || !reviewPaste.trim()}
                  onClick={() => {
                    const p = reviewPaste.trim();
                    setReviewPaste('');
                    setShowReview(false);
                    void runStream({
                      mode: 'review_answer',
                      question_key: qk,
                      pasted_answer: p,
                      user_message: `Review the following draft answer. Give structured feedback (clarity, completeness vs DBJ expectations, risks of omission). Do not rewrite it as a finished submission.\n\n---\n\n${p}`,
                    });
                  }}
                >
                  Run review
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="text-xs text-navy/60">
                Ask anything about the DD form, DBJ expectations, or how to strengthen your responses. The
                assistant will not fill in answers for you.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[95%] rounded-lg px-3 py-2 text-xs leading-relaxed',
                    m.role === 'user'
                      ? 'bg-navy text-navy-foreground'
                      : 'border border-shell-border bg-shell-bg text-navy',
                  )}
                >
                  {m.reference && (
                    <p className="mb-1 border-b border-white/10 pb-1 text-[10px] opacity-80">
                      Referencing: {m.reference}
                    </p>
                  )}
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.role === 'assistant' && (m.suggestions?.length || m.identified_gaps?.length) ? (
                    <div className="mt-2 border-t border-shell-border pt-2 text-[10px] text-navy/70">
                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="mb-2">
                          <p className="font-semibold text-teal">Suggestions</p>
                          <ul className="list-inside list-disc">
                            {m.suggestions.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {m.identified_gaps && m.identified_gaps.length > 0 && (
                        <div>
                          <p className="font-semibold text-gold-muted">Gaps flagged</p>
                          <ul className="list-inside list-disc">
                            {m.identified_gaps.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[95%] rounded-lg border border-shell-border bg-shell-bg px-3 py-2 text-xs text-navy">
                  {streaming || (
                    <span className="inline-flex items-center gap-2 text-navy/60">
                      <Loader2 className="h-4 w-4 animate-spin text-teal" aria-hidden />
                      Thinking…
                    </span>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="mx-3 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="border-t border-shell-border p-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the assistant…"
              className="min-h-[72px] resize-none text-sm"
              disabled={isStreaming}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <Button
              type="button"
              className="mt-2 w-full bg-navy text-navy-foreground hover:bg-navy/90"
              disabled={isStreaming || !input.trim()}
              onClick={onSend}
            >
              Send
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
