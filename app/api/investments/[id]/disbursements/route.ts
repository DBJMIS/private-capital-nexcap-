import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { canAddDisbursementAmount } from '@/lib/investments/disbursement';
import { notifyApprovalRequestCreated } from '@/lib/workflow/notify-stub';
import { scheduleAuditLog } from '@/lib/audit/log';
import { disbursementCreateBodySchema } from '@/lib/validation/api-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: investmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: inv } = await supabase
    .from('vc_investments')
    .select('id')
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_disbursements')
    .select('*')
    .eq('investment_id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .order('tranche_number', { ascending: true });

  if (error) return jsonError(sanitizeDbError(error), 500);

  const list = rows ?? [];
  const ids = list.map((r) => r.id);
  let approvalByDisb: Record<string, { id: string; status: string }> = {};
  if (ids.length) {
    const { data: appr } = await supabase
      .from('vc_approvals')
      .select('id, entity_id, status')
      .eq('tenant_id', profile.tenant_id)
      .eq('entity_type', 'disbursement')
      .eq('approval_type', 'disbursement')
      .in('entity_id', ids);
    for (const a of appr ?? []) {
      approvalByDisb[a.entity_id as string] = { id: a.id, status: a.status as string };
    }
  }

  const disbursements = list.map((r) => ({
    ...r,
    approval_id: approvalByDisb[r.id]?.id ?? null,
    approval_status: approvalByDisb[r.id]?.status ?? null,
  }));

  return NextResponse.json({ disbursements });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: investmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:disbursements')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const parsed = disbursementCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid body';
    return jsonError(msg, 400, 'validation_error');
  }
  const body = parsed.data;
  const amount = body.amount_usd;

  const { data: inv, error: invErr } = await supabase
    .from('vc_investments')
    .select('id, approved_amount_usd, disbursed_amount_usd, status')
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (invErr || !inv) return jsonError('Investment not found', 404);

  if (inv.status !== 'active') {
    return jsonError('Investment must be active to add disbursements', 400);
  }

  const { data: pendingRows } = await supabase
    .from('vc_disbursements')
    .select('amount_usd')
    .eq('investment_id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'pending');

  const pendingCommitted = (pendingRows ?? []).reduce((sum, r) => sum + Number(r.amount_usd ?? 0), 0);

  const approved = Number(inv.approved_amount_usd);
  const disbursed = Number(inv.disbursed_amount_usd);
  /** Treat pending tranches as reserved so sum(pending)+disbursed cannot exceed approved before approval. */
  const check = canAddDisbursementAmount(approved, disbursed + pendingCommitted, amount);
  if (!check.ok) {
    return jsonError(check.message, 400);
  }

  const { data: maxRow } = await supabase
    .from('vc_disbursements')
    .select('tranche_number')
    .eq('investment_id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .order('tranche_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextTranche = (maxRow?.tranche_number ?? 0) + 1;

  const { data: row, error: insErr } = await supabase
    .from('vc_disbursements')
    .insert({
      tenant_id: profile.tenant_id,
      investment_id: investmentId,
      tranche_number: nextTranche,
      amount_usd: amount,
      disbursement_date: body.disbursement_date ?? null,
      reference_number: body.reference_number ?? null,
      notes: body.notes ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (insErr || !row) return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'disbursement',
    entityId: row.id,
    action: 'created',
    afterState: {
      status: 'pending',
      investment_id: investmentId,
      amount_usd: amount,
      tranche_number: nextTranche,
    },
  });

  const { data: appr, error: apErr } = await supabase
    .from('vc_approvals')
    .insert({
      tenant_id: profile.tenant_id,
      entity_type: 'disbursement',
      entity_id: row.id,
      approval_type: 'disbursement',
      requested_by: user.id,
      assigned_to: body.assigned_approver_id ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (apErr || !appr) {
    await supabase.from('vc_disbursements').delete().eq('id', row.id).eq('tenant_id', profile.tenant_id);
    return jsonError(sanitizeDbError(apErr ?? new Error('approval insert failed')), 500);
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'approval',
    entityId: appr.id,
    action: 'requested',
    afterState: {
      status: 'pending',
      approval_type: 'disbursement',
      target_entity_type: 'disbursement',
      target_entity_id: row.id,
    },
    metadata: { investment_id: investmentId },
  });

  await notifyApprovalRequestCreated({
    tenantId: profile.tenant_id,
    approvalId: appr.id,
    approvalType: 'disbursement',
  });

  return NextResponse.json({
    disbursement: {
      ...row,
      approval_id: appr.id,
      approval_status: 'pending',
    },
  });
}
