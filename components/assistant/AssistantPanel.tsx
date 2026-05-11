'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

import type { AssistantAnswerMode, AssistantMessage } from '@/lib/assistant/types';
import { useAssistant } from '@/contexts/AssistantContext';

const NAV_PAGES = [
  { label: 'Portfolio Dashboard', href: '/portfolio', description: 'Overall portfolio metrics & health' },
  { label: 'Fund Detail', href: '/portfolio/funds', description: 'Individual fund performance' },
  { label: 'Capital Calls', href: '/portfolio/capital-calls', description: 'Call history & outstanding amounts' },
  { label: 'Distributions', href: '/portfolio/distributions', description: 'Distribution history & DPI' },
] as const;

const GENERAL_CHIPS = [
  'What is IRR and how is it calculated?',
  'Explain the difference between DPI and TVPI',
  'What is a capital call?',
] as const;

const markdownLiBullet: CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: '#00A99D',
  flexShrink: 0,
  marginTop: 5,
};

const markdownComponents: Partial<Components> = {
  p: ({ children }) => (
    <p
      style={{
        margin: '0 0 10px 0',
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 1.65,
      }}
    >
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: 'white' }}>{children}</strong>
  ),
  ul: ({ children }) => (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
      <span style={markdownLiBullet} aria-hidden />
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{children}</span>
    </li>
  ),
  h1: ({ children }) => (
    <h1 style={{ fontSize: 13, fontWeight: 600, color: 'white', margin: '8px 0 6px' }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: 13, fontWeight: 600, color: 'white', margin: '8px 0 6px' }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.75)',
        margin: '10px 0 6px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </h3>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0' }} />,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: '8px 0',
        paddingLeft: 12,
        borderLeft: '3px solid rgba(0,169,157,0.5)',
        color: 'rgba(255,255,255,0.75)',
        fontStyle: 'italic',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      return (
        <code
          style={{
            display: 'block',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            color: 'rgba(255,255,255,0.9)',
            overflowX: 'auto',
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: 'rgba(255,255,255,0.9)',
          background: 'rgba(255,255,255,0.08)',
          padding: '1px 4px',
          borderRadius: 4,
          overflowX: 'auto',
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: '8px 0',
        padding: 10,
        borderRadius: 8,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        overflowX: 'auto',
        maxWidth: '100%',
        fontSize: 11,
        color: 'rgba(255,255,255,0.88)',
      }}
    >
      {children}
    </pre>
  ),
  a: ({ children, href }) => (
    <a
      href={href ?? '#'}
      style={{ color: '#5eead4', textDecoration: 'underline' }}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

function SvgSparkles({ size, stroke }: { size: number; stroke: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4" />
    </svg>
  );
}

function SvgClose({ size, stroke }: { size: number; stroke: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SvgSearch10({ stroke }: { stroke: string }) {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SvgBookOpen10({ stroke }: { stroke: string }) {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function SvgLightbulb10({ stroke }: { stroke: string }) {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} aria-hidden>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.3A7 7 0 0 1 5 9a7 7 0 0 1 7-7Z" />
    </svg>
  );
}

function SvgArrowPrompt({ stroke }: { stroke: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} aria-hidden>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function SvgSend13() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function ModeBadgeRow({ mode }: { mode: AssistantAnswerMode }) {
  if (mode === 'page_context') return null;
  if (mode === 'live_query') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <SvgSearch10 stroke="#5eead4" />
        <span style={{ fontSize: 10, color: '#5eead4' }}>Live data</span>
      </div>
    );
  }
  if (mode === 'knowledge') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <SvgBookOpen10 stroke="#93c5fd" />
        <span style={{ fontSize: 10, color: '#93c5fd' }}>General knowledge</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <SvgLightbulb10 stroke="#fbbf24" />
      <span style={{ fontSize: 10, color: '#fbbf24' }}>Analysis</span>
    </div>
  );
}

function AssistantMessageBlock({ m }: { m: AssistantMessage }) {
  const showBadge = Boolean(m.mode && m.mode !== 'page_context');
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px 14px 14px 3px',
          padding: '12px 14px',
          maxWidth: '90%',
          minWidth: 0,
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        <div className="assistant-md-content" style={{ minWidth: 0, overflow: 'hidden' }}>
          {m.streaming ? (
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              {m.content}
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 2,
                  height: '1em',
                  backgroundColor: 'rgba(255,255,255,0.45)',
                  marginLeft: 2,
                  verticalAlign: 'text-bottom',
                  animation: 'cursor-blink 0.8s step-end infinite',
                }}
              />
            </div>
          ) : (
            <ReactMarkdown components={markdownComponents}>{m.content}</ReactMarkdown>
          )}
        </div>
        {showBadge ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
            <ModeBadgeRow mode={m.mode!} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>
              {new Date(m.timestamp).toLocaleTimeString('en-JM', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Jamaica',
              })}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
            {new Date(m.timestamp).toLocaleTimeString('en-JM', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Jamaica',
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessageBlock({ m }: { m: AssistantMessage }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '82%' }}>
        <div
          style={{
            background: '#00A99D',
            borderRadius: '14px 14px 3px 14px',
            padding: '10px 13px',
            wordBreak: 'break-word',
          }}
        >
          <div style={{ fontSize: 12, color: 'white', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.content}</div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 4, textAlign: 'right' }}>
          {new Date(m.timestamp).toLocaleTimeString('en-JM', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Jamaica',
          })}
        </div>
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px 14px 14px 3px',
          padding: '12px 14px',
          maxWidth: '90%',
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="assistant-dot-pulse"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.5)',
                display: 'inline-block',
                animation: `assistant-dot-pulse 1.2s ease-in-out infinite`,
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AssistantPanel() {
  const { isOpen, toggleOpen, messages, isLoading, isFetching, sendMessage, currentContext } = useAssistant();
  const [input, setInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const headerSubtitle = currentContext?.pageTitle ?? 'General';
  const inputPlaceholder = currentContext ? 'Ask about your portfolio data...' : 'Ask me anything about investing...';
  const disclaimer = currentContext
    ? 'Read only · Live portfolio summaries when fetched'
    : 'Read only · General questions from any page';

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 120;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => textareaRef.current?.focus(), 320);
      return () => window.clearTimeout(t);
    }
    return undefined;
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

  const submit = async () => {
    const t = input.trim();
    if (!t || isLoading) return;
    setInput('');
    await sendMessage(t);
  };

  const showSuggested = messages.length === 0 && currentContext !== null;
  const showWelcome = messages.length === 0 && currentContext === null;

  return (
    <>
      <style>{`
        @keyframes assistant-dot-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .assistant-md-content p:last-of-type { margin-bottom: 0 !important; }
      `}</style>

      {isOpen ? (
        <button
          type="button"
          aria-label="Close assistant overlay"
          className="fixed inset-0 z-40 cursor-pointer border-0 bg-black/[0.3] p-0"
          onClick={toggleOpen}
        />
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="NexCap Assistant"
        className={`fixed right-0 top-0 z-50 flex h-screen w-[380px] flex-col border-l border-white/[0.08] bg-[#0B1F45] shadow-[-8px_0_32px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-in-out ${
          isOpen ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <header
          className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0B1F45]"
          style={{ padding: '16px 20px' }}
        >
          <div className="flex items-center gap-[10px]">
            <div
              className="flex shrink-0 items-center justify-center rounded-full"
              style={{ width: 32, height: 32, background: 'rgba(0,169,157,0.2)' }}
            >
              <SvgSparkles size={14} stroke="#00A99D" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>NexCap Assistant</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{headerSubtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleOpen}
            className="flex cursor-pointer items-center justify-center rounded-full transition-colors"
            style={{
              width: 30,
              height: 30,
              background: 'rgba(255,255,255,0.08)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            }}
            aria-label="Close NexCap Assistant"
          >
            <SvgClose size={14} stroke="rgba(255,255,255,0.6)" />
          </button>
        </header>

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-[14px] overflow-y-auto overflow-x-hidden p-4"
          style={{ padding: 16, gap: 14, scrollBehavior: 'smooth' }}
        >
          {messages.length > 0
            ? messages.map((m) =>
                m.role === 'assistant' ? (
                  <AssistantMessageBlock key={m.id} m={m} />
                ) : (
                  <UserMessageBlock key={m.id} m={m} />
                ),
              )
            : null}

          {showSuggested ? (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.35)',
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                Suggested questions
              </div>
              <div className="flex flex-col gap-2" style={{ gap: 8 }}>
                {currentContext!.suggestedPrompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={isLoading}
                    onClick={() => void sendMessage(p)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-white/10 text-left transition-colors disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      padding: '10px 14px',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    }}
                  >
                    <span className="min-w-0 flex-1">{p}</span>
                    <SvgArrowPrompt stroke="#00A99D" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showWelcome ? (
            <div
              className="flex flex-1 flex-col items-center justify-center text-center"
              style={{ padding: 24, gap: 16 }}
            >
              <div
                className="flex items-center justify-center rounded-full border"
                style={{
                  width: 48,
                  height: 48,
                  background: 'rgba(0,169,157,0.15)',
                  borderColor: 'rgba(0,169,157,0.3)',
                }}
              >
                <SvgSparkles size={20} stroke="#00A99D" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>NexCap Assistant</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: -8 }}>AI-powered portfolio intelligence</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>
                I can answer questions about your portfolio, explain investment concepts, and help you interpret performance.
              </p>
              <div
                className="w-full rounded-xl border text-left"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.08)',
                  padding: 14,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.3)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Navigate to get started
                </div>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {NAV_PAGES.map((page) => (
                    <a
                      key={page.href}
                      href={page.href}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-white/10 transition-colors"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        padding: '10px 14px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      }}
                    >
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block" style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                          {page.label}
                        </span>
                        <span className="block" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                          {page.description}
                        </span>
                      </span>
                      <SvgArrowPrompt stroke="#00A99D" />
                    </a>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 12, marginBottom: 8, width: '100%' }}>
                Or ask a general question
              </div>
              <div className="flex w-full flex-col" style={{ gap: 8 }}>
                {GENERAL_CHIPS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={isLoading}
                    onClick={() => void sendMessage(p)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-white/10 text-left transition-colors disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      padding: '10px 14px',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    }}
                  >
                    <span className="min-w-0 flex-1">{p}</span>
                    <SvgArrowPrompt stroke="#00A99D" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isLoading ? <LoadingBubble /> : null}

          <div ref={endRef} />
        </div>

        <footer
          className="shrink-0 border-t border-white/10 bg-[#0B1F45]"
          style={{ padding: '14px 16px 16px' }}
        >
          <div className="relative">
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
              className="w-full resize-none text-white outline-none focus:border-[rgba(0,169,157,0.5)] disabled:opacity-50"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 12,
                padding: '10px 44px 10px 14px',
                fontSize: 12,
                minHeight: 44,
                maxHeight: 120,
                lineHeight: 1.5,
              }}
              aria-label="Message to NexCap Assistant"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
              style={{ width: 30, height: 30, background: '#00A99D' }}
              aria-label="Send message"
            >
              <SvgSend13 />
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
            {disclaimer}
          </p>
        </footer>
      </div>
    </>
  );
}
