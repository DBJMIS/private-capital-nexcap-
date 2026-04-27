'use client';

import { useCallback, useEffect, useState } from 'react';

import { AddDisbursementModal } from '@/components/investments/AddDisbursementModal';
import type { DisbursementRow } from '@/components/investments/DisbursementTable';
import { DisbursementTable } from '@/components/investments/DisbursementTable';
import type { InvestmentRow } from '@/components/investments/InvestmentSummary';
import { InvestmentSummary } from '@/components/investments/InvestmentSummary';
import { PortfolioMonitoringSection } from '@/components/investments/PortfolioMonitoringSection';
import { ApprovalDecisionModal } from '@/components/workflow/ApprovalDecisionModal';
import { ApprovalHistory } from '@/components/workflow/ApprovalHistory';
import { EntityActivitySection } from '@/components/audit/EntityActivitySection';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/button';
import { dsCard } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';
import { History, Wallet } from 'lucide-react';

export function InvestmentDetailClient({
  investmentId,
  canWriteDisbursements,
  canApproveDisbursement,
  canWriteInvestments,
}: {
  investmentId: string;
  canWriteDisbursements: boolean;
  canApproveDisbursement: boolean;
  canWriteInvestments: boolean;
}) {
  const [inv, setInv] = useState<InvestmentRow | null>(null);
  const [fundName, setFundName] = useState<string | undefined>();
  const [rows, setRows] = useState<DisbursementRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalModalId, setApprovalModalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const [ir, dr] = await Promise.all([
      fetch(`/api/investments/${investmentId}`),
      fetch(`/api/investments/${investmentId}/disbursements`),
    ]);
    const ij = (await ir.json()) as {
      investment?: InvestmentRow;
      application?: { fund_name: string };
      error?: string;
    };
    const dj = (await dr.json()) as { disbursements?: DisbursementRow[]; error?: string };
    if (!ir.ok) {
      setErr(ij.error ?? 'Failed to load investment');
      return;
    }
    setInv(ij.investment ?? null);
    setFundName(ij.application?.fund_name);
    if (!dr.ok) setErr(dj.error ?? 'Failed to load disbursements');
    else setRows(dj.disbursements ?? []);
  }, [investmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addPending = async (payload: {
    amount_usd: number;
    disbursement_date: string | null;
    reference_number: string | null;
    notes: string | null;
  }) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/investments/${investmentId}/disbursements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to add');
        return;
      }
      setModal(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (err && !inv) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{err}</div>;
  }
  if (!inv) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-8">
      {err && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">{err}</div>
      )}
      <InvestmentSummary investment={inv} fundName={fundName} />
      <PortfolioMonitoringSection
        investmentId={investmentId}
        status={inv.status}
        portfolioReviewerId={inv.portfolio_reviewer_id ?? null}
        canWriteInvestments={canWriteInvestments}
        onChanged={() => void load()}
      />
      <section className={cn(dsCard.padded, 'space-y-6')}>
        <SectionHeader
          icon={Wallet}
          iconVariant="gold"
          title="Disbursements"
          count={rows.length}
          right={
            canWriteDisbursements ? (
              <Button type="button" onClick={() => setModal(true)}>
                Add tranche
              </Button>
            ) : undefined
          }
        />
        <DisbursementTable
          rows={rows}
          canApprove={canApproveDisbursement}
          onApprove={(row) => {
            if (!row.approval_id) {
              setErr('No approval record for this tranche');
              return;
            }
            setApprovingId(row.id);
            setApprovalModalId(row.approval_id);
          }}
          approvingId={approvingId}
        />
        {rows.some((r) => r.approval_id) && (
          <div className="space-y-4 border-t border-gray-100 pt-6">
            <SectionHeader icon={History} iconVariant="navy" title="Tranche approval history" />
            {rows.map(
              (r) =>
                r.approval_id && (
                  <ApprovalHistory
                    key={r.id}
                    entityType="disbursement"
                    entityId={r.id}
                    title={`Tranche ${r.tranche_number}`}
                  />
                ),
            )}
          </div>
        )}
      </section>
      <ApprovalDecisionModal
        open={approvalModalId !== null}
        approvalId={approvalModalId}
        title="Disbursement approval"
        onClose={() => {
          setApprovalModalId(null);
          setApprovingId(null);
        }}
        onDecided={() => void load()}
      />
      <AddDisbursementModal
        open={modal}
        onClose={() => setModal(false)}
        busy={busy}
        onSubmit={async (p) => {
          if (!Number.isFinite(p.amount_usd) || p.amount_usd <= 0) {
            setErr('Enter a valid amount');
            return;
          }
          await addPending(p);
        }}
      />

      <EntityActivitySection entityType="investment" entityId={investmentId} />
    </div>
  );
}
