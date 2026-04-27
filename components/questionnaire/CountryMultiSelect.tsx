'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

import type { SelectOption } from '@/lib/questionnaire/types';
import { cn } from '@/lib/utils';

/** Caribbean + priority jurisdictions first (same ordering as multi-select). */
export const CARIBBEAN_COUNTRIES_FIRST = new Set([
  'Jamaica',
  'Trinidad and Tobago',
  'Barbados',
  'Guyana',
  'Bahamas',
  'Belize',
  'Saint Lucia',
  'Grenada',
  'Antigua and Barbuda',
  'Saint Vincent and the Grenadines',
  'Dominica',
  'Saint Kitts and Nevis',
  'Suriname',
  'Haiti',
  'Dominican Republic',
  'Cuba',
  'Puerto Rico',
]);

type CountryMultiSelectProps = {
  id: string;
  label: string;
  required?: boolean;
  helper?: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
};

function parseSelected(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v)).filter(Boolean);
      }
    } catch {
      // fallback
    }
    return s
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

export function CountryMultiSelect({ id, label, required, helper, value, onChange, disabled }: CountryMultiSelectProps) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedCountries = useMemo(() => parseSelected(value), [value]);
  const selectedSet = useMemo(() => new Set(selectedCountries), [selectedCountries]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/reference/countries')
      .then((r) => r.json())
      .then((j: { countries?: { code: string; name: string }[] }) => {
        if (cancelled) return;
        setOptions((j.countries ?? []).map((c) => ({ value: c.code, label: c.name })));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const caribbean = useMemo(() => filtered.filter((o) => CARIBBEAN_COUNTRIES_FIRST.has(o.label)), [filtered]);
  const allCountries = useMemo(
    () => [...filtered].sort((a, b) => a.label.localeCompare(b.label)),
    [filtered],
  );

  const toggleCountry = (code: string) => {
    if (disabled) return;
    if (selectedSet.has(code)) {
      onChange(
        id,
        selectedCountries.filter((v) => v !== code),
      );
    } else {
      onChange(id, [...selectedCountries, code]);
    }
    setSearchQuery('');
  };

  const removeCountry = (code: string) => {
    if (disabled) return;
    onChange(
      id,
      selectedCountries.filter((v) => v !== code),
    );
  };

  const byCode = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);

  return (
    <div className="relative" ref={rootRef}>
      <div className="mb-1 flex items-end justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium normal-case leading-snug text-navy">
          {label}
          {required && <span className="text-gold"> *</span>}
        </label>
      </div>
      {helper && <p className="mb-2 text-[12px] leading-snug text-[#6b7280]">{helper}</p>}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={id}
          type="text"
          value={searchQuery}
          disabled={disabled}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Search countries..."
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-[#0B1F45]/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {selectedCountries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedCountries.map((code) => (
            <span
              key={code}
              className="inline-flex items-center rounded-full bg-[#0B1F45] px-3 py-1 text-xs text-white"
            >
              {byCode.get(code) ?? code}
              <button
                type="button"
                className="ml-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-[#162d5e]"
                onClick={() => removeCountry(code)}
                aria-label={`Remove ${byCode.get(code) ?? code}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-md">
          {filtered.length === 0 ? (
            <div className="py-3 text-center text-sm text-gray-400">No countries found</div>
          ) : (
            <>
              <div className="sticky top-0 bg-gray-50 px-3 py-1 text-xs uppercase tracking-wide text-gray-400">Caribbean</div>
              {caribbean.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <button
                    key={`caribbean-${o.value}`}
                    type="button"
                    onClick={() => toggleCountry(o.value)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50',
                      checked && 'bg-teal-50 font-medium text-[#0F8A6E]',
                    )}
                  >
                    <span>{o.label}</span>
                    {checked ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })}
              <div className="sticky top-0 bg-gray-50 px-3 py-1 text-xs uppercase tracking-wide text-gray-400">All Countries</div>
              {allCountries.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <button
                    key={`all-${o.value}`}
                    type="button"
                    onClick={() => toggleCountry(o.value)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50',
                      checked && 'bg-teal-50 font-medium text-[#0F8A6E]',
                    )}
                  >
                    <span>{o.label}</span>
                    {checked ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

