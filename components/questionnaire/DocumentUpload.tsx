'use client';

import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DdDocumentRow = {
  id: string;
  file_name: string;
  tag: string | null;
  file_size_bytes: number;
  mime_type: string;
  staff_bio_id?: string | null;
};

export type DocumentUploadProps = {
  questionnaireId: string;
  sectionKey: string;
  tag: string;
  questionKey?: string;
  staffBioId?: string | null;
  existing?: DdDocumentRow | null;
  disabled?: boolean;
  onUploaded?: (doc: DdDocumentRow) => void;
  onDeleted?: () => void;
  /** Refetch section documents after upload/remove */
  onListChanged?: () => void;
  label?: string;
};

export function DocumentUpload({
  questionnaireId,
  sectionKey,
  tag,
  questionKey,
  staffBioId,
  existing,
  disabled,
  onUploaded,
  onDeleted,
  onListChanged,
  label,
}: DocumentUploadProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.set('file', file);
        fd.set('section_key', sectionKey);
        fd.set('tag', tag);
        if (questionKey) fd.set('question_key', questionKey);
        if (staffBioId) fd.set('staff_bio_id', staffBioId);

        const res = await fetch(`/api/questionnaires/${questionnaireId}/documents`, {
          method: 'POST',
          body: fd,
        });
        const json = (await res.json()) as { error?: string; document?: DdDocumentRow };
        if (!res.ok) {
          setError(json.error ?? 'Upload failed');
          return;
        }
        if (json.document) onUploaded?.(json.document);
        onListChanged?.();
      } finally {
        setBusy(false);
      }
    },
    [onListChanged, onUploaded, questionnaireId, questionKey, sectionKey, staffBioId, tag],
  );

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/questionnaires/${questionnaireId}/documents/${existing.id}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Delete failed');
        return;
      }
      onDeleted?.();
      onListChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled || busy || existing) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">{label}</p>}
      {existing ? (
        <div className="rounded-md border border-[#e5e7eb] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="truncate text-navy">{existing.file_name}</span>
            <span className="text-xs text-navy/50">{(existing.file_size_bytes / 1024).toFixed(0)} KB</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || busy}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget === e.target) setDragOver(false);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
          className={cn(
            'w-full rounded-md border-2 border-dashed p-5 transition-colors',
            dragOver ? 'border-teal bg-teal/[0.06]' : 'border-[#e5e7eb] bg-[#fafafa]',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <p className="mb-2 text-center text-[13px] text-[#6b7280]">Drag and drop a file here, or choose a file</p>
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
            disabled={disabled || busy}
            className={cn(
              'block w-full text-xs text-navy file:mr-2 file:rounded file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:text-navy-foreground',
            )}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f);
            }}
          />
        </div>
      )}
      {error && <p className="text-xs text-gold-muted">{error}</p>}
      {busy && <p className="text-xs text-navy/50">Working…</p>}
    </div>
  );
}
