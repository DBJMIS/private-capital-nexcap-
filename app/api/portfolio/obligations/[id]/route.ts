import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { logComplianceAction } from '@/lib/portfolio/compliance-action-log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const escalationLevelSchema = z.enum(['analyst', 'supervisor', 'unit_head']);

const actionBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_received'),
    submitted_date: z.string().min(1),
    submitted_by: z.string().min(1),
    notes: z.string().optional().nullable(),
  }),
  z.object({
    action: z.literal('mark_accepted'),
    review_notes: z.string().optional().nullable(),
  }),
  z.object({
    action: z.literal('send_reminder'),
    reminder_recipient: z.string().min(1),
  }),
  z.object({
    action: z.literal('escalate'),
    escalation_level: escalationLevelSchema,
    escalated_to: z.string().min(1),
    notes: z.string().optional().nullable(),
  }),
  z.object({
    action: z.literal('add_note'),
    notes: z.string().min(1),
  }),
]);

type LegacyPatchBody = {
  status?: string;
  submitted_date?: string | null;
  submitted_by?: string | null;
  review_notes?: string | null;
  document_path?: string | null;
  document_name?: string | null;
  document_size_bytes?: number | null;
  reviewed_date?: string | null;
  decision?: 'accept' | 'request_clarification';
};

