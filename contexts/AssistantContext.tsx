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

import type { AssistantAnswerMode, AssistantMessage, PageContext } from '@/lib/assistant/types';
import { PAGE_SUGGESTED_PROMPTS } from '@/lib/assistant/page-contexts';
import { useAuth } from '@/hooks/use-auth';

const MAX_SESSION_MESSAGES = 15;

function isAnswerMode(m: string): m is AssistantAnswerMode {
  return m === 'page_context' || m === 'live_query' || m === 'knowledge' || m === 'interpretation';
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
      setIsFetching(false);

      const historyWire = historySnapshot.map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));

      const pushError = () => {
        const assistantMsg: AssistantMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'I encountered an error. Please try again.',
          timestamp: new Date(),
          pageId: effectiveContext.pageId,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (!isOpenRef.current) setHasUnread(true);
      };

      try {
        const res1 = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message: text,
            context: effectiveContext,
            history: historyWire,
            phase2Enabled: true,
            phase2Step: 'classify',
          }),
        });
        const j1 = (await res1.json().catch(() => ({}))) as {
          message?: string;
          mode?: string;
          endpointId?: string | null;
          params?: Record<string, string> | null;
          reasoning?: string | null;
        };

        if (res1.status === 429) {
          const assistantMsg: AssistantMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: j1.message ?? 'Session message limit reached. Please start a new session to continue.',
            timestamp: new Date(),
            pageId: effectiveContext.pageId,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          if (!isOpenRef.current) setHasUnread(true);
          return;
        }

        if (!res1.ok) {
          pushError();
          return;
        }

        const modeRaw = typeof j1.mode === 'string' ? j1.mode : 'page_context';
        const mode: AssistantAnswerMode = isAnswerMode(modeRaw) ? modeRaw : 'page_context';
        if (mode === 'live_query') {
          setIsFetching(true);
        }

        const res2 = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message: text,
            context: effectiveContext,
            history: historyWire,
            phase2Enabled: true,
            phase2Step: 'answer',
            classification: {
              mode,
              endpoint_id: j1.endpointId ?? null,
              params: j1.params ?? null,
              reasoning: j1.reasoning ?? null,
            },
          }),
        });
        const j2 = (await res2.json().catch(() => ({}))) as {
          message?: string;
          messageId?: string;
          mode?: string;
          endpointUsed?: string | null;
          error?: string;
        };

        if (res2.status === 429) {
          const assistantMsg: AssistantMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: j2.message ?? 'Session message limit reached. Please start a new session to continue.',
            timestamp: new Date(),
            pageId: effectiveContext.pageId,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          if (!isOpenRef.current) setHasUnread(true);
          return;
        }

        if (!res2.ok || typeof j2.message !== 'string' || !j2.message.trim()) {
          pushError();
          return;
        }

        const answerMode: AssistantAnswerMode =
          typeof j2.mode === 'string' && isAnswerMode(j2.mode) ? j2.mode : mode;
        const assistantMsg: AssistantMessage = {
          id: j2.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          content: j2.message.trim(),
          timestamp: new Date(),
          pageId: effectiveContext.pageId,
          mode: answerMode,
          endpointUsed: j2.endpointUsed ?? null,
          fetchedLiveData: answerMode === 'live_query',
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (!isOpenRef.current) setHasUnread(true);
      } catch {
        pushError();
      } finally {
        setIsFetching(false);
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
