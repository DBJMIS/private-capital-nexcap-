/**
 * Shared approval decision path (API routes + disbursement legacy endpoint).
 * File path: lib/workflow/run-decision.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { sanitizeDbError } from '@/lib/http/errors';
import type { Profile } from '@/types/auth';
import { can } from '@/lib/auth/permissions';
import {
  canUserActOnApproval,
  permissionForApprovalType,
} from '@/lib/workflow/approval-rules';
import { applyApprovalSideEffects } from '@/lib/workflow/apply-decision';
import { notifyApprovalDecision } from '@/lib/workflow/notify-stub';
import type { ApprovalType } from '@/lib/workflow/types';
import { scheduleAuditLog } from '@/lib/audit/log';

export type DecideResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function runApprovalDecision(params: {
  supabase: SupabaseClient;
  tenantId: string;
  actorUserId: string;
  profile: Profile;
  approvalId: string;
  decision: 'approved' | 'rejected';
  decisionNotes: string;
}): Promise<DecideResult> {
  const { supabase, tenantId, actorUserId, profile, approvalId, decision, decisionNotes } = params;

  const notes = decisionNotes.trim();
  if (!notes) {
    return { ok: false, status: 400, error: 'decision_notes is required' };
  }

  const { data: row, error: fetchErr } = await supabase
    .from('vc_approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, status: 404, error: 'Approval not found' };
  }

  if (row.status !== 'pending') {
    return { ok: false, status: 400, error: 'Approval is not pending' };
  }

  const approvalType = row.approval_type as ApprovalType;
  const perm = permissionForApprovalType(approvalType);
  if (!can(profile, perm)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  if (!canUserActOnApproval({ approval: { assigned_to: row.assigned_to }, userId: actorUserId })) {
    return { ok: false, status: 403, error: 'This approval is assigned to another user' };
  }

  const now = new Date().toISOString();

  const { data: updated, error: upErr } = await supabase
    .from('vc_approvals')
    .update({
      status: decision,
      approved_by: actorUserId,
      decided_at: now,
      decision_notes: notes,
    })
    .eq('id', approvalId)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (upErr) {
    return { ok: false, status: 500, error: sanitizeDbError(upErr) };
  }
  if (!updated) {
    return { ok: false, status: 409, error: 'Approval was already decided or not found' };
  }

  const fx = await applyApprovalSideEffects({
    supabase,
    tenantId,
    actorUserId,
    approval: {
      id: row.id,
      approval_type: approvalType,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
    },
    decision,
  });

  if (!fx.ok) {
    await supabase
      .from('vc_approvals')
      .update({
        status: 'pending',
        approved_by: null,
        decided_at: null,
        decision_notes: null,
      })
      .eq('id', approvalId)
      .eq('tenant_id', tenantId);

    return { ok: false, status: 400, error: fx.error };
  }

  if (approvalType === 'disbursement' && decision === 'approved' && row.entity_type === 'disbursement') {
    scheduleAuditLog({
      tenantId,
      actorId: actorUserId,
      entityType: 'disbursement',
      entityId: row.entity_id,
      action: 'approved',
      afterState: { approval_id: approvalId },
    });
  }

  scheduleAuditLog({
    tenantId,
    actorId: actorUserId,
    entityType: 'approval',
    entityId: approvalId,
    action: decision === 'approved' ? 'approved' : 'rejected',
    beforeState: { status: row.status as string },
    afterState: {
      status: decision,
      approval_type: approvalType,
      target_entity_type: row.entity_type,
      target_entity_id: row.entity_id,
      decision_notes: notes,
    },
    metadata: { source: 'runApprovalDecision' },
  });

  await notifyApprovalDecision({
    tenantId,
    approvalId,
    decision,
  });

  return { ok: true };
}
