'use client';

import { useRef } from 'react';
import { Sparkles } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AiSubcriteriaEntry } from '@/lib/assessment/dd-ai-assess-prompt';

export type SubcriteriaRowProps = {
  label: string;
  maxPoints: number;
  score: number | null;
  notes: string;
  disabled?: boolean;
  onChange: (patch: { score: number | null; notes: string }) => void;
  aiSuggestion?: AiSubcriteriaEntry | null;
  aiAccepted?: boolean;
  aiDiffers?: boolean;
  onAcceptAi?: () => void;
  onOverride?: () => void;
  weightedPreview?: string | null;
};

export function SubcriteriaRow({
  label,
  maxPoints,
  score,
  notes,
  disabled,
  onChange,
  aiSuggestion,
  aiAccepted,
  aiDiffers,
  onAcceptAi,
  onOverride,
  weightedPreview,
}: SubcriteriaRowProps) {
  const inputId = `score-${label.replace(/\s+/g, '-').slice(0, 24)}`;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <p className="text-sm font-semibold text-[#0B1F45]">{label}</p>
        <p className="shrink-0 text-xs text-gray-400">Max {maxPoints} pts</p>
      </div>

      {aiSuggestion ? (
        <div className="my-3 rounded-lg bg-indigo-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-indigo-900">
              AI suggests: {Math.round(Number(aiSuggestion.suggested_score))} / {maxPoints}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn(
                  'h-8 rounded-lg px-3 text-xs',
                  aiAccepted ? 'cursor-default bg-teal-600 text-white hover:bg-teal-600' : 'bg-indigo-500 text-white hover:bg-indigo-600',
                )}
                disabled={disabled || aiAccepted}
                onClick={() => onAcceptAi?.()}
              >
                {aiAccepted ? '✓ Accepted' : 'Accept'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-gray-300 px-3 text-xs"
                disabled={disabled}
                onClick={() => {
                  onOverride?.();
                  inputRef.current?.focus();
                }}
              >
                Override
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs italic leading-relaxed text-gray-600">{aiSuggestion.evidence}</p>
          <p className="mt-2 text-xs text-gray-500">
            <span className="font-medium text-gray-600">Reasoning: </span>
            {aiSuggestion.reasoning}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-gray-600">
          Score
        </label>
        <Input
          ref={inputRef}
          id={inputId}
          type="number"
          min={0}
          max={maxPoints}
          step={1}
          disabled={disabled}
          value={score === null || score === undefined ? '' : score}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') onChange({ score: null, notes });
            else {
              const n = parseInt(v, 10);
              if (!Number.isNaN(n)) onChange({ score: n, notes });
            }
          }}
          className="h-9 w-16 border border-gray-300 text-center text-sm font-semibold focus:border-transparent focus:ring-2 focus:ring-[#0B1F45]"
        />
        <span className="text-xs text-gray-400">/ {maxPoints}</span>
        <input
          type="text"
          disabled={disabled}
          value={notes}
          onChange={(e) => onChange({ score, notes: e.target.value })}
          placeholder="Optional notes…"
          className="ml-auto min-w-[8rem] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B1F45]/30"
        />
      </div>

      {aiAccepted ? <p className="mt-2 text-xs text-teal-600">✓ AI score accepted</p> : null}
      {aiDiffers && aiSuggestion && !aiAccepted ? (
        <p className="mt-2 text-xs text-amber-600">
          ↑ Override: AI suggested {Math.round(Number(aiSuggestion.suggested_score))}
        </p>
      ) : null}
      {weightedPreview ? <p className="mt-1 text-[11px] text-gray-400">{weightedPreview}</p> : null}
    </div>
  );
}
