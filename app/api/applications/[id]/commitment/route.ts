import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog, clientIpFromRequest } from '@/lib/audit/log';
import { validateApplicationStatusTransition } from '@/lib/applications/status-transitions';
import { generateReportingObligations, getQuarterMonths } from '@/lib/portfolio/reporting-engine';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  year_end_month?: number;
  listed?: boolean;
  quarterly_days?: number;
  audit_days?: number;
  fund_representative?: string | null;
  currency?: 'USD' | 'JMD';
  total_fund_commitment?: number;
  exchange_rate_jmd_usd?: number;
};

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const yearEnd = Number(body.year_end_month);
  if (!Number.isInteger(yearEnd) || yearEnd < 1 || yearEnd > 12) {
    return NextResponse.json({ error: 'year_end_month must be an integer 1–12' }, { status: 400 });
  }

  const listed = Boolean(body.listed);
  const qn = Number(body.quarterly_days);
  const quarterlyDays =
    body.quarterly_days === undefined || body.quarterly_days === null || Number.isNaN(qn)
      ? 45
      : Math.max(1, Math.min(120, Math.floor(qn)));
  const an = Number(body.audit_days);
  const auditDays =
    body.audit_days === undefined || body.audit_days === null || Number.isNaN(an)
      ? 90
      : Math.max(1, Math.min(365, Math.floor(an)));

  const fundRep =
    body.fund_representative === undefined || body.fund_representative === null
      ? null
      : String(body.fund_representative).trim() || null;

  const supabase = createServerClient();

  const { data: existingCommit } = await supabase
    .from('vc_commitments')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (existingCommit) {
    return NextResponse.json({ error: 'Commitment already issued for this application' }, { status: 409 });
  }

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, status, fund_name, manager_name, pipeline_metadata')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const appRow = app as {
    id: string;
    status: string;
    fund_name: string;
    manager_name: string;
    pipeline_metadata: unknown;
  };

  const { data: contract, error: cErr } = await supabase
    .from('vc_contracts')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (cErr || !contract) return NextResponse.json({ error: 'Contract record not found' }, { status: 404 });

  const c = contract as Record<string, unknown>;
  const cStatus = String(c.status ?? '').toLowerCase();
  if (cStatus !== 'signed' && cStatus !== 'executed') {
    return NextResponse.json({ error: 'Contract must be signed or executed before issuing a commitment' }, { status: 400 });
  }

  const commitmentAmount = c.commitment_amount;
  const commitmentCurrency = (body.currency as string | undefined) === 'USD' || body.currency === 'JMD'
    ? body.currency
    : String(c.commitment_currency ?? 'JMD');
  const dbjProRata = c.dbj_pro_rata_pct;

  if (commitmentAmount == null || Number(commitmentAmount) <= 0) {
    return NextResponse.json({ error: 'Contract must include a positive commitment amount' }, { status: 400 });
  }
  if (dbjProRata == null || Number.isNaN(Number(dbjProRata))) {
    return NextResponse.json({ error: 'Contract must include DBJ pro-rata %' }, { status: 400 });
  }

  const amtNum = Number(commitmentAmount);
  const prataNum = Number(dbjProRata);
  const inferredTotal =
    prataNum > 0 ? Math.round((amtNum / (prataNum / 100)) * 100) / 100 : amtNum;
  const totalFund =
    body.total_fund_commitment != null && Number.isFinite(Number(body.total_fund_commitment))
      ? Number(body.total_fund_commitment)
      : inferredTotal;

  const exRate =
    body.exchange_rate_jmd_usd != null && Number.isFinite(Number(body.exchange_rate_jmd_usd))
      ? Number(body.exchange_rate_jmd_usd)
      : 157.0;

  const commitmentDateStr = new Date().toISOString().split('T')[0]!;
  const reportMonths = getQuarterMonths(yearEnd);

  const v = validateApplicationStatusTransition({
    fromStatus: appRow.status,
    toStatus: 'committed',
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const prevMeta =
    appRow.pipeline_metadata && typeof appRow.pipeline_metadata === 'object'
      ? (appRow.pipeline_metadata as Record<string, unknown>)
      : {};

  const { data: commitment, error: insErr } = await supabase
    .from('vc_commitments')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: applicationId,
      contract_id: c.id as string,
      fund_name: appRow.fund_name,
      manager_name: appRow.manager_name,
      fund_representative: fundRep,
      commitment_amount: Number(commitmentAmount),
      commitment_currency: commitmentCurrency,
      dbj_pro_rata_pct: Number(dbjProRata),
      fund_year_end_month: yearEnd,
      listed,
      quarterly_report_due_days: quarterlyDays,
      audit_report_due_days: auditDays,
      status: 'active',
      created_by: profile.profile_id,
    })
    .select('*')
    .single();

  if (insErr || !commitment) {
    return NextResponse.json({ error: insErr?.message ?? 'Failed to create commitment' }, { status: 500 });
  }

  const commitmentRow = commitment as {
    id: string;
    commitment_amount: number;
    dbj_pro_rata_pct: number;
  };

  const { data: portfolioFund, error: pfErr } = await supabase
    .from('vc_portfolio_funds')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: applicationId,
      commitment_id: commitmentRow.id,
      fund_name: appRow.fund_name,
      manager_name: appRow.manager_name,
      fund_representative: fundRep,
      currency: commitmentCurrency === 'USD' || commitmentCurrency === 'JMD' ? commitmentCurrency : 'JMD',
      total_fund_commitment: totalFund,
      dbj_commitment: commitmentRow.commitment_amount,
      dbj_pro_rata_pct: commitmentRow.dbj_pro_rata_pct,
      listed,
      year_end_month: yearEnd,
      quarterly_report_due_days: quarterlyDays,
      audit_report_due_days: auditDays,
      report_months: reportMonths,
      audit_month: yearEnd,
      commitment_date: commitmentDateStr,
      exchange_rate_jmd_usd: exRate,
      created_by: profile.profile_id,
    })
    .select('*')
    .single();

  if (pfErr || !portfolioFund) {
    await supabase.from('vc_commitments').delete().eq('tenant_id', profile.tenant_id).eq('id', commitmentRow.id);
    return NextResponse.json(
      { error: pfErr?.message ?? 'Failed to create portfolio fund record' },
      { status: 500 },
    );
  }

  try {
    await generateReportingObligations(supabase, portfolioFund as PortfolioFundRow);
  } catch (e) {
    await supabase.from('vc_portfolio_funds').delete().eq('tenant_id', profile.tenant_id).eq('id', (portfolioFund as { id: string }).id);
    await supabase.from('vc_commitments').delete().eq('tenant_id', profile.tenant_id).eq('id', commitmentRow.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to generate reporting obligations' },
      { status: 500 },
    );
  }

  const pipeline_metadata = {
    ...prevMeta,
    commitment_issued_at: new Date().toISOString(),
    commitment_id: (commitment as { id: string }).id,
  };

  const { error: upAppErr } = await supabase
    .from('vc_fund_applications')
    .update({ status: 'committed', pipeline_metadata })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId);

  if (upAppErr) {
    const pfId = (portfolioFund as { id: string }).id;
    await supabase.from('vc_reporting_obligations').delete().eq('tenant_id', profile.tenant_id).eq('fund_id', pfId);
    await supabase.from('vc_portfolio_funds').delete().eq('tenant_id', profile.tenant_id).eq('id', pfId);
    await supabase.from('vc_commitments').delete().eq('tenant_id', profile.tenant_id).eq('id', commitmentRow.id);
    return NextResponse.json({ error: upAppErr.message }, { status: 500 });
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'commitment_issued',
    afterState: { commitment_id: (commitment as { id: string }).id },
    ipAddress: clientIpFromRequest(req),
  });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'status_change',
    beforeState: { status: appRow.status },
    afterState: { status: 'committed' },
    ipAddress: clientIpFromRequest(req),
  });

  const { data: application } = await supabase
    .from('vc_fund_applications')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .maybeSingle();

  return NextResponse.json({
    commitment,
    application,
    portfolio_fund: portfolioFund,
  });
}
