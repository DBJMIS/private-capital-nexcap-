'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { EntityActivitySection } from '@/components/audit/EntityActivitySection';
import { CapitalUtilizationBar } from '@/components/investors/CapitalUtilizationBar';
import { CommitmentTimeline, type CommitmentRow } from '@/components/investors/CommitmentTimeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { INVESTOR_TYPES, INVESTOR_TYPE_LABELS, type InvestorType } from '@/lib/investors/types';

type InvestorDetail = {
  id: string;
  name: string;
  investor_type: string;
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  committed_capital_usd: number;
  deployed_capital_usd: number;
  utilization_percent: number | null;
  flags: string[];
};

type PortfolioLine = {
  commitment_id: string;
  fund_name: string | null;
  committed_amount_usd: number;
  deployed_amount_usd: number;
  investment_disbursed_usd: number | null;
  investment_id: string | null;
};

export function InvestorDetailClient({ investorId, canWrite }: { investorId: string; canWrite: boolean }) {
  const [inv, setInv] = useState<InvestorDetail | null>(null);
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [portfolio, setPortfolio] = useState<{ lines: PortfolioLine[]; summary: { utilization_percent: number | null } } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cApp, setCApp] = useState('');
  const [cInv, setCInv] = useState('');
  const [cAmt, setCAmt] = useState('');
  const [cDep, setCDep] = useState('0');
  const [cDate, setCDate] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cConfirmed, setCConfirmed] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const [a, b, p] = await Promise.all([
      fetch(`/api/investors/${investorId}`),
      fetch(`/api/investors/${investorId}/commitments`),
      fetch(`/api/investors/${investorId}/portfolio`),
    ]);
    const aj = (await a.json()) as { investor?: InvestorDetail; error?: string };
    const bj = (await b.json()) as { commitments?: CommitmentRow[]; error?: string };
    const pj = (await p.json()) as {
      lines?: PortfolioLine[];
      summary?: { utilization_percent: number | null };
      error?: string;
    };
    if (!a.ok) {
      setErr(aj.error ?? 'Not found');
      setInv(null);
      return;
    }
    setInv(aj.investor ?? null);
    if (b.ok) setCommitments(bj.commitments ?? []);
    if (p.ok) setPortfolio({ lines: pj.lines ?? [], summary: { utilization_percent: pj.summary?.utilization_percent ?? null } });
  }, [investorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async (patch: Partial<Record<string, string | null>>) => {
    if (!canWrite) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/investors/${investorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) setErr(j.error ?? 'Save failed');
      else await load();
    } finally {
      setBusy(false);
    }
  };

  const addCommitment = async () => {
    if (!canWrite) return;
    const amt = Number(cAmt);
    const dep = Number(cDep || 0);
    if (!Number.isFinite(amt) || amt < 0) {
      setErr('Enter a valid committed amount');
      return;
    }
    const app = cApp.trim() || null;
    const inv = cInv.trim() || null;
    if (!app && !inv) {
      setErr('Provide application ID and/or investment ID');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/investors/${investorId}/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: app,
          investment_id: inv,
          committed_amount_usd: amt,
          deployed_amount_usd: dep,
          confirmed: cConfirmed,
          commitment_date: cDate.trim() || null,
          notes: cNotes.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to add commitment');
        return;
      }
      setCAmt('');
      setCDep('0');
      setCApp('');
      setCInv('');
      setCDate('');
      setCNotes('');
      setCConfirmed(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (err && !inv) {
    return <p className="text-sm text-red-700">{err}</p>;
  }
  if (!inv) return <p className="text-sm text-navy/60">Loading…</p>;

  return (
    <div className="space-y-8">
      {err && <p className="text-sm text-amber-800">{err}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/investors" className="text-sm font-medium text-teal hover:underline">
          ← Investors
        </Link>
      </div>

      <header className="rounded-xl border border-shell-border bg-shell-card p-6 shadow-shell">
        <h2 className="text-2xl font-semibold text-navy">{inv.name}</h2>
        <p className="mt-1 text-sm text-navy/60">{INVESTOR_TYPE_LABELS[inv.investor_type as InvestorType] ?? inv.investor_type}</p>
        {inv.flags.includes('under_deployed') && (
          <p className="mt-2 text-xs font-medium text-amber-900">Under-deployed: utilization is below 50%.</p>
        )}
        <div className="mt-6 max-w-md">
          <CapitalUtilizationBar committedUsd={inv.committed_capital_usd} deployedUsd={inv.deployed_capital_usd} />
        </div>
      </header>

      <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal">Profile</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="p_name">Name</Label>
            <Input id="p_name" defaultValue={inv.name} disabled={!canWrite || busy} key={inv.name} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p_type">Type</Label>
            <select
              id="p_type"
              className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 text-sm disabled:opacity-60"
              defaultValue={inv.investor_type}
              disabled={!canWrite || busy}
              key={inv.investor_type}
            >
              {INVESTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INVESTOR_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p_country">Country</Label>
            <Input id="p_country" defaultValue={inv.country ?? ''} disabled={!canWrite || busy} key={inv.country ?? ''} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p_contact">Contact name</Label>
            <Input id="p_contact" defaultValue={inv.contact_name ?? ''} disabled={!canWrite || busy} key={inv.contact_name ?? ''} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p_email">Contact email</Label>
            <Input id="p_email" defaultValue={inv.contact_email ?? ''} disabled={!canWrite || busy} key={inv.contact_email ?? ''} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p_phone">Contact phone</Label>
            <Input id="p_phone" defaultValue={inv.contact_phone ?? ''} disabled={!canWrite || busy} key={inv.contact_phone ?? ''} />
          </div>
        </div>
        {canWrite && (
          <Button
            type="button"
            className="mt-4 bg-navy text-navy-foreground"
            disabled={busy}
            onClick={() => {
              const nameEl = document.getElementById('p_name') as HTMLInputElement;
              const typeEl = document.getElementById('p_type') as HTMLSelectElement;
              const countryEl = document.getElementById('p_country') as HTMLInputElement;
              const cn = document.getElementById('p_contact') as HTMLInputElement;
              const em = document.getElementById('p_email') as HTMLInputElement;
              const ph = document.getElementById('p_phone') as HTMLInputElement;
              void saveProfile({
                name: nameEl.value,
                investor_type: typeEl.value as InvestorType,
                country: countryEl.value || null,
                contact_name: cn.value || null,
                contact_email: em.value || null,
                contact_phone: ph.value || null,
              });
            }}
          >
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        )}
      </section>

      {portfolio && portfolio.lines.length > 0 && (
        <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal">Linked investments & funds</h2>
          <p className="mt-1 text-xs text-navy/50">Commitment lines with fund context and live investment disbursements.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-shell-border text-xs uppercase text-navy/55">
                <tr>
                  <th className="py-2 pr-3">Fund / link</th>
                  <th className="py-2 pr-3">Committed</th>
                  <th className="py-2 pr-3">Deployed (line)</th>
                  <th className="py-2">Investment disbursed</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.lines.map((l) => (
                  <tr key={l.commitment_id} className="border-b border-shell-border/70">
                    <td className="py-2 pr-3">
                      {l.fund_name ?? '—'}
                      {l.investment_id && (
                        <Link href={`/investments/${l.investment_id}`} className="ml-2 text-xs text-teal hover:underline">
                          Open investment
                        </Link>
                      )}
                    </td>
                    <td className="tabular-nums py-2 pr-3">{fmt(l.committed_amount_usd)}</td>
                    <td className="tabular-nums py-2 pr-3">{fmt(l.deployed_amount_usd)}</td>
                    <td className="tabular-nums py-2">{l.investment_disbursed_usd != null ? fmt(l.investment_disbursed_usd) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal">Commitment history</h2>
        <div className="mt-4">
          <CommitmentTimeline rows={commitments} />
        </div>
      </section>

      {canWrite && (
        <section className="rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal">Add commitment</h2>
          <p className="mt-1 text-xs text-navy/55">Link to a fund application and/or an investment UUID from this tenant.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="c_app">Application ID</Label>
              <Input id="c_app" value={cApp} onChange={(e) => setCApp(e.target.value)} placeholder="Optional UUID" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_inv">Investment ID</Label>
              <Input id="c_inv" value={cInv} onChange={(e) => setCInv(e.target.value)} placeholder="Optional UUID" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_amt">Committed (USD)</Label>
              <Input id="c_amt" inputMode="decimal" value={cAmt} onChange={(e) => setCAmt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_dep">Deployed on line (USD)</Label>
              <Input id="c_dep" inputMode="decimal" value={cDep} onChange={(e) => setCDep(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c_date">Commitment date</Label>
              <Input id="c_date" type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="c_conf" type="checkbox" checked={cConfirmed} onChange={(e) => setCConfirmed(e.target.checked)} />
              <Label htmlFor="c_conf" className="text-sm font-normal">
                Confirmed
              </Label>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="c_notes">Notes</Label>
              <Input id="c_notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
            </div>
          </div>
          <Button type="button" className="mt-4 bg-navy text-navy-foreground" disabled={busy} onClick={() => void addCommitment()}>
            {busy ? 'Saving…' : 'Add commitment'}
          </Button>
        </section>
      )}

      <EntityActivitySection entityType="investor" entityId={investorId} />
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
