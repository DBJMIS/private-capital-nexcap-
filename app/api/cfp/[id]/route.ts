import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { canMutateCfp, canViewCfpModule } from '@/lib/cfp/access';
import { loadCfpDetailPayload } from '@/lib/cfp/detail-data';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
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

  const { data, error } = await loadCfpDetailPayload(supabase, profile.tenant_id, cfpId);
  if (error === 'not_found') {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

type PatchBody = {
  title?: string;
  description?: string | null;
  opening_date?: string;
  closing_date?: string;
  status?: string;
  investment_criteria?: unknown;
  timeline_milestones?: unknown;
};

export async function PATCH(req: Request, ctx: RouteCtx) {
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

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('vc_cfps')
    .select('id, status, opening_date, closing_date')
    .eq('id', cfpId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (exErr || !existing) {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }

  const ex = existing as { status: string; opening_date: string; closing_date: string };
  const nextStatus = typeof body.status === 'string' ? body.status.trim().toLowerCase() : undefined;
  if (nextStatus === 'draft' && ex.status === 'active') {
    return NextResponse.json({ error: 'Cannot move an active CFP back to draft' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title.trim();
  if (body.description !== undefined) {
    patch.description =
      body.description === null || body.description === '' ? null : String(body.description).trim();
  }
  if (typeof body.opening_date === 'string') patch.opening_date = body.opening_date.trim();
  if (typeof body.closing_date === 'string') patch.closing_date = body.closing_date.trim();
  if (nextStatus) patch.status = nextStatus;
  if (body.investment_criteria !== undefined) patch.investment_criteria = body.investment_criteria;
  if (body.timeline_milestones !== undefined) patch.timeline_milestones = body.timeline_milestones;

  const opening = (patch.opening_date as string | undefined) ?? ex.opening_date;
  const closing = (patch.closing_date as string | undefined) ?? ex.closing_date;
  if (closing <= opening) {
    return NextResponse.json({ error: 'closing_date must be after opening_date' }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_cfps')
    .update(patch)
    .eq('id', cfpId)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .maybeSingle();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ cfp: updated });
}
