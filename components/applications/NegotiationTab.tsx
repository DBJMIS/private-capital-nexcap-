'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/format-date';
import type { VcCommitment, VcContract, VcFundApplication } from '@/types/database';

type Round = { round: number; date: string; notes: string; changed_by?: string | null };

function parseRounds(raw: unknown): Round[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      const round = typeof o.round === 'number' ? o.round : Number(o.round);
      const date = typeof o.date === 'string' ? o.date : '';
      const notes = typeof o.notes === 'string' ? o.notes : '';
      if (!Number.isFinite(round)) return null;
      return { round, date, notes, changed_by: typeof o.changed_by === 'string' ? o.changed_by : null };
    })
    .filter(Boolean) as Round[];
}

function contractStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === 'executed' || s === 'signed') return 'bg-teal-50 text-[#0F8A6E] border border-teal-200';
  if (s === 'legal_review' || s === 'pending_signature') return 'bg-amber-50 text-amber-800 border border-amber-200';
  return 'bg-white/10 text-white/90 border border-white/20';
}

export function NegotiationTab({
  applicationId,
  application,
  canWrite,
  initialContract,
  initialCommitment,
  initialPortfolioFundId,
  contractDownloadUrl,
}: {
  applicationId: string;
  application: Pick<VcFundApplication, 'status' | 'fund_name'>;
  canWrite: boolean;
  initialContract: VcContract | null;
  initialCommitment: VcCommitment | null;
  /** Epic 4 portfolio fund created with commitment; used for monitoring link. */
  initialPortfolioFundId?: string | null;
  contractDownloadUrl: string | null;
}) {
  const router = useRouter();
  const [contract, setContract] = useState<VcContract | null>(initialContract);
  const [commitment, setCommitment] = useState<VcCommitment | null>(initialCommitment);
  const [portfolioFundId, setPortfolioFundId] = useState<string | null>(initialPortfolioFundId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'JMD' | 'USD'>('JMD');
  const [dbjPct, setDbjPct] = useState('');
  const [mgmtPct, setMgmtPct] = useState('');
  const [carryPct, setCarryPct] = useState('');
  const [hurdlePct, setHurdlePct] = useState('');
  const [fundLife, setFundLife] = useState('');
  const [invPeriod, setInvPeriod] = useState('');
  const [legalNotes, setLegalNotes] = useState('');

  const [roundDraft, setRoundDraft] = useState({ round: 1, date: '', notes: '' });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const [signedAt, setSignedAt] = useState('');
  const [signedDbj, setSignedDbj] = useState('');
  const [signedFm, setSignedFm] = useState('');

  const [yearEndMonth, setYearEndMonth] = useState(9);
  const [listed, setListed] = useState(false);
  const [qDays, setQDays] = useState(45);
  const [aDays, setADays] = useState(90);
  const [fundRep, setFundRep] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setContract(initialContract);
    setCommitment(initialCommitment);
    setPortfolioFundId(initialPortfolioFundId ?? null);
    if (initialContract) {
      setAmount(initialContract.commitment_amount != null ? String(initialContract.commitment_amount) : '');
      setCurrency((initialContract.commitment_currency === 'USD' ? 'USD' : 'JMD') as 'JMD' | 'USD');
      setDbjPct(initialContract.dbj_pro_rata_pct != null ? String(initialContract.dbj_pro_rata_pct) : '');
      setMgmtPct(initialContract.management_fee_pct != null ? String(initialContract.management_fee_pct) : '');
      setCarryPct(initialContract.carried_interest_pct != null ? String(initialContract.carried_interest_pct) : '');
      setHurdlePct(initialContract.hurdle_rate_pct != null ? String(initialContract.hurdle_rate_pct) : '');
      setFundLife(initialContract.fund_life_years != null ? String(initialContract.fund_life_years) : '');
      setInvPeriod(initialContract.investment_period_years != null ? String(initialContract.investment_period_years) : '');
      setLegalNotes(initialContract.legal_reviewer_notes ?? '');
      if (initialContract.signed_at) {
        const d = new Date(initialContract.signed_at);
        if (!Number.isNaN(d.getTime())) setSignedAt(d.toISOString().slice(0, 16));
      }
      setSignedDbj(initialContract.signed_by_dbj ?? '');
      setSignedFm(initialContract.signed_by_fund_manager ?? '');
    }
  }, [initialContract, initialCommitment, initialPortfolioFundId]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const patchContract = async (patch: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/contract`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { contract?: VcContract; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      if (json.contract) setContract(json.contract);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const saveTerms = async () => {
    const amt = amount === '' ? null : Number(amount);
    if (amt != null && (Number.isNaN(amt) || amt <= 0)) {
      setError('Commitment amount must be a positive number');
      return;
    }
    await patchContract({
      commitment_amount: amt,
      commitment_currency: currency,
      dbj_pro_rata_pct: dbjPct === '' ? null : Number(dbjPct),
      management_fee_pct: mgmtPct === '' ? null : Number(mgmtPct),
      carried_interest_pct: carryPct === '' ? null : Number(carryPct),
      hurdle_rate_pct: hurdlePct === '' ? null : Number(hurdlePct),
      fund_life_years: fundLife === '' ? null : Math.floor(Number(fundLife)),
      investment_period_years: invPeriod === '' ? null : Math.floor(Number(invPeriod)),
      legal_reviewer_notes: legalNotes.trim() || null,
    });
  };

  const beginContract = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/contract`, { method: 'POST' });
      const json = (await res.json()) as { contract?: VcContract; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to create contract');
      if (json.contract) setContract(json.contract);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const addRound = async () => {
    if (!roundDraft.date.trim()) {
      setError('Round date is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/contract/negotiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round: roundDraft.round,
          date: roundDraft.date,
          notes: roundDraft.notes,
        }),
      });
      const json = (await res.json()) as { contract?: VcContract; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to add round');
      if (json.contract) setContract(json.contract);
      setRoundDraft((r) => ({ round: r.round + 1, date: '', notes: '' }));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const saveRounds = async (next: Round[]) => {
    await patchContract({ negotiation_rounds: next });
    setEditingIdx(null);
  };

  const onContractFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/api/applications/${applicationId}/contract/upload`, { method: 'POST', body: fd });
      const json = (await res.json()) as { file_path?: string; file_name?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      await patchContract({
        contract_file_path: json.file_path ?? null,
        contract_file_name: json.file_name ?? file.name,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const legalPhase: 'not_started' | 'in_progress' | 'completed' = (() => {
    if (!contract) return 'not_started';
    if (contract.legal_review_completed_at) return 'completed';
    if (contract.legal_review_started_at) return 'in_progress';
    return 'not_started';
  })();

  const startLegalReview = () =>
    patchContract({
      status: 'legal_review',
      legal_review_started_at: new Date().toISOString(),
    });

  const completeLegalReview = () =>
    patchContract({
      legal_review_completed_at: new Date().toISOString(),
      status: 'pending_signature',
    });

  const markSigned = () => {
    if (!signedAt) {
      setError('Signed date/time is required');
      return;
    }
    const iso = new Date(signedAt).toISOString();
    return patchContract({
      status: 'signed',
      signed_at: iso,
      signed_by_dbj: signedDbj.trim() || null,
      signed_by_fund_manager: signedFm.trim() || null,
    });
  };

  const executeContract = () => patchContract({ status: 'executed' });

  const issueCommitment = async () => {
    if (!yearEndMonth || yearEndMonth < 1 || yearEndMonth > 12) {
      setError('Select a valid fund year-end month');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/commitment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_end_month: yearEndMonth,
          listed,
          quarterly_days: qDays,
          audit_days: aDays,
          fund_representative: fundRep.trim() || null,
          currency: contract?.commitment_currency === 'USD' ? 'USD' : 'JMD',
        }),
      });
      const json = (await res.json()) as {
        commitment?: VcCommitment;
        portfolio_fund?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Failed to issue commitment');
      if (json.commitment) setCommitment(json.commitment);
      if (json.portfolio_fund?.id) setPortfolioFundId(json.portfolio_fund.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (commitment) {
    return (
      <div className="rounded-xl bg-[#0B1F45] p-6 text-center text-white">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[#C8973A]" aria-hidden />
        <h3 className="text-xl font-bold">Commitment Issued</h3>
        <p className="mt-1 text-sm text-white/60">This fund is now active and under monitoring</p>
        <p className="mt-3 text-lg font-semibold text-[#C8973A]">
          {commitment.fund_name} — {commitment.commitment_amount.toLocaleString()} {commitment.commitment_currency}
        </p>
        <p className="mt-2 text-xs text-white/40">{formatShortDate(commitment.committed_at)}</p>
        <Button asChild className="mt-6 rounded-xl bg-[#C8973A] px-5 py-2.5 text-white hover:bg-[#b5852f]">
          <Link href={portfolioFundId ? `/portfolio/funds/${portfolioFundId}` : '/portfolio/funds'}>
            View Fund Monitoring →
          </Link>
        </Button>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <FileSignature className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden />
        <h3 className="text-base font-semibold text-[#0B1F45]">Contract &amp; Negotiation</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Record investment terms and track the contract negotiation and signing process
        </p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {canWrite ? (
          <Button className="mt-6 bg-[#0B1F45] hover:bg-[#162d5e]" onClick={beginContract} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Begin Contract Negotiation
          </Button>
        ) : null}
      </div>
    );
  }

  const cs = (contract.status ?? '').toLowerCase();
  const rounds = parseRounds(contract.negotiation_rounds);

  const showCommitmentBlock = cs === 'signed' || cs === 'executed';

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#0B1F45] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <FileSignature className="mt-0.5 h-6 w-6 text-white/80" aria-hidden />
            <div>
              <h3 className="font-semibold text-white">Investment Agreement</h3>
              <p className="mt-0.5 text-sm text-white/60">{application.fund_name}</p>
            </div>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold capitalize', contractStatusBadgeClass(contract.status))}>
            {String(contract.status).replaceAll('_', ' ')}
          </span>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Investment terms</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Commitment amount *</span>
            <Input className="mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Currency</span>
            <div className="mt-2 flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" checked={currency === 'JMD'} onChange={() => setCurrency('JMD')} />
                JMD
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" checked={currency === 'USD'} onChange={() => setCurrency('USD')} />
                USD
              </label>
            </div>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">DBJ pro-rata %</span>
            <Input className="mt-1" inputMode="decimal" value={dbjPct} onChange={(e) => setDbjPct(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Management fee %</span>
            <Input className="mt-1" inputMode="decimal" value={mgmtPct} onChange={(e) => setMgmtPct(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Carried interest %</span>
            <Input className="mt-1" inputMode="decimal" value={carryPct} onChange={(e) => setCarryPct(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Hurdle rate %</span>
            <Input className="mt-1" inputMode="decimal" value={hurdlePct} onChange={(e) => setHurdlePct(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Fund life (years)</span>
            <Input className="mt-1" inputMode="numeric" value={fundLife} onChange={(e) => setFundLife(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#0B1F45]">Investment period (years)</span>
            <Input className="mt-1" inputMode="numeric" value={invPeriod} onChange={(e) => setInvPeriod(e.target.value)} />
          </label>
        </div>
        {canWrite ? (
          <Button className="mt-4 bg-[#0F8A6E] hover:bg-[#0c6e57]" onClick={() => void saveTerms()} disabled={loading}>
            Save investment terms
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Negotiation rounds</p>
        <p className="mt-1 text-sm text-gray-500">Track rounds of negotiation</p>
        <ul className="mt-4 space-y-3">
          {rounds.map((r, idx) => (
            <li key={`${r.round}-${idx}`} className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3 text-sm last:border-b-0">
              {editingIdx === idx ? (
                <RoundEditor
                  initial={r}
                  onSave={(next) => void saveRounds(rounds.map((x, i) => (i === idx ? next : x)))}
                  onCancel={() => setEditingIdx(null)}
                />
              ) : (
                <>
                  <span className="text-gray-800">
                    Round {r.round} — {r.date} — {r.notes}
                  </span>
                  {canWrite ? (
                    <button type="button" className="text-[#0F8A6E] text-xs font-medium hover:underline" onClick={() => setEditingIdx(idx)}>
                      Edit
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
          <Input
            type="number"
            min={1}
            placeholder="Round #"
            value={roundDraft.round || ''}
            onChange={(e) => setRoundDraft((x) => ({ ...x, round: Math.max(1, Math.floor(Number(e.target.value)) || 1) }))}
          />
          <Input type="date" value={roundDraft.date} onChange={(e) => setRoundDraft((x) => ({ ...x, date: e.target.value }))} />
          <Input placeholder="Notes" value={roundDraft.notes} onChange={(e) => setRoundDraft((x) => ({ ...x, notes: e.target.value }))} />
        </div>
        {canWrite ? (
          <Button variant="secondary" className="mt-3" onClick={addRound} disabled={loading}>
            + Add negotiation round
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Legal review</p>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" readOnly checked={legalPhase === 'not_started'} />
            Not started
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" readOnly checked={legalPhase === 'in_progress'} />
            In progress
            {contract.legal_review_started_at ? ` (started ${formatShortDate(contract.legal_review_started_at)})` : ''}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" readOnly checked={legalPhase === 'completed'} />
            Completed
          </label>
        </div>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-[#0B1F45]">Legal reviewer notes</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            value={legalNotes}
            onChange={(e) => setLegalNotes(e.target.value)}
          />
        </label>
        {canWrite && legalPhase === 'in_progress' ? (
          <Button className="mt-3 bg-[#0F8A6E] hover:bg-[#0c6e57]" onClick={() => void completeLegalReview()} disabled={loading}>
            Mark legal review complete
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contract document</p>
        <p className="mt-1 text-sm text-gray-500">Upload signed contract (PDF only, max 50MB)</p>
        <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 hover:bg-gray-100">
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onContractFile(e.target.files?.[0] ?? null)} />
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-[#0F8A6E]" /> : 'Choose PDF'}
        </label>
        {contract.contract_file_name ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <span>{contract.contract_file_name}</span>
            {contractDownloadUrl ? (
              <a href={contractDownloadUrl} className="text-[#0F8A6E] underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                Download
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-[#0B1F45]">Or use Adobe Sign</p>
          <Button variant="outline" className="mt-2" type="button" disabled>
            Send for Signature via Adobe Sign
          </Button>
          <p className="mt-1 text-xs text-gray-400">TODO: wire Adobe Sign API</p>
        </div>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          {cs === 'drafting' ? (
            <Button className="bg-[#0B1F45]" onClick={() => void patchContract({ status: 'under_negotiation' })} disabled={loading}>
              Mark as under negotiation
            </Button>
          ) : null}
          {cs === 'under_negotiation' ? (
            <Button className="bg-[#0B1F45]" onClick={() => void startLegalReview()} disabled={loading}>
              Send to legal review
            </Button>
          ) : null}
          {cs === 'legal_review' && legalPhase !== 'completed' ? (
            <Button className="bg-[#0F8A6E]" onClick={() => void completeLegalReview()} disabled={loading}>
              Mark legal review complete
            </Button>
          ) : null}
          {cs === 'pending_signature' ? (
            <div className="flex w-full flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-end">
              <label className="block flex-1 text-sm">
                <span className="font-medium">Signed at *</span>
                <Input type="datetime-local" className="mt-1" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
              </label>
              <label className="block flex-1 text-sm">
                <span className="font-medium">Signed by DBJ</span>
                <Input className="mt-1" value={signedDbj} onChange={(e) => setSignedDbj(e.target.value)} />
              </label>
              <label className="block flex-1 text-sm">
                <span className="font-medium">Signed by fund manager</span>
                <Input className="mt-1" value={signedFm} onChange={(e) => setSignedFm(e.target.value)} />
              </label>
              <Button className="bg-[#0F8A6E]" onClick={() => void markSigned()} disabled={loading}>
                Mark as signed
              </Button>
            </div>
          ) : null}
          {cs === 'signed' ? (
            <Button className="bg-[#0B1F45]" onClick={() => void executeContract()} disabled={loading}>
              Execute contract
            </Button>
          ) : null}
        </div>
      ) : null}

      {showCommitmentBlock ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#0F8A6E]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-teal-800">Contract executed — issue commitment letter</p>
              <p className="mt-1 text-xs text-teal-700">
                Issuing the commitment letter activates this fund for monitoring. Reporting schedules and capital call tracking will align to
                the dates you capture below.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-teal-100 bg-white p-4">
            <label className="block text-sm">
              <span className="font-medium text-[#0B1F45]">Fund year end month *</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={yearEndMonth}
                onChange={(e) => setYearEndMonth(Number(e.target.value))}
              >
                {[
                  'Jan',
                  'Feb',
                  'Mar',
                  'Apr',
                  'May',
                  'Jun',
                  'Jul',
                  'Aug',
                  'Sep',
                  'Oct',
                  'Nov',
                  'Dec',
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="mt-4 text-sm">
              <legend className="font-medium text-[#0B1F45]">Listed on stock exchange?</legend>
              <div className="mt-2 flex gap-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={listed} onChange={() => setListed(true)} />
                  Yes (listed)
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={!listed} onChange={() => setListed(false)} />
                  No (unlisted)
                </label>
              </div>
            </fieldset>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-[#0B1F45]">Quarterly report due (days after quarter end)</span>
              <Input className="mt-1" type="number" min={1} max={120} value={qDays} onChange={(e) => setQDays(Number(e.target.value))} />
            </label>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-[#0B1F45]">Audit report due (days after year end)</span>
              <Input className="mt-1" type="number" min={1} max={365} value={aDays} onChange={(e) => setADays(Number(e.target.value))} />
            </label>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-[#0B1F45]">Fund representative name</span>
              <Input className="mt-1" value={fundRep} onChange={(e) => setFundRep(e.target.value)} />
            </label>
          </div>
          {cs === 'executed' && canWrite ? (
            <Button className="mt-5 rounded-xl bg-[#0B1F45] px-6 py-3 text-sm font-semibold text-white hover:bg-[#162d5e]" onClick={issueCommitment} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Issue commitment letter
            </Button>
          ) : cs === 'signed' ? (
            <p className="mt-3 text-xs text-teal-800">Execute the contract above before issuing the commitment letter.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RoundEditor({ initial, onSave, onCancel }: { initial: Round; onSave: (r: Round) => void; onCancel: () => void }) {
  const [round, setRound] = useState(initial.round);
  const [date, setDate] = useState(initial.date);
  const [notes, setNotes] = useState(initial.notes);
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <Input type="number" className="w-24" value={round} onChange={(e) => setRound(Math.max(1, Math.floor(Number(e.target.value)) || 1))} />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Input className="flex-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="bg-[#0F8A6E]" type="button" onClick={() => onSave({ ...initial, round, date, notes })}>
          Save
        </Button>
      </div>
    </div>
  );
}
