import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const PRESENTATION_COLUMNS =
  'id, scheduled_date, actual_date, status, recording_url, presentation_file_path, attendees, notes, presentation_type, location, teams_meeting_id, teams_join_url, teams_recording_url, auto_completed, invite_sent, invite_sent_at';

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const { data: row, error } = await supabase
    .from('vc_presentations')
    .select(PRESENTATION_COLUMNS)
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: { presentation: row ?? null }, error: null });
}

export async function POST(req: Request, ctx: Ctx) {
  const authUser = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: {
    scheduled_date?: string | null;
    presentation_type?: string | null;
    location?: string | null;
    attendees?: Array<{ name?: string; organisation?: string; email?: string }>;
    notes?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status, cfp_id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!app) return NextResponse.json({ data: null, error: 'Application not found' }, { status: 404 });
  if (!(app as { cfp_id: string | null }).cfp_id) {
    return NextResponse.json({ data: null, error: 'Application must be linked to a CFP before scheduling presentation' }, { status: 400 });
  }

  const attendeeRows = (body.attendees ?? [])
    .map((a) => ({
      name: String(a.name ?? '').trim(),
      organisation: String(a.organisation ?? '').trim(),
      email: String(a.email ?? '').trim(),
    }))
    .filter((a) => a.name || a.organisation || a.email);

  const rawType = String(body.presentation_type ?? 'in_person').toLowerCase();
  const presentationType = rawType === 'teams' ? 'teams' : 'in_person';
  const location =
    typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;

  // TODO: TEAMS INTEGRATION
  // When presentation_type === 'teams':
  // 1. Call lib/microsoft/graph.ts createTeamsMeeting()
  // 2. Store teams_meeting_id and teams_join_url
  // 3. Set invite_sent = true after sending invites
  // 4. Return join_url to client for display
  // (No Graph calls until env + permissions are configured.)

  const { data: existing } = await supabase
    .from('vc_presentations')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let saved: Record<string, unknown> | null = null;
  if (existing) {
    const { data, error } = await supabase
      .from('vc_presentations')
      .update({
        scheduled_date: body.scheduled_date ?? null,
        presentation_type: presentationType,
        location: presentationType === 'in_person' ? location : null,
        attendees: attendeeRows,
        notes: body.notes ?? null,
        status: 'scheduled',
      })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', (existing as { id: string }).id)
      .select(PRESENTATION_COLUMNS)
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    saved = data as Record<string, unknown>;
  } else {
    const { data, error } = await supabase
      .from('vc_presentations')
      .insert({
        tenant_id: profile.tenant_id,
        application_id: applicationId,
        cfp_id: (app as { cfp_id: string }).cfp_id,
        scheduled_date: body.scheduled_date ?? null,
        presentation_type: presentationType,
        location: presentationType === 'in_person' ? location : null,
        attendees: attendeeRows,
        notes: body.notes ?? null,
        status: 'scheduled',
        created_by: authUser.id,
      })
      .select(PRESENTATION_COLUMNS)
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    saved = data as Record<string, unknown>;
  }

  const currentStatus = (app as { status: string }).status;
  if (currentStatus !== 'presentation_complete') {
    await supabase
      .from('vc_fund_applications')
      .update({ status: 'presentation_scheduled' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId);
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: authUser.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'presentation_scheduled',
    beforeState: { status: currentStatus },
    afterState: { status: 'presentation_scheduled' },
    metadata: { presentation_id: saved?.id, attendees: attendeeRows.length },
  });

  return NextResponse.json({ data: { presentation: saved }, error: null });
}
