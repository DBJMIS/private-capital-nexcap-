'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { AssistantAnswerMode, AssistantMessage, PageContext, QueryType } from '@/lib/assistant/types';
import { isQueryType } from '@/lib/assistant/types';
import { PAGE_SUGGESTED_PROMPTS } from '@/lib/assistant/page-contexts';
import { useAuth } from '@/hooks/use-auth';

const MAX_SESSION_MESSAGES = 15;

function isAnswerMode(m: string): m is AssistantAnswerMode {
  return m === 'page_context' || m === 'live_query' || m === 'knowledge' || m === 'interpretation';
}

function parseQueryUsed(raw: unknown): QueryType | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'string') return undefined;
  return isQueryType(raw) ? raw : undefined;
}

export type AssistantContextValue = {
  messages: AssistantMessage[];
  isOpen: boolean;
  isLoading: boolean;
  isFetching: boolean;
  currentContext: PageContext | null;
  hasUnread: boolean;
  setPageContext: (context: PageContext | null) => void;
  sendMessage: (message: string) => Promise<void>;
  clearSession: () => void;
  toggleOpen: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user, role, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [currentContext, setCurrentContextState] = useState<PageContext | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const setPageContext = useCallback((context: PageContext | null) => {
    setCurrentContextState(context);
  }, []);

  const clearSession = useCallback(() => {
    setMessages([]);
    setHasUnread(false);
    setIsOpen(false);
    setIsLoading(false);
    setIsFetching(false);
    setCurrentContextState(null);
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen((o) => {
      const next = !o;
      if (next) setHasUnread(false);
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (authLoading) return;

      const fallbackContext: PageContext | null =
        user?.user_id && role
          ? {
              pageId: 'general',
              pageTitle: 'General',
              userRole: role,
              userId: user.user_id,
              data: {},
              suggestedPrompts: [...PAGE_SUGGESTED_PROMPTS.general],
            }
          : null;

      const effectiveContext = currentContext ?? fallbackContext;
      if (!effectiveContext) return;

      if (text.length > 499) return;

      if (messages.length >= MAX_SESSION_MESSAGES) {
        const limitMsg: AssistantMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Session message limit reached. Please start a new session to continue.',
          timestamp: new Date(),
          pageId: effectiveContext.pageId,
        };
        setMessages((prev) => [...prev, limitMsg]);
        if (!isOpenRef.current) setHasUnread(true);
        return;
      }

      const historySnapshot = messages;
      const userMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        pageId: effectiveContext.pageId,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const historyWire = historySnapshot.map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));

      const pushError = (content?: string) => {
        const assistantMsg: AssistantMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: content ?? 'I encountered an error. Please try again.',
          timestamp: new Date(),
          pageId: effectiveContext.pageId,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (!isOpenRef.current) setHasUnread(true);
      };

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message: text,
            context: effectiveContext,
            history: historyWire,
            phase2Enabled: true,
            phase2Step: 'full',
          }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            const rateLimitMsg =
              typeof errBody.message === 'string'
                ? errBody.message
                : 'Session message limit reached. Please start a new session to continue.';
            pushError(rateLimitMsg);
            return;
          }
          pushError();
          return;
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/event-stream')) {
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const answerText = data.message;
          const answerId = data.messageId;
          if (typeof answerText !== 'string' || !answerText.trim() || typeof answerId !== 'string') {
            pushError();
            return;
          }

          const modeRaw = typeof data.mode === 'string' ? data.mode : 'page_context';
          const answerMode: AssistantAnswerMode = isAnswerMode(modeRaw) ? modeRaw : 'page_context';

          const queryUsed = parseQueryUsed(data.queryUsed);

          const assistantMsg: AssistantMessage = {
            id: answerId,
            role: 'assistant',
            content: answerText.trim(),
            timestamp: new Date(),
            pageId: effectiveContext.pageId,
            mode: answerMode,
            queryUsed,
            fetchedLiveData: answerMode === 'live_query',
          };
          setMessages((prev) => [...prev, assistantMsg]);
          if (!isOpenRef.current) setHasUnread(true);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          pushError('Stream unavailable. Please try again.');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let streamingId: string | null = null;
        let streamingContent = '';
        const placeholderId = crypto.randomUUID();

        setMessages((prev) => [
          ...prev,
          {
            id: placeholderId,
            role: 'assistant' as const,
            content: '',
            timestamp: new Date(),
            pageId: effectiveContext.pageId,
            streaming: true,
          },
        ]);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();

              try {
                const event = JSON.parse(raw) as {
                  type?: string;
                  messageId?: string;
                  mode?: string;
                  queryUsed?: string | null;
                  status?: string | null;
                  text?: string;
                  message?: string;
                };

                if (event.type === 'meta') {
                  setIsLoading(false);
                  streamingId = typeof event.messageId === 'string' ? event.messageId : null;
                  const modeRaw = typeof event.mode === 'string' ? event.mode : 'page_context';
                  const answerMode: AssistantAnswerMode = isAnswerMode(modeRaw) ? modeRaw : 'page_context';
                  const queryUsed = parseQueryUsed(event.queryUsed);
                  const statusText = typeof event.status === 'string' ? event.status : '';

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === placeholderId
                        ? {
                            ...m,
                            id: streamingId ?? m.id,
                            mode: answerMode,
                            queryUsed,
                            content: statusText,
                          }
                        : m,
                    ),
                  );
                  if (!isOpenRef.current) setHasUnread(true);
                }

                if (event.type === 'delta' && typeof event.text === 'string') {
                  streamingContent += event.text;
                  const currentId = streamingId ?? placeholderId;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === currentId ? { ...m, content: streamingContent } : m)),
                  );
                }

                if (event.type === 'done') {
                  const currentId = streamingId ?? placeholderId;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentId
                        ? {
                            ...m,
                            streaming: false,
                            fetchedLiveData: m.mode === 'live_query',
                          }
                        : m,
                    ),
                  );
                  if (!isOpenRef.current) setHasUnread(true);
                }

                if (event.type === 'error') {
                  const currentId = streamingId ?? placeholderId;
                  const interruptMsg =
                    streamingContent.trim().length > 0
                      ? streamingContent
                      : typeof event.message === 'string'
                        ? event.message
                        : 'Response interrupted. Please try again.';
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentId
                        ? {
                            ...m,
                            streaming: false,
                            content: interruptMsg,
                            fetchedLiveData: m.mode === 'live_query',
                          }
                        : m,
                    ),
                  );
                }
              } catch {
                /* skip malformed SSE JSON */
              }
            }
          }
        } catch {
          const currentId = streamingId ?? placeholderId;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentId
                ? {
                    ...m,
                    streaming: false,
                    content:
                      streamingContent.trim().length > 0
                        ? streamingContent
                        : 'Response interrupted. Please try again.',
                    fetchedLiveData: m.mode === 'live_query',
                  }
                : m,
            ),
          );
          if (!isOpenRef.current) setHasUnread(true);
        } finally {
          reader.releaseLock();
        }
      } catch {
        pushError();
      } finally {
        setIsLoading(false);
      }
    },
    [authLoading, currentContext, messages, role, user?.user_id],
  );

  const value = useMemo(
    () => ({
      messages,
      isOpen,
      isLoading,
      isFetching,
      currentContext,
      hasUnread,
      setPageContext,
      sendMessage,
      clearSession,
      toggleOpen,
    }),
    [messages, isOpen, isLoading, isFetching, currentContext, hasUnread, setPageContext, sendMessage, clearSession, toggleOpen],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error('useAssistant must be used within AssistantProvider');
  }
  return ctx;
}

/** Safe for components that may render outside `AssistantProvider` (no-op when null). */
export function useAssistantOptional(): AssistantContextValue | null {
  return useContext(AssistantContext);
}
