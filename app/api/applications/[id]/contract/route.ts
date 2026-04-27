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

  const { data: contract, error } = await supabase
    .from('vc_contracts')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contract });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from('vc_contracts')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Contract already exists' }, { status: 409 });

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const appRow = app as { id: string; status: string };
  const st = appRow.status.trim().toLowerCase();

  const { data: visit } = await supabase
    .from('vc_site_visits')
    .select('outcome, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const visitRow = visit as { outcome: string | null; status: string } | null;
  const visitComplete = (visitRow?.status ?? '').trim().toLowerCase() === 'completed';
  const outcome = (visitRow?.outcome ?? '').trim().toLowerCase();
  const outcomeOk = outcome === 'satisfactory' || outcome === 'conditional';
  // Match Negotiation tab visibility: visit can be done while app is still dd_complete / due_diligence / etc.
  const blockedAppStatus = st === 'rejected' || st === 'draft';

  if (blockedAppStatus || !visitComplete || !outcomeOk) {
    return NextResponse.json(
      {
        error:
          'Complete the site visit (with satisfactory or conditional outcome) before opening contract negotiation',
      },
      { status: 400 },
    );
  }

  const { data: contract, error } = await supabase
    .from('vc_contracts')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: applicationId,
      created_by: profile.profile_id,
      status: 'drafting',
    })
    .select('*')
    .single();

  if (error || !contract) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });

  if (st === 'site_visit') {
    const { error: sErr } = await supabase
      .from('vc_fund_applications')
      .update({ status: 'negotiation' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'fund_application',
      entityId: applicationId,
      action: 'status_change',
      beforeState: { status: st },
      afterState: { status: 'negotiation' },
      ipAddress: clientIpFromRequest(req),
    });
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'contract_created',
    afterState: { contract_id: contract.id },
    ipAddress: clientIpFromRequest(req),
  });

  return NextResponse.json({ contract });
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
  const { data: contract, error: cErr } = await supabase
    .from('vc_contracts')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (cErr || !contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const row = contract as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const keys = [
    'contract_type',
    'status',
    'commitment_amount',
    'commitment_currency',
    'dbj_pro_rata_pct',
    'management_fee_pct',
    'carried_interest_pct',
    'hurdle_rate_pct',
    'fund_life_years',
    'investment_period_years',
    'legal_review_started_at',
    'legal_review_completed_at',
    'legal_reviewer_notes',
    'adobe_sign_agreement_id',
    'adobe_sign_status',
    'signed_at',
    'signed_by_dbj',
    'signed_by_fund_manager',
    'contract_file_path',
    'contract_file_name',
    'negotiation_rounds',
  ] as const;

  for (const k of keys) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_contracts')
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
    action: 'contract_updated',
    afterState: patch,
    ipAddress: clientIpFromRequest(req),
  });

  return NextResponse.json({ contract: updated });
}
