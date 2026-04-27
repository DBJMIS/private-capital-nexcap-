import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { DRAFT_STRING_PLACEHOLDER, toDraftRow } from '@/lib/onboarding/extract';
import type { ChatMessage, FundApplicationForm } from '@/types/onboarding';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type DraftBody = {
  application_id?: string | null;
  application: Partial<FundApplicationForm>;
  messages?: ChatMessage[];
  /** Link draft to an active CFP (fund manager intake). */
  cfp_id?: string | null;
};

function rowToForm(row: {
  fund_name: string;
  manager_name: string;
  country_of_incorporation: string;
  geographic_area: string;
  total_capital_commitment_usd: number;
  onboarding_metadata: unknown;
}): Partial<FundApplicationForm> {
  const meta = (row.onboarding_metadata && typeof row.onboarding_metadata === 'object'
    ? row.onboarding_metadata
    : {}) as Record<string, unknown>;
  const base: Partial<FundApplicationForm> = {
    fund_name: row.fund_name === DRAFT_STRING_PLACEHOLDER ? '' : row.fund_name,
    manager_name: row.manager_name === DRAFT_STRING_PLACEHOLDER ? '' : row.manager_name,
    country_of_incorporation:
      row.country_of_incorporation === DRAFT_STRING_PLACEHOLDER ? '' : row.country_of_incorporation,
    geographic_area: row.geographic_area === DRAFT_STRING_PLACEHOLDER ? '' : row.geographic_area,
    total_capital_commitment_usd: row.total_capital_commitment_usd || undefined,
  };
  if (typeof meta.investment_stage === 'string') base.investment_stage = meta.investment_stage;
  if (typeof meta.primary_sector === 'string') base.primary_sector = meta.primary_sector;
  if (typeof meta.fund_life_years === 'number') base.fund_life_years = meta.fund_life_years;
  if (typeof meta.investment_period_years === 'number') base.investment_period_years = meta.investment_period_years;
  return base;
}

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('vc_fund_applications')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('created_by', user.id)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ application_id: null, application: {}, messages: [] as ChatMessage[] });
  }

  const meta = (data.onboarding_metadata && typeof data.onboarding_metadata === 'object'
    ? data.onboarding_metadata
    : {}) as { wizard_messages?: ChatMessage[] };
  const messages = Array.isArray(meta.wizard_messages) ? meta.wizard_messages : [];

  return NextResponse.json({
    application_id: data.id,
    application: rowToForm(data),
    messages,
    cfp_id: (data as { cfp_id?: string | null }).cfp_id ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = profile.tenant_id;

  let body: DraftBody;
  try {
    body = (await req.json()) as DraftBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const application = body.application && typeof body.application === 'object' ? body.application : {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const mergedMeta = {
    wizard_messages: messages.slice(-80),
    investment_stage: application.investment_stage,
    primary_sector: application.primary_sector,
    fund_life_years: application.fund_life_years,
    investment_period_years: application.investment_period_years,
  };

  const row = toDraftRow(tenantId, user.id, application, mergedMeta);

  async function assertLinkableActiveCfp(cfpId: string) {
    const { data: cfpRow, error: cfpErr } = await supabase
      .from('vc_cfps')
      .select('id')
      .eq('id', cfpId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle();
    if (cfpErr || !cfpRow) {
      return { ok: false as const, message: 'CFP not found or not active for this tenant' };
    }
    return { ok: true as const };
  }

  if (body.application_id) {
    const appKeys = Object.keys(application).filter((k) => {
      const v = application[k as keyof typeof application];
      return v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
    });
    const cfpIdTrim =
      typeof body.cfp_id === 'string' && body.cfp_id.trim() !== '' ? body.cfp_id.trim() : '';
    const cfpOnly = Boolean(cfpIdTrim) && appKeys.length === 0 && messages.length === 0;

    if (cfpOnly) {
      const ok = await assertLinkableActiveCfp(cfpIdTrim);
      if (!ok.ok) return NextResponse.json({ error: ok.message }, { status: 400 });
      const { data, error } = await supabase
        .from('vc_fund_applications')
        .update({ cfp_id: cfpIdTrim })
        .eq('id', body.application_id)
        .eq('tenant_id', tenantId)
        .eq('created_by', user.id)
        .select('id')
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ application_id: data?.id ?? body.application_id });
    }

    const patch: Record<string, unknown> = {
      fund_name: row.fund_name,
      manager_name: row.manager_name,
      country_of_incorporation: row.country_of_incorporation,
      geographic_area: row.geographic_area,
      total_capital_commitment_usd: row.total_capital_commitment_usd,
      onboarding_metadata: row.onboarding_metadata,
    };

    if (cfpIdTrim) {
      const ok = await assertLinkableActiveCfp(cfpIdTrim);
      if (!ok.ok) return NextResponse.json({ error: ok.message }, { status: 400 });
      patch.cfp_id = cfpIdTrim;
    }

    const { data, error } = await supabase
      .from('vc_fund_applications')
      .update(patch)
      .eq('id', body.application_id)
      .eq('tenant_id', tenantId)
      .eq('created_by', user.id)
      .select('id')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ application_id: data?.id ?? body.application_id });
  }

  let insertRow: Record<string, unknown> = { ...row };
  if (body.cfp_id !== undefined && body.cfp_id !== null && body.cfp_id !== '') {
    const ok = await assertLinkableActiveCfp(String(body.cfp_id));
    if (!ok.ok) return NextResponse.json({ error: ok.message }, { status: 400 });
    insertRow = { ...insertRow, cfp_id: body.cfp_id };
  }

  const { data, error } = await supabase.from('vc_fund_applications').insert(insertRow).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  scheduleAuditLog({
    tenantId,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: data.id,
    action: 'created',
    afterState: { status: 'draft' },
    metadata: { source: 'onboarding_draft' },
  });

  return NextResponse.json({ application_id: data.id });
}
