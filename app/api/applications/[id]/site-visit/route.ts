import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog, clientIpFromRequest } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();

  const { data: visit, error } = await supabase
    .from('vc_site_visits')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ site_visit: visit });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: {
    scheduled_date?: string | null;
    location?: string | null;
    dbj_attendees?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from('vc_site_visits')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Site visit already exists' }, { status: 409 });

  const { data: visit, error } = await supabase
    .from('vc_site_visits')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: applicationId,
      scheduled_date: body.scheduled_date ?? null,
      location: body.location ?? null,
      dbj_attendees: Array.isArray(body.dbj_attendees) ? body.dbj_attendees : [],
      status: 'scheduled',
      created_by: profile.profile_id,
    })
    .select('*')
    .single();

  if (error || !visit) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'site_visit_scheduled',
    afterState: { site_visit_id: visit.id },
    ipAddress: clientIpFromRequest(req),
  });

  return NextResponse.json({ site_visit: visit });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: visit, error: vErr } = await supabase
    .from('vc_site_visits')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (vErr || !visit) return NextResponse.json({ error: 'Site visit not found' }, { status: 404 });

  const row = visit as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.scheduled_date !== undefined) patch.scheduled_date = body.scheduled_date;
  if (body.actual_date !== undefined) patch.actual_date = body.actual_date;
  if (body.location !== undefined) patch.location = body.location;
  if (body.dbj_attendees !== undefined) patch.dbj_attendees = body.dbj_attendees;
  if (body.status !== undefined) patch.status = body.status;
  if (body.outcome !== undefined) patch.outcome = body.outcome;
  if (body.outcome_notes !== undefined) patch.outcome_notes = body.outcome_notes;
  if (body.legal_docs_reviewed !== undefined) patch.legal_docs_reviewed = body.legal_docs_reviewed;
  if (body.legal_docs_notes !== undefined) patch.legal_docs_notes = body.legal_docs_notes;
  if (body.report_file_path !== undefined) patch.report_file_path = body.report_file_path;
  if (body.report_file_name !== undefined) patch.report_file_name = body.report_file_name;
  if (body.conducted_by !== undefined) patch.conducted_by = body.conducted_by;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  if (patch.status === 'completed' && !patch.outcome && !row.outcome) {
    return NextResponse.json({ error: 'outcome is required when completing a visit' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_site_visits')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', row.id as string)
    .select('*')
    .single();

  if (upErr || !updated) return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'site_visit_updated',
    beforeState: { site_visit_id: row.id },
    afterState: patch,
    ipAddress: clientIpFromRequest(req),
  });

  return NextResponse.json({ site_visit: updated });
}
