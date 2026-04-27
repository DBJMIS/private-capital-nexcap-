import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

type PatchBody = {
  cfp_id: string;
};

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.cfp_id || typeof body.cfp_id !== 'string') {
    return NextResponse.json({ error: 'cfp_id is required' }, { status: 400 });
  }

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  const { data: cfp, error: cfpErr } = await supabase
    .from('vc_cfps')
    .select('id, title, status')
    .eq('id', body.cfp_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (cfpErr || !cfp) {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }

  if (String((cfp as { status: string }).status).toLowerCase() !== 'active') {
    return NextResponse.json({ error: 'Only active CFPs can be linked to an application' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_fund_applications')
    .update({ cfp_id: body.cfp_id })
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .select('id, cfp_id')
    .maybeSingle();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({
    id: (updated as { id: string }).id,
    cfp_id: (updated as { cfp_id: string | null }).cfp_id,
    cfp_title: (cfp as { title: string }).title,
  });
}
