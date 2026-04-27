/**
 * Server helpers to load audit rows for API routes (RLS-enforced).
 * File path: lib/audit/fetch.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuditLogRow } from '@/lib/audit/format';

type RawLog = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_state: unknown;
  after_state: unknown;
  metadata: unknown;
  created_at: string;
  actor_id: string | null;
};

async function attachActorNames(
  supabase: SupabaseClient,
  tenantId: string,
  rows: RawLog[],
): Promise<AuditLogRow[]> {
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  let profileByUser = new Map<string, { full_name: string; email: string }>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from('vc_profiles')
      .select('user_id, full_name, email')
      .eq('tenant_id', tenantId)
      .in('user_id', actorIds);
    profileByUser = new Map(
      (profs ?? []).map((p) => [p.user_id, { full_name: p.full_name, email: p.email }]),
    );
  }
  return rows.map((r) => {
    const p = r.actor_id ? profileByUser.get(r.actor_id) : undefined;
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      before_state: r.before_state,
      after_state: r.after_state,
      metadata: r.metadata,
      created_at: r.created_at,
      actor_name: p?.full_name ?? null,
      actor_email: p?.email ?? null,
    };
  });
}

export async function fetchAuditLogsForDeal(
  supabase: SupabaseClient,
  tenantId: string,
  dealId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'deal')
    .eq('entity_id', dealId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return attachActorNames(supabase, tenantId, (data ?? []) as RawLog[]);
}

export async function fetchAuditLogsForInvestment(
  supabase: SupabaseClient,
  tenantId: string,
  investmentId: string,
): Promise<AuditLogRow[]> {
  const inv = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'investment')
    .eq('entity_id', investmentId)
    .order('created_at', { ascending: false })
    .limit(150);

  const disb = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'disbursement')
    .eq('metadata->>investment_id', investmentId)
    .order('created_at', { ascending: false })
    .limit(150);

  if (inv.error) throw new Error(inv.error.message);
  if (disb.error) throw new Error(disb.error.message);

  const merged = [...((inv.data ?? []) as RawLog[]), ...((disb.data ?? []) as RawLog[])];
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const seen = new Set<string>();
  const deduped = merged.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return attachActorNames(supabase, tenantId, deduped.slice(0, 200));
}

export async function fetchAuditLogsForAssessment(
  supabase: SupabaseClient,
  tenantId: string,
  assessmentId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'assessment')
    .eq('entity_id', assessmentId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return attachActorNames(supabase, tenantId, (data ?? []) as RawLog[]);
}

export async function fetchAuditLogsForDdQuestionnaire(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'dd_questionnaire')
    .eq('entity_id', questionnaireId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return attachActorNames(supabase, tenantId, (data ?? []) as RawLog[]);
}

export async function fetchAuditLogsForInvestor(
  supabase: SupabaseClient,
  tenantId: string,
  investorId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .in('entity_type', ['investor', 'vc_investor'])
    .eq('entity_id', investorId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return attachActorNames(supabase, tenantId, (data ?? []) as RawLog[]);
}

export async function fetchAuditLogsForFundApplication(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<AuditLogRow[]> {
  const { data: checklists } = await supabase
    .from('vc_pre_screening_checklists')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId);

  const { data: questionnaires } = await supabase
    .from('vc_dd_questionnaires')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId);

  const { data: assessments } = await supabase
    .from('vc_assessments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId);

  const checklistIds = (checklists ?? []).map((c) => c.id);
  const questionnaireIds = (questionnaires ?? []).map((q) => q.id);
  const assessmentIds = (assessments ?? []).map((a) => a.id);

  const chunks: Promise<{ data: RawLog[] | null; error: { message: string } | null }>[] = [];

  chunks.push(
    Promise.resolve(
      await supabase
        .from('vc_audit_logs')
        .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'fund_application')
        .eq('entity_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(150),
    ),
  );

  chunks.push(
    Promise.resolve(
      await supabase
        .from('vc_audit_logs')
        .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'vc_fund_application')
        .eq('entity_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(150),
    ),
  );

  if (checklistIds.length) {
    chunks.push(
      Promise.resolve(
        await supabase
          .from('vc_audit_logs')
          .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
          .eq('tenant_id', tenantId)
          .eq('entity_type', 'pre_screening')
          .in('entity_id', checklistIds)
          .order('created_at', { ascending: false })
          .limit(150),
      ),
    );
  }

  for (const qid of questionnaireIds) {
    chunks.push(
      Promise.resolve(
        await supabase
          .from('vc_audit_logs')
          .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
          .eq('tenant_id', tenantId)
          .eq('entity_type', 'dd_questionnaire')
          .eq('entity_id', qid)
          .order('created_at', { ascending: false })
          .limit(80),
      ),
    );
  }

  for (const aid of assessmentIds) {
    chunks.push(
      Promise.resolve(
        await supabase
          .from('vc_audit_logs')
          .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
          .eq('tenant_id', tenantId)
          .eq('entity_type', 'assessment')
          .eq('entity_id', aid)
          .order('created_at', { ascending: false })
          .limit(80),
      ),
    );
  }

  const { data: apprs } = await supabase
    .from('vc_approvals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'application')
    .eq('entity_id', applicationId);

  const approvalIds = (apprs ?? []).map((a) => a.id);
  if (approvalIds.length) {
    chunks.push(
      Promise.resolve(
        await supabase
          .from('vc_audit_logs')
          .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
          .eq('tenant_id', tenantId)
          .in('entity_type', ['approval', 'vc_approval'])
          .in('entity_id', approvalIds)
          .order('created_at', { ascending: false })
          .limit(120),
      ),
    );
  }

  const results = await Promise.all(chunks);
  const merged: RawLog[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    merged.push(...((r.data ?? []) as RawLog[]));
  }

  const seen = new Set<string>();
  const deduped = merged.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return attachActorNames(supabase, tenantId, deduped.slice(0, 250));
}

export async function fetchAuditLogsTenantAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  limit: number,
  offset: number,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('vc_audit_logs')
    .select('id, entity_type, entity_id, action, before_state, after_state, metadata, created_at, actor_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return attachActorNames(supabase, tenantId, (data ?? []) as RawLog[]);
}
