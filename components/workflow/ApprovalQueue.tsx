'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApprovalDecisionModal } from '@/components/workflow/ApprovalDecisionModal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { dsCard } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { Inbox, History } from 'lucide-react';

type ApprovalRow = {
  id: string;
  approval_type: string;
  entity_type: string;
  entity_id: string;
  status: string;
  created_at: string;
  assigned_to: string | null;
};

export function ApprovalQueue() {
  const [pending, setPending] = useState<ApprovalRow[]>([]);
  const [past, setPast] = useState<ApprovalRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [modalId, setModalId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    const [p, h] = await Promise.all([
      fetch('/api/approvals?pending_for=me&limit=200'),
      fetch('/api/approvals?past_by=me&limit=200'),
    ]);
    const pj = (await p.json()) as { approvals?: ApprovalRow[]; error?: string };
    const hj = (await h.json()) as { approvals?: ApprovalRow[]; error?: string };
    if (!p.ok) setErr(pj.error ?? 'Failed to load queue');
    else setPending(pj.approvals ?? []);
    if (h.ok) setPast(hj.approvals ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (a: ApprovalRow) => {
    setModalId(a.id);
    setModalTitle(`${a.approval_type.replace(/_/g, ' ')} · ${a.entity_type} ${a.entity_id.slice(0, 8)}…`);
  };

  return (
    <div className="space-y-6">
      {err && <p className="text-sm text-red-700">{err}</p>}

      <section className={cn(dsCard.padded)}>
        <SectionHeader
          icon={Inbox}
          iconVariant="gold"
          title="Pending for you"
          count={pending.length}
          description="Includes items with no specific assignee (pool)."
        />
        <ul className="space-y-2">
          {pending.length === 0 ? (
            <EmptyState icon={Inbox} title="No pending approvals" subtitle="You are all caught up." className="py-12" />
          ) : (
            pending.map((a) => (
              <li
                key={a.id}
                className={cn(dsCard.shell, 'flex flex-wrap items-center justify-between gap-2 p-4')}
              >
                <div>
                  <p className="font-medium capitalize text-[#0B1F45]">{a.approval_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">
                    {a.entity_type} · {a.entity_id}
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => openModal(a)}>
                  Decide
                </Button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className={cn(dsCard.padded)}>
        <SectionHeader icon={History} iconVariant="navy" title="Past decisions by you" count={past.length} />
        <ul className="divide-y divide-gray-100 text-sm">
          {past.length === 0 ? (
            <li className="py-8 text-center text-gray-400">None yet.</li>
          ) : (
            past.slice(0, 50).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-gray-700">
                <span className="capitalize">{a.approval_type.replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  <span className="text-xs text-gray-500">{formatDateTime(a.created_at)}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <ApprovalDecisionModal
        open={modalId !== null}
        approvalId={modalId}
        title={modalTitle}
        onClose={() => setModalId(null)}
        onDecided={() => void load()}
      />
    </div>
  );
}
