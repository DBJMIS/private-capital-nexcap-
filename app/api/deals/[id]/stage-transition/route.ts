import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { DealStage } from '@/lib/deals/transitions';
import { validateDealStageTransition } from '@/lib/deals/transitions';
import { scheduleAuditLog } from '@/lib/audit/log';
import { dealStageTransitionBodySchema } from '@/lib/validation/api-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: dealId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:deals')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const parsed = dealStageTransitionBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body', 400, 'validation_error');
  }
  const body = parsed.data;

  const { data: deal, error: dErr } = await supabase
    .from('vc_deals')
    .select('id, stage, application_id, deal_value_usd')
    .eq('id', dealId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (dErr || !deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const fromStage = deal.stage as DealStage;
  const toStage = body.to_stage as DealStage;

  const v = await validateDealStageTransition(
    supabase,
    profile.tenant_id,
    { id: deal.id, stage: fromStage, application_id: deal.application_id },
    toStage,
  );

  if (!v.ok) {
    return NextResponse.json({ error: v.message, code: v.code }, { status: 400 });
  }

  const prevStage = fromStage;

  const { error: upErr } = await supabase
    .from('vc_deals')
    .update({ stage: toStage })
    .eq('id', dealId)
    .eq('tenant_id', profile.tenant_id);

  if (upErr) return jsonError(sanitizeDbError(upErr), 500);

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'deal',
    entityId: dealId,
    action: 'stage_changed',
    beforeState: { stage: prevStage },
    afterState: { stage: toStage },
  });

  if (toStage === 'approved' && body.investment) {
    const invPayload = body.investment;
    const { data: dup } = await supabase
      .from('vc_investments')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('deal_id', dealId)
      .eq('status', 'active')
      .maybeSingle();

    if (dup?.id) {
      await supabase.from('vc_deals').update({ stage: prevStage }).eq('id', dealId).eq('tenant_id', profile.tenant_id);
      return jsonError('An active investment already exists for this deal; revert stage', 409);
    }

    const amt = invPayload.approved_amount_usd;

    const { data: invRow, error: invErr } = await supabase
      .from('vc_investments')
      .insert({
        tenant_id: profile.tenant_id,
        deal_id: dealId,
        application_id: deal.application_id,
        approved_amount_usd: amt,
        disbursed_amount_usd: 0,
        status: 'active',
        instrument_type: invPayload.instrument_type,
        investment_date: invPayload.investment_date ?? null,
        maturity_date: invPayload.maturity_date ?? null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (invErr || !invRow) {
      await supabase.from('vc_deals').update({ stage: prevStage }).eq('id', dealId).eq('tenant_id', profile.tenant_id);
      return jsonError(sanitizeDbError(invErr), 500);
    }

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'investment',
      entityId: invRow.id,
      action: 'created',
      afterState: { deal_id: dealId, approved_amount_usd: amt },
      metadata: { source: 'deal_stage_transition' },
    });
  }

  return NextResponse.json({ ok: true, stage: toStage });
}
