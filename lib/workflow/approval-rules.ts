/**
 * Server-side approval prerequisites (used by API routes).
 * File path: lib/workflow/approval-rules.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { hasIcApprovalForDeal } from '@/lib/deals/transitions';
import type { ApprovalType } from '@/lib/workflow/types';

export { hasIcApprovalForDeal };

export async function hasApprovedPreScreening(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vc_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'application')
    .eq('entity_id', applicationId)
    .eq('approval_type', 'pre_screening')
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  return !!data;
}

export async function hasApprovedDueDiligenceCompletion(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vc_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'application')
    .eq('entity_id', applicationId)
    .eq('approval_type', 'due_diligence')
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  return !!data;
}

export async function hasApprovedDisbursement(
  supabase: SupabaseClient,
  tenantId: string,
  disbursementId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vc_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'disbursement')
    .eq('entity_id', disbursementId)
    .eq('approval_type', 'disbursement')
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  return !!data;
}

export async function getPendingDisbursementApprovalId(
  supabase: SupabaseClient,
  tenantId: string,
  disbursementId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('vc_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'disbursement')
    .eq('entity_id', disbursementId)
    .eq('approval_type', 'disbursement')
    .eq('status', 'pending')
    .maybeSingle();

  return data?.id ?? null;
}

export function permissionForApprovalType(
  t: ApprovalType,
): 'approve:pre_screening' | 'approve:due_diligence' | 'approve:investment' | 'approve:disbursement' {
  const map: Record<
    ApprovalType,
    'approve:pre_screening' | 'approve:due_diligence' | 'approve:investment' | 'approve:disbursement'
  > = {
    pre_screening: 'approve:pre_screening',
    due_diligence: 'approve:due_diligence',
    investment: 'approve:investment',
    disbursement: 'approve:disbursement',
  };
  return map[t];
}

export function canUserActOnApproval(params: {
  approval: { assigned_to: string | null };
  userId: string;
}): boolean {
  if (params.approval.assigned_to == null) return true;
  return params.approval.assigned_to === params.userId;
}
