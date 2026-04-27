/**
 * Create a deal when an application is approved (assessment ≥ 70 + DD complete).
 * File path: lib/deals/from-application.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CreateDealResult =
  | { ok: true; deal_id: string; created: boolean }
  | { ok: false; error: string };

export async function validatePipelinePrerequisites(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<{ ok: true; assessment_id: string } | { ok: false; error: string }> {
  const { data: dd } = await supabase
    .from('vc_dd_questionnaires')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (!dd || dd.status !== 'completed') {
    return { ok: false, error: 'Due diligence questionnaire must be completed' };
  }

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, status, overall_score, passed')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assessment) {
    return { ok: false, error: 'A completed assessment is required' };
  }

  const score = assessment.overall_score != null ? Number(assessment.overall_score) : null;
  if (assessment.passed !== true || score == null || score < 70) {
    return { ok: false, error: 'Assessment must pass with overall score ≥ 70' };
  }

  return { ok: true, assessment_id: assessment.id };
}

export async function ensureDealForApprovedApplication(options: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  actorUserId: string;
  fundTitle: string;
}): Promise<CreateDealResult> {
  const { supabase, tenantId, applicationId, actorUserId, fundTitle } = options;

  const { data: existing } = await supabase
    .from('vc_deals')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, deal_id: existing.id, created: false };
  }

  const pre = await validatePipelinePrerequisites(supabase, tenantId, applicationId);
  if (!pre.ok) return pre;

  const { data: deal, error } = await supabase
    .from('vc_deals')
    .insert({
      tenant_id: tenantId,
      application_id: applicationId,
      title: fundTitle,
      stage: 'sourced',
      assessment_id: pre.assessment_id,
      created_by: actorUserId,
    })
    .select('id')
    .single();

  if (error || !deal) {
    return { ok: false, error: error?.message ?? 'Failed to create deal' };
  }

  return { ok: true, deal_id: deal.id, created: true };
}
