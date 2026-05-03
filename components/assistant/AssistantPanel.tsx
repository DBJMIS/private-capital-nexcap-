'use client';

import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Lightbulb,
  Loader2,
  Search,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

import type { AssistantAnswerMode, AssistantMessage } from '@/lib/assistant/types';
import { PAGE_SUGGESTED_PROMPTS } from '@/lib/assistant/page-contexts';
import { useAssistant } from '@/contexts/AssistantContext';

const GENERAL_NAV_LINKS = [
  {
    label: 'Portfolio Dashboard',
    href: '/portfolio',
    description: 'Overall portfolio metrics & health',
  },
  {
    label: 'Fund Detail',
    href: '/portfolio/funds',
    description: 'Individual fund performance',
  },
  {
    label: 'Capital Calls',
    href: '/portfolio/capital-calls',
    description: 'Call history & outstanding amounts',
  },
  {
    label: 'Distributions',
    href: '/portfolio/distributions',
    description: 'Distribution history & DPI',
  },
] as const;

function WelcomeNoContext() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-4 text-center">
      <div className="relative h-16 w-16">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 40% 35%, rgba(0,220,200,0.3) 0%, rgba(0,169,157,0.5) 40%, rgba(0,100,120,0.7) 100%)',
            boxShadow: '0 0 20px rgba(0,169,157,0.3)',
          }}
          aria-hidden
        />
        <span className="absolute inset-0 z-10 flex items-center justify-center">
          <Sparkles size={24} className="text-white drop-shadow-sm" strokeWidth={1.5} aria-hidden />
        </span>
      </div>

      <div>
        <h3 className="text-base font-semibold text-white">NexCap Assistant</h3>
        <p className="mt-1 text-xs text-white/60">AI-powered portfolio intelligence</p>
      </div>

      <p className="text-sm leading-relaxed text-white/60">
        I can answer questions about your portfolio data, explain investment concepts, and help you interpret performance
        metrics.
      </p>

      <div className="w-full rounded-xl border border-white/10 bg-white/10 p-4 text-left">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Navigate to a page below to get started</p>
        <div className="space-y-2">
          {GENERAL_NAV_LINKS.map((page) => (
            <a
              key={page.href}
              href={page.href}
              className="group flex items-center gap-3 rounded-lg border border-transparent p-2 transition-all duration-150 hover:bg-white/15"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors group-hover:bg-white/20">
                <ArrowRight size={12} className="text-teal-300" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight text-white/80 transition-colors group-hover:text-white">
                  {page.label}
                </p>
                <p className="mt-0.5 text-xs leading-tight text-white/50">{page.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      <p className="px-2 text-xs italic text-white/60">
        You can also ask me to explain any investment concept or term from any page.
      </p>

      <div className="w-full">
        <p className="mb-2 text-center text-xs text-white/60">Or ask a general question now</p>
      </div>
    </div>
  );
}

const ASSISTANT_MARKDOWN_COMPONENTS: Partial<Components> = {
  p: ({ children }) => <p className="mb-2 text-white/90 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  ul: ({ children }) => <ul className="mb-2 list-none space-y-1 pl-0 text-white/90">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-none space-y-1 pl-0 text-white/90">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 text-sm text-white/90">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  ),
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 text-sm font-semibold text-white">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-sm font-semibold text-white">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wider text-white/70">{children}</h3>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-teal-400/50 pl-3 italic text-white/70">{children}</blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      return (
        <code className="block max-w-full overflow-x-auto font-mono text-xs text-white/90">{children}</code>
      );
    }
    return (
      <code className="max-w-full overflow-x-auto rounded bg-white/10 px-1 font-mono text-xs text-white/90">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 max-w-full overflow-x-auto rounded-lg bg-white/10 p-2 text-xs text-white/80">{children}</pre>
  ),
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-JM', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Jamaica' });
}

function ModeBadge({ mode }: { mode: AssistantAnswerMode }) {
  if (mode === 'page_context') return null;
  if (mode === 'live_query') {
    return (
      <span
        className="mt-1 inline-flex items-center gap-1 rounded-full border border-teal-700/50 bg-teal-900/50 px-2 py-0.5 text-xs text-teal-300"
        title="Answer used a live portfolio API"
      >
        <Search className="h-3 w-3 shrink-0" aria-hidden />
        Live data
      </span>
    );
  }
  if (mode === 'knowledge') {
    return (
      <span
        className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-700/50 bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300"
        title="Answer used general industry knowledge"
      >
        <BookOpen className="h-3 w-3 shrink-0" aria-hidden />
        General knowledge
      </span>
    );
  }
  return (
    <span
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-700/50 bg-amber-900/50 px-2 py-0.5 text-xs text-amber-300"
      title="Evaluative / benchmark-style analysis"
    >
      <Lightbulb className="h-3 w-3 shrink-0" aria-hidden />
      Analysis
    </span>
  );
}

