import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { generateReportingObligations, getQuarterMonths, refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';
import { summarizeCompliance, type ObligationLite } from '@/lib/portfolio/compliance';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = createServerClient();
  await refreshObligationStatuses(supabase, profile.tenant_id);

  const { data: fund, error } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: obs } = await supabase
    .from('vc_reporting_obligations')
    .select('report_type, status, due_date')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', id);

  const obligationRows = (obs ?? []) as ObligationLite[];
  const summary = summarizeCompliance(obligationRows);

  return NextResponse.json({ fund, obligation_summary: summary });
}

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: before, error: bErr } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (bErr || !before) {
    return NextResponse.json({ error: bErr?.message ?? 'Not found' }, { status: bErr ? 500 : 404 });
  }

  const patch: Record<string, unknown> = { ...body };
  delete patch.id;
  delete patch.tenant_id;
  delete patch.created_at;
  delete patch.created_by;

  const yearEnd = patch.year_end_month;
  if (typeof yearEnd === 'number' && Number.isInteger(yearEnd) && yearEnd >= 1 && yearEnd <= 12) {
    patch.report_months = getQuarterMonths(yearEnd);
    patch.audit_month = yearEnd;
  }

  const { data: updated, error } = await supabase
    .from('vc_portfolio_funds')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }

  const b = before as PortfolioFundRow;
  const u = updated as PortfolioFundRow;
  const regen =
    b.year_end_month !== u.year_end_month ||
    b.quarterly_report_due_days !== u.quarterly_report_due_days ||
    b.audit_report_due_days !== u.audit_report_due_days ||
    b.requires_quarterly_financial !== u.requires_quarterly_financial ||
    b.requires_quarterly_inv_mgmt !== u.requires_quarterly_inv_mgmt ||
    b.requires_audited_annual !== u.requires_audited_annual ||
    b.requires_inhouse_quarterly !== u.requires_inhouse_quarterly;

  if (regen) {
    await generateReportingObligations(supabase, u);
    await refreshObligationStatuses(supabase, profile.tenant_id);
  }

  return NextResponse.json({ fund: updated });
}
