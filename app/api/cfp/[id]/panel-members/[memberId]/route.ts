import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { canMutateCfp } from '@/lib/cfp/access';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string; memberId: string }> };

type PatchBody = {
  member_name?: string;
  member_organisation?: string | null;
  member_email?: string | null;
  member_type?: 'voting' | 'observer';
  is_fund_manager?: boolean;
  excluded_application_ids?: string[] | null;
  nda_signed?: boolean;
  nda_signed_date?: string | null;
  investor_id?: string | null;
};

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id: cfpId, memberId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canMutateCfp(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('vc_panel_members')
    .select('id, cfp_id')
    .eq('id', memberId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (exErr || !existing || (existing as { cfp_id: string }).cfp_id !== cfpId) {
    return NextResponse.json({ error: 'Panel member not found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.member_name === 'string') patch.member_name = body.member_name.trim();
  if (body.member_organisation !== undefined) {
    patch.member_organisation =
      body.member_organisation === null || body.member_organisation === ''
        ? null
        : String(body.member_organisation).trim();
  }
  if (body.member_email !== undefined) {
    patch.member_email =
      body.member_email === null || body.member_email === '' ? null : String(body.member_email).trim();
  }
  if (body.member_type === 'voting' || body.member_type === 'observer') patch.member_type = body.member_type;
  if (body.is_fund_manager !== undefined) patch.is_fund_manager = !!body.is_fund_manager;
  if (body.excluded_application_ids !== undefined) {
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
    patch.excluded_application_ids = excluded;
  }
  if (body.nda_signed !== undefined) patch.nda_signed = !!body.nda_signed;
  if (body.nda_signed_date !== undefined) {
    patch.nda_signed_date =
      body.nda_signed_date === null || body.nda_signed_date === ''
        ? null
        : String(body.nda_signed_date).trim();
  }
  if (body.investor_id !== undefined) patch.investor_id = body.investor_id;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_panel_members')
    .update(patch)
    .eq('id', memberId)
    .eq('tenant_id', profile.tenant_id)
    .eq('cfp_id', cfpId)
    .select('*')
    .maybeSingle();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id: cfpId, memberId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canMutateCfp(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('vc_panel_members')
    .delete()
    .eq('id', memberId)
    .eq('cfp_id', cfpId)
    .eq('tenant_id', profile.tenant_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
