/**
 * Server-side validation for fund application status changes (Epic 3+).
 */

export function validateApplicationStatusTransition(params: {
  fromStatus: string;
  toStatus: string;
  reason?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const from = params.fromStatus.trim().toLowerCase();
  const to = params.toStatus.trim().toLowerCase();

  if (from === to) return { ok: true };

  if (to === 'rejected') {
    if (!String(params.reason ?? '').trim()) {
      return { ok: false, error: 'reason is required when rejecting an application' };
    }
    return { ok: true };
  }

  if (to === 'negotiation' && from === 'site_visit') return { ok: true };

  if (to === 'committed' && (from === 'negotiation' || from === 'contract_review' || from === 'contract_signed')) {
    return { ok: true };
  }

  return {
    ok: false,
    error: `Status transition not allowed: ${from} → ${to}`,
  };
}
