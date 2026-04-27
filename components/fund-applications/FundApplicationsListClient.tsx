'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { AvatarInitials } from '@/components/ui/AvatarInitials';
import { dsTable, statusBadgeClasses } from '@/components/ui/design-system';
import { formatShortDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { AssignCfpMenu, type ActiveCfpOption } from '@/components/fund-applications/AssignCfpMenu';

export type FundApplicationRow = {
  id: string;
  fund_name: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  cfp_id: string | null;
  cfp_title: string | null;
};

type Props = {
  initialRows: FundApplicationRow[];
  activeCfps: ActiveCfpOption[];
};

const PREQUALIFIED_OR_LATER = new Set([
  'pre_qualified',
  'shortlisted',
  'presentation_scheduled',
  'presentation_complete',
  'panel_evaluation',
  'dd_recommended',
  'dd_complete',
  'site_visit',
  'negotiation',
  'committed',
]);

function showPrequalifyLink(status: string) {
  return status === 'submitted' || status === 'pre_screening';
}

export function FundApplicationsListClient({ initialRows, activeCfps }: Props) {
  const [rows, setRows] = useState(initialRows);

  const onLinked = useCallback((applicationId: string, cfpId: string, cfpTitle: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === applicationId ? { ...r, cfp_id: cfpId, cfp_title: cfpTitle } : r)),
    );
  }, []);

  return (
    <div className={cn(dsTable.container)}>
      <table className="min-w-full divide-y divide-gray-100">
        <thead className={dsTable.thead}>
          <tr>
            <th className={dsTable.th}>Fund</th>
            <th className={dsTable.th}>CFP</th>
            <th className={dsTable.th}>Status</th>
            <th className={dsTable.th}>Submitted</th>
            <th className={cn(dsTable.th, 'text-right')}> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r) => (
            <tr key={r.id} className={dsTable.rowHover}>
              <td className={dsTable.td}>
                <div className="flex items-center gap-3">
                  <AvatarInitials name={r.fund_name} />
                  <Link href={`/fund-applications/${r.id}`} className="font-medium text-[#0B1F45] hover:underline">
                    {r.fund_name}
                  </Link>
                </div>
              </td>
              <td className={dsTable.td}>
                {r.cfp_id ? (
                  <Link href={`/cfp/${r.cfp_id}`} className="text-sm font-medium text-[#0B1F45] hover:underline">
                    {r.cfp_title ?? 'CFP'}
                  </Link>
                ) : (
                  <AssignCfpMenu
                    applicationId={r.id}
                    activeCfps={activeCfps}
                    onLinked={(cfpId, title) => onLinked(r.id, cfpId, title)}
                  />
                )}
              </td>
              <td className={dsTable.td}>
                <StatusBadge status={r.status} />
              </td>
              <td className={cn(dsTable.td, 'text-gray-500')}>
                {r.submitted_at ? formatShortDate(r.submitted_at) : '—'}
              </td>
              <td className={cn(dsTable.td, 'text-right')}>
                <div className="flex flex-wrap justify-end gap-2">
                  {PREQUALIFIED_OR_LATER.has(r.status) ? (
                    <span className={statusBadgeClasses('pre_qualified')}>Pre-qualified ✓</span>
                  ) : showPrequalifyLink(r.status) ? (
                    <ActionButton href={`/applications/${r.id}/prequalification`}>Pre-qualify →</ActionButton>
                  ) : null}
                  <ActionButton href={`/fund-applications/${r.id}`}>Evaluation</ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
