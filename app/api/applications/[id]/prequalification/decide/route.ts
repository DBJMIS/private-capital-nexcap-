import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { canDecidePrequal, type PrequalificationRow } from '@/lib/prequalification/types';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

type Body = { decision: 'prequalified' | 'not_prequalified' };

const EDITABLE_APP_STATUSES = new Set(['submitted', 'pre_screening']);

export async function POST(req: Request, ctx: RouteCtx) {
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.decision !== 'prequalified' && body.decision !== 'not_prequalified') {
    return NextResponse.json({ error: 'decision must be prequalified or not_prequalified' }, { status: 400 });
  }

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const appStatus = (app as { status: string }).status;
  if (!EDITABLE_APP_STATUSES.has(appStatus)) {
    return NextResponse.json({ error: 'Application is not in a stage that allows pre-qualification decisions' }, { status: 400 });
  }

  const { data: pq, error: pqErr } = await supabase
    .from('vc_prequalification')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (pqErr || !pq) {
    return NextResponse.json({ error: 'Pre-qualification record not found; save checklist first' }, { status: 400 });
  }

  const row = pq as PrequalificationRow;
  if (row.overall_status !== 'pending') {
    return NextResponse.json({ error: 'A decision has already been recorded' }, { status: 400 });
  }

  const gate = canDecidePrequal(row);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reasons[0] ?? 'Checklist incomplete', reasons: gate.reasons }, { status: 400 });
  }

  const reviewerName = profile.full_name?.trim() || profile.name?.trim() || profile.email || 'Officer';
  const now = new Date().toISOString();

  const nextOverall = body.decision === 'prequalified' ? 'prequalified' : 'not_prequalified';
  const nextAppStatus = body.decision === 'prequalified' ? 'pre_qualified' : 'rejected';

  const { data: updatedPq, error: upPqErr } = await supabase
    .from('vc_prequalification')
    .update({
      overall_status: nextOverall,
      prequalified: body.decision === 'prequalified',
      not_prequalified: body.decision === 'not_prequalified',
      reviewed_by: user.id,
      reviewer_name: reviewerName,
      reviewed_at: now,
    })
    .eq('id', row.id)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .single();

  if (upPqErr || !updatedPq) {
    return NextResponse.json({ error: upPqErr?.message ?? 'Failed to update pre-qualification' }, { status: 500 });
  }

  const { error: appUpErr } = await supabase
    .from('vc_fund_applications')
    .update({ status: nextAppStatus, updated_at: now })
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id);

  if (appUpErr) {
    return NextResponse.json({ error: appUpErr.message }, { status: 500 });
  }

  return NextResponse.json({
    prequalification: updatedPq as PrequalificationRow,
    application_status: nextAppStatus,
  });
}
