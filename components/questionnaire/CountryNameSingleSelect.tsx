'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';

import type { SelectOption } from '@/lib/questionnaire/types';
import { CARIBBEAN_COUNTRIES_FIRST } from '@/components/questionnaire/CountryMultiSelect';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** Match compact field labels used in structured list rows. */
  fieldLabelStyle?: 'default' | 'compact';
};

export function CountryNameSingleSelect({
  id,
  label,
  required,
  value,
  onChange,
  disabled,
  fieldLabelStyle = 'default',
}: Props) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/reference/countries')
      .then((r) => r.json())
      .then((j: { countries?: { code: string; name: string }[] }) => {
        if (cancelled) return;
        setOptions((j.countries ?? []).map((c) => ({ value: c.name, label: c.name })));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? options.filter((o) => o.label.toLowerCase().includes(s)) : [...options];
    const carib = base.filter((o) => CARIBBEAN_COUNTRIES_FIRST.has(o.label));
    const rest = base.filter((o) => !CARIBBEAN_COUNTRIES_FIRST.has(o.label)).sort((a, b) => a.label.localeCompare(b.label));
    return [...carib, ...rest];
  }, [options, q]);

  const selectedLabel = value.trim();

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={id}
        className={
          fieldLabelStyle === 'compact'
            ? 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500'
            : 'mb-1 block text-[13px] font-medium normal-case leading-snug text-navy'
        }
      >
        {label}
        {required ? <span className="text-gold"> *</span> : null}
      </label>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-left text-sm',
          !selectedLabel && 'text-muted-foreground',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="truncate">{selectedLabel || 'Search countries…'}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>
      {selectedLabel ? (
        <button
          type="button"
          disabled={disabled}
          className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#0B1F45] px-3 py-1 text-xs text-white"
          onClick={() => onChange('')}
          aria-label="Clear country"
        >
          {selectedLabel}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-gray-400"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No match</li>
            ) : (
              filtered.map((o) => {
                const sel = o.label === selectedLabel;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        sel ? 'bg-[#0B1F45]/5 font-medium text-[#0B1F45]' : 'text-gray-700 hover:bg-gray-50',
                      )}
                      onClick={() => {
                        onChange(o.label);
                        setOpen(false);
                        setQ('');
                      }}
                    >
                      <Check className={cn('h-4 w-4 shrink-0', sel ? 'opacity-100' : 'opacity-0')} aria-hidden />
                      {o.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
