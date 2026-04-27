import type { SupabaseClient } from '@supabase/supabase-js';

export type CfpApplicationListRow = {
  id: string;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  assessment_score: number | null;
  questionnaire_id: string | null;
};

export type CfpDetailPayload = {
  cfp: Record<string, unknown>;
  created_by_name: string;
  application_count: number;
  stats: {
    applications_received: number;
    pre_qualified: number;
    in_due_diligence: number;
    panel_members: number;
  };
  applications: CfpApplicationListRow[];
  panel_members: unknown[];
};

export async function loadCfpDetailPayload(
  supabase: SupabaseClient,
  tenantId: string,
  cfpId: string,
): Promise<{ data: CfpDetailPayload | null; error: string | null }> {
  const { data: cfp, error } = await supabase
    .from('vc_cfps')
    .select('*')
    .eq('id', cfpId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!cfp) {
    return { data: null, error: 'not_found' };
  }

  const { data: creator } = await supabase
    .from('vc_profiles')
    .select('full_name')
    .eq('tenant_id', tenantId)
    .eq('user_id', (cfp as { created_by: string }).created_by)
    .maybeSingle();

  const { data: applications } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, manager_name, status, submitted_at, cfp_id')
    .eq('tenant_id', tenantId)
    .eq('cfp_id', cfpId)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false, nullsFirst: false });

  const apps = (applications ?? []) as {
    id: string;
    fund_name: string;
    manager_name: string;
    status: string;
    submitted_at: string | null;
  }[];
  const appIds = apps.map((a) => a.id);

  const scoreByApp = new Map<string, number>();
  const qnByApp = new Map<string, string>();

  if (appIds.length) {
    const { data: assessRows } = await supabase
      .from('vc_assessments')
      .select('application_id, overall_weighted_score, overall_score')
      .eq('tenant_id', tenantId)
      .in('application_id', appIds);

    for (const row of assessRows ?? []) {
      const r = row as { application_id: string; overall_weighted_score: number | null; overall_score: number | null };
      const v = r.overall_weighted_score ?? r.overall_score;
      if (v == null || Number.isNaN(Number(v))) continue;
      const n = Number(v);
      const prev = scoreByApp.get(r.application_id);
      if (prev == null || n > prev) scoreByApp.set(r.application_id, n);
    }

    const { data: qRows } = await supabase
      .from('vc_dd_questionnaires')
      .select('id, application_id')
      .eq('tenant_id', tenantId)
      .in('application_id', appIds);

    for (const row of qRows ?? []) {
      const r = row as { id: string; application_id: string };
      if (!qnByApp.has(r.application_id)) qnByApp.set(r.application_id, r.id);
    }
  }

  const { data: panelMembers } = await supabase
    .from('vc_panel_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('cfp_id', cfpId)
    .order('created_at', { ascending: true });

  const application_count = apps.length;
  const pre_qualified = apps.filter((a) => a.status === 'pre_qualified').length;
  const in_due_diligence = apps.filter((a) => a.status === 'due_diligence').length;

  const payload: CfpDetailPayload = {
    cfp: cfp as Record<string, unknown>,
    created_by_name: (creator as { full_name: string } | null)?.full_name?.trim() || '—',
    application_count,
    stats: {
      applications_received: application_count,
      pre_qualified,
      in_due_diligence,
      panel_members: (panelMembers ?? []).length,
    },
    applications: apps.map((a) => ({
      ...a,
      assessment_score: scoreByApp.get(a.id) ?? null,
      questionnaire_id: qnByApp.get(a.id) ?? null,
    })),
    panel_members: panelMembers ?? [],
  };

  return { data: payload, error: null };
}
