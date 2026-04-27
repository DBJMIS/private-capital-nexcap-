import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { canViewCfpModule } from '@/lib/cfp/access';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: cfpId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canViewCfpModule(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = profile.tenant_id;

  const { data: cfp } = await supabase.from('vc_cfps').select('id').eq('id', cfpId).eq('tenant_id', tenantId).maybeSingle();
  if (!cfp) return NextResponse.json({ error: 'CFP not found' }, { status: 404 });

  const { data: apps } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status')
    .eq('tenant_id', tenantId)
    .eq('cfp_id', cfpId)
    .is('deleted_at', null);

  const applications = (apps ?? []).map((a) => ({
    id: (a as { id: string }).id,
    fund_name: (a as { fund_name: string }).fund_name,
    status: (a as { status: string }).status,
  }));

  const appIds = applications.map((a) => a.id);

  const { data: members } = await supabase
    .from('vc_panel_members')
    .select('id, member_name, member_type, is_fund_manager')
    .eq('tenant_id', tenantId)
    .eq('cfp_id', cfpId)
    .eq('is_fund_manager', false)
    .order('created_at', { ascending: true });

  const panel_members = (members ?? []).map((m) => ({
    id: (m as { id: string }).id,
    member_name: (m as { member_name: string }).member_name,
    member_type: (m as { member_type: string }).member_type,
  }));

  let votes: Array<{ panel_member_id: string; application_id: string; dd_vote: string | null }> = [];
  if (appIds.length) {
    const { data: evals } = await supabase
      .from('vc_panel_evaluations')
      .select('panel_member_id, application_id, dd_vote, status')
      .eq('tenant_id', tenantId)
      .eq('cfp_id', cfpId)
      .in('application_id', appIds);

    votes = (evals ?? []).map((e) => {
      const row = e as { panel_member_id: string; application_id: string; dd_vote: string | null; status: string };
      const submitted = row.status === 'submitted';
      return {
        panel_member_id: row.panel_member_id,
        application_id: row.application_id,
        dd_vote: submitted ? row.dd_vote : null,
      };
    });
  }

  let dd_decisions: Array<{ application_id: string; final_decision: string | null }> = [];
  if (appIds.length) {
    const { data: decs } = await supabase
      .from('vc_dd_decisions')
      .select('application_id, final_decision, decided_at')
      .eq('tenant_id', tenantId)
      .in('application_id', appIds)
      .order('decided_at', { ascending: false, nullsFirst: false });

    const seen = new Set<string>();
    for (const d of decs ?? []) {
      const row = d as { application_id: string; final_decision: string | null };
      if (seen.has(row.application_id)) continue;
      seen.add(row.application_id);
      dd_decisions.push({
        application_id: row.application_id,
        final_decision: row.final_decision,
      });
    }
  }

  return NextResponse.json({
    applications,
    panel_members,
    votes,
    dd_decisions,
  });
}
