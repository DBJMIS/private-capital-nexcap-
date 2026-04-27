'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Megaphone, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { dsCard, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';
import type { CfpListPayload } from '@/lib/cfp/list-data';
import { formatCfpDateRange } from '@/lib/cfp/format-dates';
import { CreateCfpModal } from '@/components/cfp/CreateCfpModal';
import { CfpStatusBadge } from '@/components/cfp/CfpStatusBadge';

type Props = {
  initial: CfpListPayload;
  canWrite: boolean;
};

export function CfpListClient({ initial, canWrite }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/cfp', { cache: 'no-store' });
    const j = (await res.json()) as CfpListPayload & { error?: string };
    if (res.ok && !('error' in j && j.error)) {
      setData(j as CfpListPayload);
    }
  }, []);

  const onCreated = (id: string) => {
    void refresh();
    router.push(`/cfp/${id}`);
  };

  const { cfps, stats } = data;
  const empty = cfps.length === 0;

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">Calls for proposals</h1>
          <p className="mt-1 text-sm text-gray-400">
            {canWrite ? 'Manage CFPs and panel intake for your tenant' : 'View active and closed calls for proposals'}
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            className="rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#162d5e]"
            onClick={() => setModalOpen(true)}
          >
            + New CFP
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total CFPs" value={stats.total} accent="navy" icon={Megaphone} />
        <StatCard label="Active" value={stats.active} accent="gold" icon={Megaphone} />
        <StatCard label="Applications received" value={stats.applications_received} accent="teal" icon={ClipboardList} />
        <StatCard label="Closed" value={stats.closed} accent="gray" icon={Megaphone} />
      </div>

      {empty ? (
        <div className={cn(dsCard.padded)}>
          <EmptyState
            icon={Megaphone}
            title="No calls for proposals yet"
            subtitle="Create your first CFP to start receiving fund manager applications."
          />
          {canWrite ? (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                className="rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#162d5e]"
                onClick={() => setModalOpen(true)}
              >
                + Create CFP
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cfps.map((c) => (
            <Link
              key={c.id}
              href={`/cfp/${c.id}`}
              className={cn(
                'block overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0B1F45] bg-white p-6 transition-shadow hover:shadow-md',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <CfpStatusBadge status={c.status} />
                <span className="shrink-0 text-right text-xs text-[#6B7280]">
                  {formatCfpDateRange(c.opening_date, c.closing_date)}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-bold leading-snug text-[#0B1F45]">{c.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-[#6B7280]">{c.description?.trim() || '—'}</p>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#6B7280]">
                  <span className="inline-flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4 text-[#0B1F45]" aria-hidden />
                    {c.application_count} applications
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-[#0B1F45]" aria-hidden />
                    {c.panel_member_count} panel members
                  </span>
                  <span className={cn(dsType.muted, 'text-[#0B1F45]')}>Open →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateCfpModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreated} />
    </div>
  );
}
