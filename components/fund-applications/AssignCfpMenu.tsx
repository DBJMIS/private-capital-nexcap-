'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ActiveCfpOption = {
  id: string;
  title: string;
  closing_date: string;
};

type Props = {
  applicationId: string;
  activeCfps: ActiveCfpOption[];
  onLinked: (cfpId: string, cfpTitle: string) => void;
};

export function AssignCfpMenu({ applicationId, activeCfps, onLinked }: Props) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const assign = async (cfpId: string, title: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfp_id: cfpId }),
      });
      const j = (await res.json()) as { error?: string; cfp_title?: string };
      if (!res.ok) {
        alert(j.error ?? 'Failed to assign CFP');
        return;
      }
      onLinked(cfpId, j.cfp_title ?? title);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!activeCfps.length) {
    return (
      <span className="text-xs text-amber-700" title="No active CFPs to assign">
        No active CFPs
      </span>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={busy}>
          {busy ? 'Assigning…' : 'Assign CFP'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {activeCfps.map((c) => (
          <DropdownMenuItem
            key={c.id}
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              void assign(c.id, c.title);
            }}
          >
            {c.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
