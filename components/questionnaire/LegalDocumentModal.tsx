'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type LegalRegisterUiRow = {
  id: string;
  document_name: string;
  purpose: string;
  status: string;
  document_id?: string | null;
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_preparation', label: 'In preparation' },
  { value: 'final', label: 'Final' },
  { value: 'executed', label: 'Executed' },
  { value: 'not_yet_drafted', label: 'Not yet drafted' },
] as const;

export type LegalDocumentModalProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  disabled?: boolean;
  initialRow: LegalRegisterUiRow;
  onSaved: (row: LegalRegisterUiRow) => void;
};

export function LegalDocumentModal({ open, onClose, mode, disabled, initialRow, onSaved }: LegalDocumentModalProps) {
  const [draft, setDraft] = useState<LegalRegisterUiRow>(initialRow);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDraft({ ...initialRow });
  }, [open, initialRow]);

  if (!open) return null;

  const handleSave = () => {
    onSaved({
      ...draft,
      document_name: draft.document_name.trim(),
      purpose: draft.purpose.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-[#0B1F45]">
            {mode === 'create' ? 'Add document' : 'Edit document'}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-navy">Document name *</label>
            <Input
              disabled={disabled}
              value={draft.document_name}
              onChange={(e) => setDraft((d) => ({ ...d, document_name: e.target.value }))}
              className="border border-gray-300 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-navy">Purpose / description *</label>
            <Textarea
              disabled={disabled}
              rows={2}
              value={draft.purpose}
              onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
              className="border border-gray-300 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-navy">Status</label>
            <Select
              disabled={disabled}
              value={draft.status || 'draft'}
              onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}
            >
              <SelectTrigger className="border border-gray-300 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#0B1F45] text-white"
            disabled={disabled || !draft.document_name.trim() || !draft.purpose.trim()}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
