import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { parsePagination } from '@/lib/http/pagination';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { validatePipelinePrerequisites } from '@/lib/deals/from-application';
import { hasApprovedDueDiligenceCompletion } from '@/lib/workflow/approval-rules';
import { notifyApprovalRequestCreated } from '@/lib/workflow/notify-stub';
import type { ApprovalType } from '@/lib/workflow/types';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const ENTITY_TYPES = new Set(['application', 'deal', 'disbursement', 'questionnaire', 'investment']);

export async function GET(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const pendingFor = searchParams.get('pending_for');
  const pastBy = searchParams.get('past_by');
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');
  const status = searchParams.get('status');
  const { limit, offset } = parsePagination(req);

  let q = supabase.from('vc_approvals').select('*').eq('tenant_id', profile.tenant_id);

  if (entityType && entityId) {
    q = q.eq('entity_type', entityType).eq('entity_id', entityId);
  }

  if (status) {
    q = q.eq('status', status);
  }

  if (pastBy === 'me') {
    q = q.eq('approved_by', user.id).in('status', ['approved', 'rejected']);
  }

  if (pendingFor === 'me') {
    q = q.eq('status', 'pending');
  }

  const { data: rows, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  if (error) return jsonError(sanitizeDbError(error), 500);

  let list = rows ?? [];
  if (pendingFor === 'me') {
    list = list.filter((a) => {
      const at = (a as { assigned_to?: string | null }).assigned_to;
      return at == null || at === user.id;
    });
  }

  return NextResponse.json({ approvals: list, limit, offset });
}

type PostBody = {
  approval_type: ApprovalType;
  entity_type: string;
  entity_id: string;
  assigned_to?: string | null;
};

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.approval_type || !body.entity_type || !body.entity_id) {
    return NextResponse.json({ error: 'approval_type, entity_type, and entity_id are required' }, { status: 400 });
  }

  if (!ENTITY_TYPES.has(body.entity_type)) {
    return NextResponse.json({ error: 'Unsupported entity_type' }, { status: 400 });
  }

  if (body.approval_type === 'due_diligence' && !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.approval_type === 'investment' && !can(profile, 'write:deals')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.approval_type === 'due_diligence') {
    if (body.entity_type !== 'application') {
      return NextResponse.json({ error: 'due_diligence approvals use entity_type application' }, { status: 400 });
    }
    const pre = await validatePipelinePrerequisites(supabase, profile.tenant_id, body.entity_id);
    if (!pre.ok) {
      return NextResponse.json({ error: pre.error }, { status: 400 });
    }
    const already = await hasApprovedDueDiligenceCompletion(supabase, profile.tenant_id, body.entity_id);
    if (already) {
      return NextResponse.json({ error: 'Due diligence completion is already approved' }, { status: 400 });
    }
  }

  if (body.approval_type === 'investment') {
    if (body.entity_type !== 'deal') {
      return NextResponse.json({ error: 'investment approvals use entity_type deal' }, { status: 400 });
    }
    const { data: deal } = await supabase
      .from('vc_deals')
      .select('id, stage')
      .eq('id', body.entity_id)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();

    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    if (!['investment_committee', 'approved'].includes(deal.stage as string)) {
      return NextResponse.json(
        { error: 'Deal must be in a stage that allows IC review' },
        { status: 400 },
      );
    }
  }

  if (body.approval_type === 'pre_screening') {
    return NextResponse.json(
      { error: 'Pre-screening approvals are created automatically when the checklist is submitted' },
      { status: 400 },
    );
  }

  if (body.approval_type === 'disbursement') {
    return NextResponse.json(
      { error: 'Disbursement approvals are created automatically when a tranche is requested' },
      { status: 400 },
    );
  }

  const { data: created, error: insErr } = await supabase
    .from('vc_approvals')
    .insert({
      tenant_id: profile.tenant_id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      approval_type: body.approval_type,
      requested_by: user.id,
      assigned_to: body.assigned_to ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (insErr || !created) {
    if (insErr?.message?.includes('duplicate') || insErr?.code === '23505') {
      return NextResponse.json({ error: 'A pending approval already exists for this entity' }, { status: 409 });
    }
    return jsonError(sanitizeDbError(insErr), 500);
  }

  await notifyApprovalRequestCreated({
    tenantId: profile.tenant_id,
    approvalId: created.id,
    approvalType: body.approval_type,
  });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'approval',
    entityId: created.id,
    action: 'requested',
    afterState: {
      status: 'pending',
      approval_type: body.approval_type,
      target_entity_type: body.entity_type,
      target_entity_id: body.entity_id,
    },
    metadata:
      body.entity_type === 'application'
        ? { application_id: body.entity_id }
        : { target_entity_type: body.entity_type, target_entity_id: body.entity_id },
  });

  return NextResponse.json({ approval: created });
}
