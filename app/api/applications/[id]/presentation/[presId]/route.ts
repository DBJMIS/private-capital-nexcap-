import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; presId: string }> };

const PRESENTATION_COLUMNS =
  'id, scheduled_date, actual_date, status, recording_url, presentation_file_path, attendees, notes, presentation_type, location, teams_meeting_id, teams_join_url, teams_recording_url, auto_completed, invite_sent, invite_sent_at';

function normalizeAttendeesJson(raw: string): Array<{ name: string; organisation: string; email: string }> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((item) => {
        const o = item as Record<string, unknown>;
        return {
          name: String(o.name ?? '').trim(),
          organisation: String(o.organisation ?? '').trim(),
          email: String(o.email ?? '').trim(),
        };
      })
      .filter((a) => a.name || a.organisation || a.email);
  } catch {
    return null;
  }
}

function normalizeAttendeesFromBody(
  attendees: unknown,
): Array<{ name: string; organisation: string; email: string }> {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .map((item) => {
      const o = item as Record<string, unknown>;
      return {
        name: String(o.name ?? '').trim(),
        organisation: String(o.organisation ?? '').trim(),
        email: String(o.email ?? '').trim(),
      };
    })
    .filter((a) => a.name || a.organisation || a.email);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const authUser = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId, presId } = await ctx.params;
  const supabase = createServerClient();
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    let body: {
      scheduled_date?: string | null;
      presentation_type?: string | null;
      location?: string | null;
      attendees?: unknown;
      notes?: string | null;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { data: presentation } = await supabase
      .from('vc_presentations')
      .select('id, status')
      .eq('tenant_id', profile.tenant_id)
      .eq('application_id', applicationId)
      .eq('id', presId)
      .maybeSingle();
    if (!presentation) return NextResponse.json({ data: null, error: 'Presentation not found' }, { status: 404 });
    if ((presentation as { status: string }).status !== 'scheduled') {
      return NextResponse.json(
        { data: null, error: 'Only scheduled presentations can be edited this way' },
        { status: 409 },
      );
    }

    const attendeeRows = normalizeAttendeesFromBody(body.attendees);
    const rawType = String(body.presentation_type ?? 'in_person').toLowerCase();
    const presentationType = rawType === 'teams' ? 'teams' : 'in_person';
    const location =
      typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;
    const notesTrim = typeof body.notes === 'string' ? body.notes.trim() : '';
    const notes = notesTrim.length > 0 ? notesTrim : null;

    // TODO: TEAMS INTEGRATION — same as POST: create meeting, store IDs, invites when type is teams.

    const { data: saved, error } = await supabase
      .from('vc_presentations')
      .update({
        scheduled_date: body.scheduled_date ?? null,
        presentation_type: presentationType,
        location: presentationType === 'in_person' ? location : null,
        attendees: attendeeRows,
        notes,
      })
      .eq('tenant_id', profile.tenant_id)
      .eq('application_id', applicationId)
      .eq('id', presId)
      .select(PRESENTATION_COLUMNS)
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

    return NextResponse.json({ data: { presentation: saved }, error: null });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ data: null, error: 'Expected multipart form data' }, { status: 400 });
  }

  const status = String(form.get('status') ?? '').trim().toLowerCase();
  const actualDate = String(form.get('actual_date') ?? '').trim();
  const recordingUrl = String(form.get('recording_url') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  const file = form.get('file');
  const filePath = file instanceof File ? `upload:${file.name}` : null;
  const attendeesField = form.get('attendees');
  const attendeesParsed =
    typeof attendeesField === 'string' && attendeesField.trim() ? normalizeAttendeesJson(attendeesField) : null;
  if (typeof attendeesField === 'string' && attendeesField.trim() && attendeesParsed === null) {
    return NextResponse.json({ data: null, error: 'Invalid attendees JSON' }, { status: 400 });
  }

  const { data: presentation } = await supabase
    .from('vc_presentations')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .eq('id', presId)
    .maybeSingle();
  if (!presentation) return NextResponse.json({ data: null, error: 'Presentation not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (actualDate) patch.actual_date = actualDate;
  if (recordingUrl) patch.recording_url = recordingUrl;
  if (notes || notes === '') patch.notes = notes || null;
  if (filePath) patch.presentation_file_path = filePath;
  if (status === 'completed' || status === 'scheduled' || status === 'cancelled') patch.status = status;
  if (attendeesParsed !== null) patch.attendees = attendeesParsed;

  const { data: saved, error } = await supabase
    .from('vc_presentations')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .eq('id', presId)
    .select(PRESENTATION_COLUMNS)
    .single();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  if ((saved as { status: string }).status === 'completed') {
    const { data: app } = await supabase
      .from('vc_fund_applications')
      .select('status')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId)
      .is('deleted_at', null)
      .maybeSingle();
    const beforeStatus = (app as { status?: string } | null)?.status ?? null;
    await supabase
      .from('vc_fund_applications')
      .update({ status: 'presentation_complete' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId);

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: authUser.id,
      entityType: 'fund_application',
      entityId: applicationId,
      action: 'presentation_completed',
      beforeState: { status: beforeStatus },
      afterState: { status: 'presentation_complete' },
      metadata: { presentation_id: presId },
    });
  }

  return NextResponse.json({ data: { presentation: saved }, error: null });
}
