'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ConfirmModalVariant = 'success' | 'danger' | 'warning';

export type ConfirmModalProps = {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  /** Shown instead of `confirmLabel` while the confirm action is running (with spinner). */
  loadingConfirmLabel?: string;
  confirmVariant: ConfirmModalVariant;
  isLoading?: boolean;
  cancelLabel?: string;
};

export function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel,
  loadingConfirmLabel,
  confirmVariant,
  isLoading = false,
  cancelLabel = 'Cancel',
}: ConfirmModalProps) {
  const [running, setRunning] = useState(false);
  const busy = isLoading || running;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setRunning(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setRunning(true);
    try {
      await onConfirm();
    } catch (e) {
      console.error('[ConfirmModal] onConfirm failed', e);
    } finally {
      setRunning(false);
    }
  };

  const icon =
    confirmVariant === 'success' ? (
      <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
    ) : confirmVariant === 'danger' ? (
      <XCircle className="h-12 w-12 text-red-500" aria-hidden />
    ) : (
      <AlertTriangle className="h-12 w-12 text-amber-500" aria-hidden />
    );

  const confirmBtnClass =
    confirmVariant === 'success'
      ? 'bg-emerald-500 hover:bg-emerald-600'
      : confirmVariant === 'danger'
        ? 'bg-red-500 hover:bg-red-600'
        : 'bg-amber-500 hover:bg-amber-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        <div className="flex flex-col items-center">
          {icon}
          <h2 id="confirm-modal-title" className="mt-3 text-center text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <p id="confirm-modal-message" className="mt-2 text-center text-sm leading-relaxed text-gray-500">
            {message}
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:pointer-events-none disabled:opacity-50',
              confirmBtnClass,
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? (loadingConfirmLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
