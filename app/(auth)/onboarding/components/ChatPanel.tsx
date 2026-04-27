'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';

import type { ChatMessage } from '@/types/onboarding';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type ChatPanelProps = {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  error: string | null;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
};

export function ChatPanel({
  messages,
  streamingText,
  isStreaming,
  error,
  input,
  onInputChange,
  onSend,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isStreaming]);

  return (
    <div className="app-card flex h-full min-h-[520px] flex-col">
      <div className="border-b border-shell-border px-4 py-3">
        <h2 className="text-sm font-semibold text-navy">DBJ intake conversation</h2>
        <p className="text-xs text-navy/60">Describe your fund; the analyst will ask focused follow-ups.</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-navy text-navy-foreground'
                  : 'border border-shell-border bg-shell-bg text-navy'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-lg border border-shell-border bg-shell-bg px-3 py-2 text-sm text-navy">
              {streamingText || (
                <span className="inline-flex items-center gap-2 text-navy/60">
                  <Loader2 className="h-4 w-4 animate-spin text-teal" aria-hidden />
                  Analyst is thinking…
                </span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="border-t border-shell-border p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type your response…"
            className="min-h-[80px] flex-1 resize-none"
            disabled={isStreaming}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isStreaming && input.trim()) onSend();
              }
            }}
          />
          <Button
            type="button"
            className="self-end bg-teal text-white hover:bg-teal/90"
            disabled={isStreaming || !input.trim()}
            onClick={onSend}
            aria-label="Send message"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
