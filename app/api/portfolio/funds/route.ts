import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { generateReportingObligations, getQuarterMonths, refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';
import { fundComplianceBadge, summarizeCompliance, type ObligationLite } from '@/lib/portfolio/compliance';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'active';
  const currency = url.searchParams.get('currency');

  const supabase = createServerClient();
  await refreshObligationStatuses(supabase, profile.tenant_id);

  let q = supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('fund_name', { ascending: true });

  if (status && status !== 'all') {
    q = q.eq('fund_status', status);
  }
  if (currency === 'USD' || currency === 'JMD') {
    q = q.eq('currency', currency);
  }

  const { data: funds, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fundRows = (funds ?? []) as PortfolioFundRow[];
  const ids = fundRows.map((f) => f.id);
  let obligationsByFund = new Map<string, ObligationLite[]>();
  if (ids.length > 0) {
    const { data: obs } = await supabase
      .from('vc_reporting_obligations')
      .select('fund_id, report_type, status, due_date')
      .eq('tenant_id', profile.tenant_id)
      .in('fund_id', ids);
    for (const row of obs ?? []) {
      const r = row as { fund_id: string; report_type: string; status: string; due_date: string };
      const list = obligationsByFund.get(r.fund_id) ?? [];
      list.push({ report_type: r.report_type, status: r.status, due_date: r.due_date });
      obligationsByFund.set(r.fund_id, list);
    }
  }

  const fundsOut = fundRows.map((f) => {
    const obs = obligationsByFund.get(f.id) ?? [];
    const summary = summarizeCompliance(obs);
    const badge = fundComplianceBadge(obs);
    return { fund: f, compliance: summary, compliance_badge: badge };
  });

  return NextResponse.json({ funds: fundsOut });
}

type ManualBody = {
  fund_name: string;
  manager_name: string;
  fund_representative?: string | null;
  currency?: 'USD' | 'JMD';
  total_fund_commitment: number;
  dbj_commitment: number;
  dbj_pro_rata_pct: number;
  listed?: boolean;
  year_end_month: number;
  quarterly_report_due_days?: number;
  audit_report_due_days?: number;
  exchange_rate_jmd_usd?: number;
  commitment_date?: string;
};

export async function POST(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: ManualBody;
  try {
    body = (await req.json()) as ManualBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = String(body.fund_name ?? '').trim();
  const mgr = String(body.manager_name ?? '').trim();
  if (!name || !mgr) {
    return NextResponse.json({ error: 'fund_name and manager_name are required' }, { status: 400 });
  }
  const ye = Number(body.year_end_month);
  if (!Number.isInteger(ye) || ye < 1 || ye > 12) {
    return NextResponse.json({ error: 'year_end_month must be 1–12' }, { status: 400 });
  }
  const cur = body.currency === 'USD' || body.currency === 'JMD' ? body.currency : 'USD';
  const tf = Number(body.total_fund_commitment);
  const dc = Number(body.dbj_commitment);
  const pr = Number(body.dbj_pro_rata_pct);
  if (!Number.isFinite(tf) || tf < 0 || !Number.isFinite(dc) || dc < 0 || !Number.isFinite(pr)) {
    return NextResponse.json({ error: 'Invalid financial fields' }, { status: 400 });
  }

  const qd = body.quarterly_report_due_days ?? 45;
  const ad = body.audit_report_due_days ?? 90;
  const ex = body.exchange_rate_jmd_usd ?? 157.0;
  const cd = body.commitment_date?.trim() || new Date().toISOString().split('T')[0]!;

  const reportMonths = getQuarterMonths(ye);

  const supabase = createServerClient();
  const { data: row, error } = await supabase
    .from('vc_portfolio_funds')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: null,
      commitment_id: null,
      fund_name: name,
      manager_name: mgr,
      fund_representative: body.fund_representative ?? null,
      currency: cur,
      total_fund_commitment: tf,
      dbj_commitment: dc,
      dbj_pro_rata_pct: pr,
      listed: Boolean(body.listed),
      year_end_month: ye,
      quarterly_report_due_days: Math.max(1, Math.min(120, Math.floor(qd))),
      audit_report_due_days: Math.max(1, Math.min(365, Math.floor(ad))),
      report_months: reportMonths,
      audit_month: ye,
      commitment_date: cd,
      exchange_rate_jmd_usd: ex,
      created_by: profile.profile_id,
    })
    .select('*')
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  await generateReportingObligations(supabase, row as PortfolioFundRow);
  await refreshObligationStatuses(supabase, profile.tenant_id);

  return NextResponse.json({ fund: row });
}
