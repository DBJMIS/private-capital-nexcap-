/**
 * Client/server helpers for disbursement amounts (DB enforces via RPC + triggers).
 * File path: lib/investments/disbursement.ts
 */

export function remainingAmount(approved: number, disbursed: number): number {
  return Math.round((approved - disbursed) * 100) / 100;
}

export function canAddDisbursementAmount(
  approvedAmountUsd: number,
  currentDisbursedUsd: number,
  newTrancheAmount: number,
): { ok: true } | { ok: false; message: string } {
  if (newTrancheAmount <= 0 || !Number.isFinite(newTrancheAmount)) {
    return { ok: false, message: 'Amount must be positive' };
  }
  const next = currentDisbursedUsd + newTrancheAmount;
  if (next > approvedAmountUsd + 1e-9) {
    return {
      ok: false,
      message: 'Disbursement would exceed approved investment amount',
    };
  }
  return { ok: true };
}
