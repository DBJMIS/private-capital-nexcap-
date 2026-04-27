'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

import { PIPELINE_SECTOR_OPTIONS, pipelineSectorLabel } from '@/lib/questionnaire/pipeline-sectors';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
};

export function PipelineSectorCombobox({ id, value, onChange, disabled, required }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [...PIPELINE_SECTOR_OPTIONS];
    return PIPELINE_SECTOR_OPTIONS.filter(
      (o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s),
    );
  }, [q]);

  const label = pipelineSectorLabel(value);

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-navy">
        Sector {required ? <span className="text-gold">*</span> : null}
      </label>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-left text-sm',
          !value && 'text-muted-foreground',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="truncate">{label || 'Search sectors…'}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-gray-400"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map((o) => {
              const sel = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                      sel ? 'bg-[#0B1F45]/5 font-medium text-[#0B1F45]' : 'text-gray-700 hover:bg-gray-50',
                    )}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <Check className={cn('h-4 w-4 shrink-0', sel ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    {o.label}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-gray-500">No match</li> : null}
          </ul>
        </div>
      )}
    </div>
  );
}