function todayDate(): string {
  return new Date().toISOString().split('T')[0]!;
}

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: row, error: rErr } = await supabase
    .from('vc_reporting_obligations')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (rErr || !row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fromStatus = (row as { status: string }).status;
  const fundId = (row as { fund_id: string }).fund_id;

  const actorName = profile.full_name?.trim() || profile.name?.trim() || profile.email || 'User';

  const parsed = actionBodySchema.safeParse(raw);
  if (parsed.success) {
    const body = parsed.data;
    const patch: Record<string, unknown> = {};
    let logType:
      | 'marked_received'
      | 'marked_accepted'
      | 'reminder_sent'
      | 'escalated'
      | 'note_added'
      | null = null;
    let logNotes: string | null = null;
    let logRecipient: string | null = null;

    if (body.action === 'mark_received') {
      patch.status = 'submitted';
      patch.submitted_date = body.submitted_date;
      patch.submitted_by = body.submitted_by.trim();
      patch.actioned_by = profile.profile_id;
      patch.actioned_at = new Date().toISOString();
      logType = 'marked_received';
      logNotes = body.notes?.trim() || null;
    } else if (body.action === 'mark_accepted') {
      patch.status = 'accepted';
      patch.reviewed_by = profile.profile_id;
      patch.reviewed_date = todayDate();
      patch.review_notes = body.review_notes?.trim() || null;
      patch.actioned_by = profile.profile_id;
      patch.actioned_at = new Date().toISOString();
      logType = 'marked_accepted';
      logNotes = body.review_notes?.trim() || null;
    } else if (body.action === 'send_reminder') {
      patch.reminder_sent_at = new Date().toISOString();
      patch.reminder_sent_to = body.reminder_recipient.trim();
      logType = 'reminder_sent';
      logRecipient = body.reminder_recipient.trim();
      logNotes = `Reminder sent to ${body.reminder_recipient.trim()}`;
    } else if (body.action === 'escalate') {
      patch.escalation_level = body.escalation_level;
      patch.escalated_to = body.escalated_to.trim();
      patch.escalated_at = new Date().toISOString();
      logType = 'escalated';
      logRecipient = body.escalated_to.trim();
      logNotes = body.notes?.trim() || null;
    } else if (body.action === 'add_note') {
      logType = 'note_added';
      logNotes = body.notes.trim();
      patch.actioned_by = profile.profile_id;
      patch.actioned_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('vc_reporting_obligations')
      .update(patch)
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
    }

    const toStatus = (updated as { status: string }).status;
    let actionRow: { id: string } | null = null;
    if (logType) {
      actionRow = await logComplianceAction(supabase, {
        tenantId: profile.tenant_id,
        obligationId: id,
        fundId,
        actionType: logType,
        actorId: profile.profile_id,
        actorName,
        fromStatus,
        toStatus: logType === 'note_added' ? fromStatus : toStatus,
        notes: logNotes,
        recipient: logRecipient,
      });
    }

    const { data: action } = actionRow?.id
      ? await supabase.from('vc_compliance_actions').select('*').eq('id', actionRow.id).single()
      : { data: null };

    return NextResponse.json({ obligation: updated, action: action ?? null });
  }

  const body = raw as LegacyPatchBody;
  const patch: Record<string, unknown> = {};

  if (body.submitted_date !== undefined) patch.submitted_date = body.submitted_date;
  if (body.submitted_by !== undefined) patch.submitted_by = body.submitted_by;
  if (body.review_notes !== undefined) patch.review_notes = body.review_notes;
  if (body.document_path !== undefined) patch.document_path = body.document_path;
  if (body.document_name !== undefined) patch.document_name = body.document_name;
  if (body.document_size_bytes !== undefined) patch.document_size_bytes = body.document_size_bytes;
  if (body.reviewed_date !== undefined) patch.reviewed_date = body.reviewed_date;

  if (body.status !== undefined) {
    patch.status = body.status;
  }

  if (body.decision === 'accept') {
    patch.status = 'accepted';
    patch.reviewed_by = profile.profile_id;
    patch.reviewed_date = todayDate();
  } else if (body.decision === 'request_clarification') {
    patch.status = 'outstanding';
    patch.reviewed_by = profile.profile_id;
    patch.reviewed_date = todayDate();
  }

  const { data: updated, error } = await supabase
    .from('vc_reporting_obligations')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }

  const toStatus = (updated as { status: string }).status;
  let action: unknown = null;
  if (body.decision === 'accept') {
    await logComplianceAction(supabase, {
      tenantId: profile.tenant_id,
      obligationId: id,
      fundId,
      actionType: 'marked_accepted',
      actorId: profile.profile_id,
      actorName,
      fromStatus,
      toStatus,
      notes: body.review_notes?.trim() || null,
      recipient: null,
    });
    const { data: last } = await supabase
      .from('vc_compliance_actions')
      .select('*')
      .eq('obligation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    action = last;
  } else if (body.decision === 'request_clarification') {
    await logComplianceAction(supabase, {
      tenantId: profile.tenant_id,
      obligationId: id,
      fundId,
      actionType: 'status_changed',
      actorId: profile.profile_id,
      actorName,
      fromStatus,
      toStatus,
      notes: body.review_notes?.trim() || null,
      recipient: null,
    });
    const { data: last } = await supabase
      .from('vc_compliance_actions')
      .select('*')
      .eq('obligation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    action = last;
  } else if (body.status === 'submitted' && toStatus === 'submitted' && fromStatus !== 'submitted') {
    await logComplianceAction(supabase, {
      tenantId: profile.tenant_id,
      obligationId: id,
      fundId,
      actionType: 'marked_received',
      actorId: profile.profile_id,
      actorName,
      fromStatus,
      toStatus,
      notes: null,
      recipient: null,
    });
    const { data: last } = await supabase
      .from('vc_compliance_actions')
      .select('*')
      .eq('obligation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    action = last;
  } else if (body.status !== undefined && toStatus !== fromStatus) {
    await logComplianceAction(supabase, {
      tenantId: profile.tenant_id,
      obligationId: id,
      fundId,
      actionType: 'status_changed',
      actorId: profile.profile_id,
      actorName,
      fromStatus,
      toStatus,
      notes: body.review_notes?.trim() || null,
      recipient: null,
    });
    const { data: last } = await supabase
      .from('vc_compliance_actions')
      .select('*')
      .eq('obligation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    action = last;
  }

  return NextResponse.json({ obligation: updated, action });
}

