'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { dsCard, dsField } from '@/components/ui/design-system';
import { ApprovalHistory } from '@/components/workflow/ApprovalHistory';
import { EntityActivitySection } from '@/components/audit/EntityActivitySection';
import { DEAL_STAGES, type DealStage } from '@/lib/deals/transitions';
import { INSTRUMENT_TYPES } from '@/lib/investments/types';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { Briefcase, FileText, HandCoins, MessageSquare, TrendingUp, User } from 'lucide-react';

type DetailPayload = {
  deal: Record<string, unknown>;
  application: Record<string, unknown> | null;
  assessment: Record<string, unknown> | null;
  notes: Array<{ id: string; body: string; author_name: string; created_at: string }>;
  investments: Array<Record<string, unknown>>;
  ic_approvals: Array<Record<string, unknown>>;
};

export function DealDetail({
  dealId,
  canWriteDeals,
  canApproveInvestment,
}: {
  dealId: string;
  canWriteDeals: boolean;
  canApproveInvestment: boolean;
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [officer, setOfficer] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [toStage, setToStage] = useState<DealStage | ''>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [invAmt, setInvAmt] = useState('');
  const [invInst, setInvInst] = useState<string>('equity');
  const [icNotes, setIcNotes] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/deals/${dealId}`);
    const j = (await res.json()) as DetailPayload & { error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load');
      setData(null);
      return;
    }
    setData(j);
    setOfficer((j.deal.assigned_officer as string) ?? '');
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveOfficer = async () => {
    if (!canWriteDeals) return;
    setBusy('officer');
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_officer: officer || null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) setErr(j.error ?? 'Save failed');
      else await load();
    } finally {
      setBusy(null);
    }
  };

  const addNote = async () => {
    if (!noteBody.trim() || !canWriteDeals) return;
    setBusy('note');
    try {
      const res = await fetch(`/api/deals/${dealId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) setErr(j.error ?? 'Note failed');
      else {
        setNoteBody('');
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const recordIc = async () => {
    if (!canApproveInvestment) return;
    if (!icNotes.trim()) {
      setErr('Decision notes are required for IC approval');
      return;
    }
    setBusy('ic');
    try {
      const res = await fetch(`/api/deals/${dealId}/ic-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision_notes: icNotes.trim() }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) setErr(j.error ?? 'IC record failed');
      else {
        setIcNotes('');
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const transition = async () => {
    if (!toStage || !canWriteDeals) return;
    setBusy('stage');
    try {
      const body: Record<string, unknown> = { to_stage: toStage };
      if (toStage === 'approved' && invAmt) {
        body.investment = {
          approved_amount_usd: Number(invAmt),
          instrument_type: invInst,
        };
      }
      const res = await fetch(`/api/deals/${dealId}/stage-transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) setErr(j.error ?? 'Transition failed');
      else {
        setToStage('');
        setInvAmt('');
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const createInvestment = async () => {
    if (!invAmt || !canWriteDeals) return;
    setBusy('inv');
    try {
      const res = await fetch(`/api/deals/${dealId}/investments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved_amount_usd: Number(invAmt),
          instrument_type: invInst,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) setErr(j.error ?? 'Could not create investment');
      else {
        setInvAmt('');
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  if (err && !data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{err}</div>;
  }
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  const deal = data.deal as {
    id: string;
    title: string;
    stage: string;
    assessment_id: string | null;
    application_id: string;
    notes: string | null;
  };
  const app = data.application as { fund_name: string; manager_name: string; status: string } | null;
  const asst = data.assessment as { id: string; overall_score: number | null; passed: boolean | null } | null;
  const activeInv = (data.investments as Array<{ id: string; status: string }>).find((i) => i.status === 'active');

  return (
    <div className="space-y-8">
      {err && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">{err}</div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-[#0B1F45]">{app?.fund_name ?? deal.title}</h2>
          <div className="mt-1 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500">Stage</span>
              <StatusBadge status={deal.stage} />
            </span>
            {app && (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-gray-500">Application</span>
                <StatusBadge status={app.status} />
                <span className="text-gray-600">· {app.manager_name}</span>
              </span>
            )}
            {asst && (
              <Link href={`/fund-applications/${deal.application_id}`} className="font-medium text-[#C8973A] hover:underline">
                Application pipeline
                {asst.overall_score != null && ` (score ${asst.overall_score})`}
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className={dsCard.padded}>
        <SectionHeader icon={User} iconVariant="gold" title="Deal officer" />
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="off">Assigned officer</Label>
            <Input
              id="off"
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
              disabled={!canWriteDeals}
              className="mt-1"
            />
          </div>
          <Button
            type="button"
            className="bg-navy text-navy-foreground"
            disabled={!canWriteDeals || busy === 'officer'}
            onClick={() => void saveOfficer()}
          >
            Save
          </Button>
        </div>
        {deal.notes && (
          <p className="mt-4 text-sm text-gray-600">
            <span className="font-medium text-gray-900">Legacy notes: </span>
            {deal.notes}
          </p>
        )}
      </section>

      <section className={dsCard.padded}>
        <SectionHeader
          icon={FileText}
          iconVariant="navy"
          title="Workflow approvals"
          description="Pre-screening, DD completion, IC, and related records."
        />
        <div className="mt-4 space-y-6">
          <ApprovalHistory
            entityType="application"
            entityId={deal.application_id}
            title="Application approvals"
          />
          <ApprovalHistory entityType="deal" entityId={dealId} title="Deal approvals (IC)" />
        </div>
      </section>

      {canApproveInvestment && (
        <section className={dsCard.padded}>
          <SectionHeader
            icon={HandCoins}
            iconVariant="gold"
            title="Investment committee approval"
            description="Required before moving the deal to Approved. Creates/updates an approval record."
          />
          <Textarea
            value={icNotes}
            onChange={(e) => setIcNotes(e.target.value)}
            placeholder="Decision notes (required)"
            rows={2}
            className="mt-2"
          />
          <Button type="button" variant="outline" className="mt-2" disabled={busy === 'ic'} onClick={() => void recordIc()}>
            {busy === 'ic' ? 'Saving…' : 'Record IC approval'}
          </Button>
          {data.ic_approvals.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-xs text-gray-500">
              {data.ic_approvals.map((a) => (
                <li key={a.id as string}>
                  {(a.status as string) ?? ''} · {(a.decided_at as string) ?? ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={dsCard.padded}>
        <SectionHeader icon={TrendingUp} iconVariant="teal" title="Move stage" />
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label>Target stage</Label>
            <select
              className={cn(
                dsField.input,
                'mt-1 flex h-10 w-full px-3',
                !canWriteDeals && 'opacity-60',
              )}
              value={toStage}
              onChange={(e) => setToStage(e.target.value as DealStage)}
              disabled={!canWriteDeals}
            >
              <option value="">Select…</option>
              {DEAL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {toStage === 'approved' && (
            <>
              <div>
                <Label>Approved amount (USD)</Label>
                <Input
                  type="number"
                  className="mt-1 w-40"
                  value={invAmt}
                  onChange={(e) => setInvAmt(e.target.value)}
                  placeholder="Optional if adding investment in same step"
                />
              </div>
              <div>
                <Label>Instrument</Label>
                <select
                  className={cn(dsField.input, 'mt-1 flex h-10 px-2')}
                  value={invInst}
                  onChange={(e) => setInvInst(e.target.value)}
                >
                  {INSTRUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <Button
            type="button"
            className="bg-navy text-navy-foreground"
            disabled={!canWriteDeals || !toStage || busy === 'stage'}
            onClick={() => void transition()}
          >
            {busy === 'stage' ? 'Applying…' : 'Apply transition'}
          </Button>
        </div>
      </section>

      {canWriteDeals && !activeInv && ['investment_committee', 'approved'].includes(deal.stage) && (
        <section className={dsCard.padded}>
          <SectionHeader icon={Briefcase} iconVariant="navy" title="Create investment" />
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input
              type="number"
              placeholder="Approved amount USD"
              value={invAmt}
              onChange={(e) => setInvAmt(e.target.value)}
              className="max-w-xs"
            />
            <select
              className={cn(dsField.input, 'flex h-10 px-2')}
              value={invInst}
              onChange={(e) => setInvInst(e.target.value)}
            >
              {INSTRUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" disabled={busy === 'inv'} onClick={() => void createInvestment()}>
              {busy === 'inv' ? 'Creating…' : 'Create active investment'}
            </Button>
          </div>
        </section>
      )}

      {activeInv && (
        <div>
          <Link
            href={`/investments/${activeInv.id}`}
            className="inline-flex text-sm font-medium text-gold hover:underline"
          >
            Open active investment →
          </Link>
        </div>
      )}

      <section className={dsCard.padded}>
        <SectionHeader icon={MessageSquare} iconVariant="amber" title="Internal notes" />
        <div className="mt-3 space-y-3">
          {data.notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="text-gray-900">{n.body}</p>
              <p className="mt-2 text-xs text-gray-500">
                {n.author_name} · {formatDateTime(n.created_at)}
              </p>
            </div>
          ))}
          {canWriteDeals && (
            <>
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} placeholder="Add a note…" />
              <Button type="button" disabled={busy === 'note'} onClick={() => void addNote()}>
                {busy === 'note' ? 'Adding…' : 'Add note'}
              </Button>
            </>
          )}
        </div>
      </section>

      <EntityActivitySection entityType="deal" entityId={dealId} />
    </div>
  );
}
