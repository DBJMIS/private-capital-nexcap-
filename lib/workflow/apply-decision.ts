/**
 * Side effects after an approval row is marked approved/rejected (beyond audit log).
 * File path: lib/workflow/apply-decision.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ApprovalType } from '@/lib/workflow/types';
import { scheduleAuditLog } from '@/lib/audit/log';

export type DecisionContext = {
  supabase: SupabaseClient;
  tenantId: string;
  actorUserId: string;
  approval: {
    id: string;
    approval_type: ApprovalType;
    entity_type: string;
    entity_id: string;
  };
  decision: 'approved' | 'rejected';
};

export async function applyApprovalSideEffects(ctx: DecisionContext): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, tenantId, approval, decision, actorUserId } = ctx;

  if (approval.approval_type === 'pre_screening' && approval.entity_type === 'application') {
    const applicationId = approval.entity_id;
    if (decision === 'approved') {
      const { data: app } = await supabase
        .from('vc_fund_applications')
        .select('id, status')
        .eq('id', applicationId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!app || app.status !== 'pre_screening') {
        return { ok: false, error: 'Application is not awaiting pre-screening approval' };
      }

      const { data: existingDd } = await supabase
        .from('vc_dd_questionnaires')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('application_id', applicationId)
        .maybeSingle();

      if (!existingDd?.id) {
        const { data: ddNew, error: ddErr } = await supabase
          .from('vc_dd_questionnaires')
          .insert({
            tenant_id: tenantId,
            application_id: applicationId,
            status: 'draft',
          })
          .select('id')
          .single();
        if (ddErr || !ddNew) return { ok: false, error: ddErr?.message ?? 'Failed to create questionnaire' };
        scheduleAuditLog({
          tenantId,
          actorId: actorUserId,
          entityType: 'dd_questionnaire',
          entityId: ddNew.id,
          action: 'started',
          afterState: { status: 'draft', application_id: applicationId },
          metadata: { source: 'pre_screening_approval' },
        });
      }

      const { error: upApp } = await supabase
        .from('vc_fund_applications')
        .update({ status: 'due_diligence' })
        .eq('id', applicationId)
        .eq('tenant_id', tenantId);

      if (upApp) return { ok: false, error: upApp.message };

      scheduleAuditLog({
        tenantId,
        actorId: actorUserId,
        entityType: 'fund_application',
        entityId: applicationId,
        action: 'status_changed',
        beforeState: { status: app.status },
        afterState: { status: 'due_diligence' },
        metadata: { source: 'pre_screening_approval' },
      });
    } else {
      const { data: appReject } = await supabase
        .from('vc_fund_applications')
        .select('id, status')
        .eq('id', applicationId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const { error: upApp } = await supabase
        .from('vc_fund_applications')
        .update({ status: 'rejected' })
        .eq('id', applicationId)
        .eq('tenant_id', tenantId);

      if (upApp) return { ok: false, error: upApp.message };

      scheduleAuditLog({
        tenantId,
        actorId: actorUserId,
        entityType: 'fund_application',
        entityId: applicationId,
        action: 'status_changed',
        beforeState: { status: appReject?.status ?? 'unknown' },
        afterState: { status: 'rejected' },
        metadata: { source: 'pre_screening_approval' },
      });
    }
    return { ok: true };
  }

  if (approval.approval_type === 'disbursement' && approval.entity_type === 'disbursement') {
    const disbursementId = approval.entity_id;
    if (decision === 'approved') {
      const { error: rpcErr } = await supabase.rpc('vc_approve_disbursement', {
        p_tenant_id: tenantId,
        p_disbursement_id: disbursementId,
      });
      if (rpcErr) {
        const msg = rpcErr.message ?? 'Disbursement approval failed';
        if (msg.includes('disbursement_exceeds_approved')) {
          return { ok: false, error: 'Disbursement would exceed approved amount' };
        }
        return { ok: false, error: msg };
      }
      scheduleAuditLog({
        tenantId,
        actorId: actorUserId,
        entityType: 'disbursement',
        entityId: disbursementId,
        action: 'disbursed',
        beforeState: { status: 'pending' },
        afterState: { status: 'disbursed' },
      });
    } else {
      const { error: up } = await supabase
        .from('vc_disbursements')
        .update({ status: 'cancelled' })
        .eq('id', disbursementId)
        .eq('tenant_id', tenantId)
        .eq('status', 'pending');

      if (up) return { ok: false, error: up.message };
    }
    return { ok: true };
  }

  // due_diligence + investment: no extra side effects here (pipeline / deal transitions use the approval row)
  return { ok: true };
}
