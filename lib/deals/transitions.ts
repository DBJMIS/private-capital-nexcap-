/**
 * Deal stage transition rules (application validation uses Supabase in validateDealStageTransition).
 * File path: lib/deals/transitions.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEAL_STAGES = [
  'sourced',
  'screening',
  'due_diligence',
  'investment_committee',
  'approved',
  'rejected',
  'funded',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

const TERMINAL: DealStage[] = ['rejected', 'funded'];

/** Directed edges: from → allowed targets */
const EDGES: Record<DealStage, DealStage[]> = {
  sourced: ['screening', 'rejected'],
  screening: ['sourced', 'due_diligence', 'rejected'],
  due_diligence: ['screening', 'investment_committee', 'rejected'],
  investment_committee: ['due_diligence', 'approved', 'rejected'],
  approved: ['investment_committee', 'funded', 'rejected'],
  funded: [],
  rejected: [],
};

export function isTerminalStage(stage: DealStage): boolean {
  return TERMINAL.includes(stage);
}

export function canTransitionDirect(from: DealStage, to: DealStage): boolean {
  return EDGES[from]?.includes(to) ?? false;
}

export async function hasCompletedPassingAssessment(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vc_assessments')
    .select('id, status, overall_score, passed')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  const score = data.overall_score != null ? Number(data.overall_score) : null;
  return data.passed === true && score != null && score >= 70;
}

export async function hasIcApprovalForDeal(
  supabase: SupabaseClient,
  tenantId: string,
  dealId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vc_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'deal')
    .eq('entity_id', dealId)
    .eq('approval_type', 'investment')
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  return !!data;
}

export async function hasActiveInvestmentForDeal(
  supabase: SupabaseClient,
  tenantId: string,
  dealId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vc_investments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('deal_id', dealId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  return !!data;
}

export type TransitionValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Business rules layered on top of the directed graph.
 */
export async function validateDealStageTransition(
  supabase: SupabaseClient,
  tenantId: string,
  deal: { id: string; stage: DealStage; application_id: string },
  toStage: DealStage,
): Promise<TransitionValidation> {
  const from = deal.stage;
  if (from === toStage) {
    return { ok: false, code: 'noop', message: 'Already in this stage' };
  }
  if (isTerminalStage(from)) {
    return { ok: false, code: 'terminal', message: 'Cannot move from a terminal stage' };
  }
  if (!canTransitionDirect(from, toStage)) {
    return { ok: false, code: 'invalid_edge', message: `Cannot move from ${from} to ${toStage}` };
  }

  if (toStage === 'investment_committee') {
    const ok = await hasCompletedPassingAssessment(supabase, tenantId, deal.application_id);
    if (!ok) {
      return {
        ok: false,
        code: 'assessment_required',
        message:
          'A completed assessment with score ≥ 70 and pass is required before Investment Committee stage',
      };
    }
  }

  if (toStage === 'approved') {
    const ic = await hasIcApprovalForDeal(supabase, tenantId, deal.id);
    if (!ic) {
      return {
        ok: false,
        code: 'ic_approval_required',
        message: 'Investment Committee approval record is required before marking the deal approved',
      };
    }
  }

  if (toStage === 'funded') {
    const inv = await hasActiveInvestmentForDeal(supabase, tenantId, deal.id);
    if (!inv) {
      return {
        ok: false,
        code: 'investment_required',
        message: 'An active investment must exist before marking the deal as funded',
      };
    }
  }

  return { ok: true };
}
