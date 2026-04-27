'use client';

import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type ChecklistItemData = {
  id: string;
  item_key: string;
  label: string;
  status: 'yes' | 'no' | 'pending';
  notes: string | null;
};

export type ChecklistItemProps = {
  item: ChecklistItemData;
  disabled?: boolean;
  onUpdate: (itemKey: string, status: 'yes' | 'no' | 'pending', notes: string | null) => Promise<void>;
};

export function ChecklistItem({ item, disabled, onUpdate }: ChecklistItemProps) {
  const [notes, setNotes] = useState(item.notes ?? '');
  const [saving, setSaving] = useState(false);

  const persist = useCallback(
    async (status: 'yes' | 'no' | 'pending', nextNotes?: string | null) => {
      setSaving(true);
      try {
        await onUpdate(item.item_key, status, (nextNotes ?? notes.trim()) || null);
      } finally {
        setSaving(false);
      }
    },
    [item.item_key, notes, onUpdate],
  );

  return (
    <div className="rounded-lg border border-shell-border bg-shell-card p-4 shadow-shell">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm font-medium text-navy">{item.label}</p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant={item.status === 'yes' ? 'default' : 'outline'}
            disabled={disabled || saving}
            className={
              item.status === 'yes'
                ? 'bg-teal text-teal-foreground hover:bg-teal/90'
                : 'border-shell-border'
            }
            onClick={() => void persist('yes')}
          >
            Y
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.status === 'no' ? 'default' : 'outline'}
            disabled={disabled || saving}
            className={
              item.status === 'no'
                ? 'bg-gold-muted text-navy hover:bg-gold-muted/90'
                : 'border-shell-border'
            }
            onClick={() => void persist('no')}
          >
            N
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`notes-${item.item_key}`} className="text-xs text-navy/70">
          Notes (optional)
        </Label>
        <Textarea
          id={`notes-${item.item_key}`}
          value={notes}
          disabled={disabled || saving}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            const trimmed = notes.trim();
            const prev = (item.notes ?? '').trim();
            if (trimmed === prev) return;
            void persist(item.status, trimmed || null);
          }}
          rows={2}
          className="resize-y border-shell-border text-sm"
          placeholder="Supporting context for this line item…"
        />
      </div>
    </div>
  );
}
