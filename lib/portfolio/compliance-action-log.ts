import type { SupabaseClient } from '@supabase/supabase-js';

export const COMPLIANCE_ACTION_TYPES = [
  'marked_received',
  'marked_accepted',
  'reminder_sent',
  'escalated',
  'document_uploaded',
  'status_changed',
  'note_added',
] as const;

export type ComplianceActionType = (typeof COMPLIANCE_ACTION_TYPES)[number];

export async function logComplianceAction(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    obligationId: string;
    fundId: string;
    actionType: ComplianceActionType;
    actorId: string | null;
    actorName: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    notes: string | null;
    recipient: string | null;
  },
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('vc_compliance_actions')
    .insert({
      tenant_id: params.tenantId,
      obligation_id: params.obligationId,
      fund_id: params.fundId,
      action_type: params.actionType,
      actor_id: params.actorId,
      actor_name: params.actorName,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      notes: params.notes,
      recipient: params.recipient,
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return { id: (data as { id: string }).id };
}
