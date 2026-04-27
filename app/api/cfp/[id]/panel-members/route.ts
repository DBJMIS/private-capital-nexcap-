import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { canMutateCfp } from '@/lib/cfp/access';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function assertCfp(supabase: ReturnType<typeof createServerClient>, tenantId: string, cfpId: string) {
  const { data } = await supabase.from('vc_cfps').select('id').eq('id', cfpId).eq('tenant_id', tenantId).maybeSingle();
  return !!data;
}

type PostBody = {
  member_name: string;
  member_organisation?: string | null;
  member_email?: string | null;
  member_type?: 'voting' | 'observer';
  is_fund_manager?: boolean;
  excluded_application_ids?: string[] | null;
  nda_signed?: boolean;
  nda_signed_date?: string | null;
  investor_id?: string | null;
};

export async function POST(req: Request, ctx: RouteCtx) {
  const { id: cfpId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canMutateCfp(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await assertCfp(supabase, profile.tenant_id, cfpId))) {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const member_name = typeof body.member_name === 'string' ? body.member_name.trim() : '';
  if (!member_name) {
    return NextResponse.json({ error: 'member_name is required' }, { status: 400 });
  }

  const member_type = body.member_type === 'observer' ? 'observer' : 'voting';
  const is_fund_manager = !!body.is_fund_manager;
  const excluded = Array.isArray(body.excluded_application_ids) ? body.excluded_application_ids : [];

  if (excluded.length) {
    const { data: apps } = await supabase
      .from('vc_fund_applications')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('cfp_id', cfpId)
      .in('id', excluded);
    if ((apps?.length ?? 0) !== excluded.length) {
      return NextResponse.json({ error: 'One or more excluded application ids are invalid for this CFP' }, { status: 400 });
    }
  }

  const nda_signed = !!body.nda_signed;
  const nda_signed_date =
    nda_signed && typeof body.nda_signed_date === 'string' && body.nda_signed_date.trim()
      ? body.nda_signed_date.trim()
      : null;

  const { data, error } = await supabase
    .from('vc_panel_members')
    .insert({
      tenant_id: profile.tenant_id,
      cfp_id: cfpId,
      investor_id: body.investor_id ?? null,
      member_name,
      member_organisation:
        typeof body.member_organisation === 'string' && body.member_organisation.trim()
          ? body.member_organisation.trim()
          : null,
      member_email:
        typeof body.member_email === 'string' && body.member_email.trim() ? body.member_email.trim() : null,
      member_type,
      nda_signed,
      nda_signed_date,
      is_fund_manager,
      excluded_application_ids: excluded,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to add panel member' }, { status: 500 });
  }

  return NextResponse.json(data);
}
