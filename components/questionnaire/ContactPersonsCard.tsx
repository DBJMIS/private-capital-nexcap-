'use client';

import { useCallback, useMemo } from 'react';
import { Check, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  type ContactPersonRow,
  countContactsWithNameAndEmail,
  newContactRow,
  normalizeContactPersonsValue,
} from '@/lib/questionnaire/contact-persons';

export type ContactPersonsCardProps = {
  value: unknown;
  onChange: (next: ContactPersonRow[]) => void;
  disabled?: boolean;
};

export function ContactPersonsCard({ value, onChange, disabled }: ContactPersonsCardProps) {
  const contacts = useMemo(() => normalizeContactPersonsValue(value), [value]);

  const updateRow = useCallback(
    (index: number, patch: Partial<ContactPersonRow>) => {
      const next = contacts.map((r, i) => (i === index ? { ...r, ...patch } : r));
      onChange(next);
    },
    [contacts, onChange],
  );

  const removeRow = useCallback(
    (index: number) => {
      if (contacts.length <= 2) return;
      onChange(contacts.filter((_, i) => i !== index));
    },
    [contacts, onChange],
  );

  const addRow = useCallback(() => {
    onChange([...contacts, newContactRow()]);
  }, [contacts, onChange]);

  const nameEmailOk = countContactsWithNameAndEmail(contacts) >= 2;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {contacts.map((row, index) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-[12px] font-semibold text-gray-400"
              aria-hidden
            >
              {index + 1}
            </span>
            <Input
              aria-label={`Contact ${index + 1} name`}
              className="min-w-0 flex-1"
              disabled={disabled}
              placeholder="Full name"
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
            />
            <Input
              aria-label={`Contact ${index + 1} email`}
              type="email"
              className="min-w-0 flex-1"
              disabled={disabled}
              placeholder="Email address"
              value={row.email}
              onChange={(e) => updateRow(index, { email: e.target.value })}
            />
            <Input
              aria-label={`Contact ${index + 1} phone`}
              type="tel"
              className="min-w-0 flex-1"
              disabled={disabled}
              placeholder="+1-876-555-0101"
              value={row.phone}
              onChange={(e) => updateRow(index, { phone: e.target.value })}
            />
            {contacts.length > 2 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                disabled={disabled}
                aria-label={`Remove contact ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={addRow}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]"
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        Add Contact Person
      </Button>

      <p
        className={cn(
          'flex items-center gap-1.5 text-xs',
          nameEmailOk ? 'font-medium text-[#0F8A6E]' : 'text-gray-400',
        )}
      >
        {nameEmailOk ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            At least 2 contact persons have name and email
          </>
        ) : (
          <>At least 2 contact persons required</>
        )}
      </p>
    </div>
  );
}
