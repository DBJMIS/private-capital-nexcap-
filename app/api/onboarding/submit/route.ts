import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { ensurePreScreeningChecklist } from '@/lib/pre-screening/ensure-checklist';
import { isApplicationReady } from '@/lib/onboarding/extract';
import { scheduleAuditLog } from '@/lib/audit/log';
import type { FundApplicationForm } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

type SubmitBody = {
  application_id: string;
  application: Partial<FundApplicationForm>;
};

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.application_id || typeof body.application_id !== 'string') {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 });
  }

  const app = body.application;
  if (!isApplicationReady(app)) {
    return NextResponse.json({ error: 'Required fields incomplete' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const onboarding_metadata = {
    investment_stage: app.investment_stage,
    primary_sector: app.primary_sector,
    fund_life_years: app.fund_life_years,
    investment_period_years: app.investment_period_years,
    submitted_from_wizard_at: now,
  };

  const { data: prior } = await supabase
    .from('vc_fund_applications')
    .select('id, status, cfp_id')
    .eq('id', body.application_id)
    .eq('tenant_id', profile.tenant_id)
    .eq('created_by', user.id)
    .maybeSingle();

  if (!prior?.cfp_id) {
    return NextResponse.json(
      { error: 'Select an active Call for Proposals before submitting your application.' },
      { status: 400 },
    );
  }

  const { data: cfpCheck } = await supabase
    .from('vc_cfps')
    .select('id')
    .eq('id', prior.cfp_id as string)
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!cfpCheck) {
    return NextResponse.json(
      { error: 'Linked CFP is no longer active. Please refresh and choose an active call.' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('vc_fund_applications')
    .update({
      fund_name: app.fund_name!.trim(),
      manager_name: app.manager_name!.trim(),
      country_of_incorporation: app.country_of_incorporation!.trim(),
      geographic_area: app.geographic_area!.trim(),
      total_capital_commitment_usd: app.total_capital_commitment_usd!,
      status: 'pre_screening',
      submitted_at: now,
      onboarding_metadata,
    })
    .eq('id', body.application_id)
    .eq('tenant_id', profile.tenant_id)
    .eq('created_by', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Application not found or not permitted' }, { status: 404 });
  }

  const ensured = await ensurePreScreeningChecklist(supabase, profile.tenant_id, data.id);
  if ('error' in ensured) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: data.id,
    action: 'submitted',
    beforeState: { status: prior?.status ?? null },
    afterState: { status: 'pre_screening', submitted_at: now },
    metadata: { source: 'onboarding_submit' },
  });

  return NextResponse.json({ id: data.id, status: 'pre_screening' });
}