function MessageBubble({ m, isAssistant }: { m: AssistantMessage; isAssistant: boolean }) {
  if (isAssistant) {
    return (
      <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1">
        <div className="relative min-h-[40px] max-w-full break-words overflow-hidden rounded-2xl rounded-tl-sm border border-white/10 bg-white/10 px-4 py-4 text-sm leading-relaxed text-white/90">
          <Sparkles className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 text-teal-300" aria-hidden />
          <div className="assistant-markdown min-w-0 overflow-hidden pl-2">
            <ReactMarkdown components={ASSISTANT_MARKDOWN_COMPONENTS}>{m.content}</ReactMarkdown>
          </div>
        </div>
        {m.mode && m.mode !== 'page_context' ? <ModeBadge mode={m.mode} /> : null}
        <p className="pl-1 text-xs text-white/40">{formatTime(m.timestamp)}</p>
      </div>
    );
  }
  return (
    <div className="ml-auto flex min-w-0 max-w-[80%] flex-col items-end gap-1">
      <div className="max-w-full break-words overflow-hidden rounded-2xl rounded-tr-sm bg-[#00A99D] px-3 py-2 text-sm text-white">
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
      </div>
      <p className="pr-1 text-xs text-white/40">{formatTime(m.timestamp)}</p>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2" aria-live="polite" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/60"
          style={{ animationDelay: `${i * 400}ms` }}
        />
      ))}
    </div>
  );
}

function LiveFetchBanner() {
  return (
    <div
      className="flex max-w-[85%] min-w-0 items-center gap-2 overflow-hidden rounded-2xl rounded-tl-sm border border-teal-700/30 bg-teal-900/30 px-3 py-2 text-sm text-teal-300"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-300" aria-hidden />
      <span className="min-w-0 break-words">Fetching live portfolio data...</span>
    </div>
  );
}

export function AssistantPanel() {
  const { isOpen, toggleOpen, messages, isLoading, isFetching, sendMessage, currentContext } = useAssistant();
  const [input, setInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = 22;
    const maxH = line * 3 + 12;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  useEffect(() => {
    if (!isOpen) return;
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [isOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isFetching, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleOpen();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, toggleOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const root = panelRef.current;
    if (!root) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!root.contains(document.activeElement)) return;
      const q = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const list = [...q].filter((el) => el.offsetParent !== null || el === textareaRef.current);
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const submit = async () => {
    const t = input.trim();
    if (!t || isLoading) return;
    setInput('');
    await sendMessage(t);
  };

  const headerSubtitle = currentContext?.pageTitle ?? 'Not on a portfolio data page';
  const inputPlaceholder = currentContext ? 'Ask about your portfolio data...' : 'Ask me anything about investing...';
  const footerNote = currentContext
    ? 'Read only · Page context; live portfolio summaries when fetched'
    : 'Read only · General questions from any page';

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="NexCap Assistant"
      className={`fixed bottom-20 right-6 z-50 flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B1F45]/95 shadow-2xl backdrop-blur-xl transition duration-200 ease-out sm:w-96 ${
        isOpen
          ? 'pointer-events-auto max-h-[70vh] translate-y-0 opacity-100 sm:h-[600px] sm:max-h-none'
          : 'pointer-events-none max-h-[70vh] translate-y-4 opacity-0 sm:h-[600px] sm:max-h-none'
      }`}
    >
      <header className="shrink-0 rounded-t-2xl border-b border-white/10 bg-[#0B1F45] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-white">NexCap Assistant</p>
              <p className="truncate text-xs text-white/50">{headerSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleOpen}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white/90 focus:outline-none focus:ring-2 focus:ring-teal-400"
            aria-label="Minimize assistant"
          >
            <ChevronDown className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden bg-transparent p-4">
          {messages.length > 0 ? (
            messages.map((m) => (
              <div key={m.id} className={`flex min-w-0 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <MessageBubble m={m} isAssistant={m.role === 'assistant'} />
              </div>
            ))
          ) : currentContext ? (
            <>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sparkles className="mb-3 h-8 w-8 text-teal-300" aria-hidden />
                <p className="text-base font-semibold text-white">NexCap Assistant</p>
                <p className="mt-1 max-w-xs text-sm text-white/60">Ask me anything about your portfolio data</p>
              </div>
              <div>
                <p className="mb-2 text-xs text-white/40">Suggested questions</p>
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  Suggested questions loaded
                </div>
                <div className="flex flex-col gap-2">
                  {currentContext.suggestedPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-label={p}
                      disabled={isLoading}
                      onClick={() => void sendMessage(p)}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <WelcomeNoContext />
          )}
          {isLoading && isFetching ? (
            <div className="flex min-w-0 justify-start">
              <LiveFetchBanner />
            </div>
          ) : null}
          {isLoading && !isFetching ? (
            <div className="flex min-w-0 justify-start">
              <div className="max-w-[85%] overflow-hidden rounded-2xl rounded-tl-sm border border-white/10 bg-white/10 px-3 py-2">
                <LoadingDots />
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {!currentContext && messages.length === 0 ? (
          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            <p className="mb-2 text-center text-xs text-white/40">Suggested questions</p>
            <div className="flex flex-col gap-2">
              {PAGE_SUGGESTED_PROMPTS.general.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  disabled={isLoading}
                  onClick={() => void sendMessage(p)}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="shrink-0 border-t border-white/10 bg-[#0B1F45] p-3">
          <div className="flex min-w-0 items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              disabled={isLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={inputPlaceholder}
              className="max-h-[84px] min-h-[40px] min-w-0 flex-1 resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
              aria-label="Message to NexCap Assistant"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00A99D] text-white transition hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-[#0B1F45] disabled:opacity-50"
            >
              <SendHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-white/30">{footerNote}</p>
        </div>
      </div>
    </div>
  );
}
