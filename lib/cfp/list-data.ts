import type { SupabaseClient } from '@supabase/supabase-js';

type CfpRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  opening_date: string;
  closing_date: string;
  status: string;
  investment_criteria: unknown;
  timeline_milestones: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CfpListItem = CfpRow & {
  application_count: number;
  panel_member_count: number;
};

export type CfpListPayload = {
  cfps: CfpListItem[];
  stats: {
    total: number;
    active: number;
    closed: number;
    applications_received: number;
  };
};

export async function loadCfpListPayload(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ payload: CfpListPayload; error: string | null }> {
  const { data: cfps, error } = await supabase
    .from('vc_cfps')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    return { payload: { cfps: [], stats: { total: 0, active: 0, closed: 0, applications_received: 0 } }, error: error.message };
  }

  const rows = (cfps ?? []) as CfpRow[];
  const ids = rows.map((r) => r.id);
  let appCounts: Record<string, number> = {};
  let panelCounts: Record<string, number> = {};

  if (ids.length) {
    const { data: appRows } = await supabase
      .from('vc_fund_applications')
      .select('cfp_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .in('cfp_id', ids);

    for (const r of appRows ?? []) {
      const id = (r as { cfp_id: string | null }).cfp_id;
      if (!id) continue;
      appCounts[id] = (appCounts[id] ?? 0) + 1;
    }

    const { data: panelRows } = await supabase
      .from('vc_panel_members')
      .select('cfp_id')
      .eq('tenant_id', tenantId)
      .in('cfp_id', ids);

    for (const r of panelRows ?? []) {
      const id = (r as { cfp_id: string }).cfp_id;
      panelCounts[id] = (panelCounts[id] ?? 0) + 1;
    }
  }

  const totalApplications = Object.values(appCounts).reduce((a, b) => a + b, 0);

  const payload: CfpListPayload = {
    cfps: rows.map((c) => ({
      ...c,
      application_count: appCounts[c.id] ?? 0,
      panel_member_count: panelCounts[c.id] ?? 0,
    })),
    stats: {
      total: rows.length,
      active: rows.filter((c) => c.status === 'active').length,
      closed: rows.filter((c) => c.status === 'closed').length,
      applications_received: totalApplications,
    },
  };

  return { payload, error: null };
}
