import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { num, toUsdEquivalent } from '@/lib/portfolio/capital-calls';
import type { VcCapitalCall, VcCapitalCallItem } from '@/types/database';

export const dynamic = 'force-dynamic';

type FundRow = {
  id: string;
  fund_name: string;
  currency: string;
  dbj_commitment: unknown;
  exchange_rate_jmd_usd: unknown;
};

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const supabase = createServerClient();

  const { data: fundsRaw, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, fund_name, currency, dbj_commitment, exchange_rate_jmd_usd')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_status', 'active')
    .order('fund_name');

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  const funds = (fundsRaw ?? []) as FundRow[];
  const fundIds = funds.map((f) => f.id);
  if (fundIds.length === 0) {
    return NextResponse.json({
      funds: [],
      recent_calls: [],
      investment_line_items: [],
      kpi: {
        total_called_usd_equiv: 0,
        total_remaining_usd_equiv: 0,
        unpaid_calls_count: 0,
        investments_usd_equiv: 0,
      },
    });
  }

  const { data: callsRaw, error: cErr } = await supabase
    .from('vc_capital_calls')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .in('fund_id', fundIds);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const allCalls = (callsRaw ?? []) as VcCapitalCall[];
  const callIds = allCalls.map((c) => c.id);

  let allItems: VcCapitalCallItem[] = [];
  if (callIds.length > 0) {
    const { data: itemsRaw, error: iErr } = await supabase
      .from('vc_capital_call_items')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('capital_call_id', callIds);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
    allItems = (itemsRaw ?? []) as VcCapitalCallItem[];
  }

  const fundById = new Map(funds.map((f) => [f.id, f]));

  const fundSummaries = funds.map((f) => {
    const calls = allCalls.filter((c) => c.fund_id === f.id).sort((a, b) => a.notice_number - b.notice_number);
    const dbj = num(f.dbj_commitment);
    const rate = f.exchange_rate_jmd_usd != null ? num(f.exchange_rate_jmd_usd) : 157;
    const last = calls[calls.length - 1];
    const total_called =
      last?.total_called_to_date != null ? num(last.total_called_to_date) : calls.reduce((s, c) => s + num(c.call_amount), 0);
    const remaining =
      last?.remaining_commitment != null ? num(last.remaining_commitment) : Math.max(0, dbj - total_called);
    const pct_deployed = dbj > 0 ? Math.round((total_called / dbj) * 1000) / 10 : 0;

    const unpaid_calls = calls.filter((c) =>
      ['unpaid', 'partial', 'overdue'].includes(c.status),
    ).length;

    const last_call_date =
      calls.length === 0
        ? null
        : [...calls].sort((a, b) => (a.date_of_notice < b.date_of_notice ? 1 : -1))[0]!.date_of_notice;

    let status: 'current' | 'overdue' | 'pending' = 'current';
    if (calls.some((c) => c.status === 'overdue')) status = 'overdue';
    else if (calls.some((c) => ['unpaid', 'partial'].includes(c.status))) status = 'pending';

    return {
      fund_id: f.id,
      fund_name: f.fund_name,
      currency: f.currency,
      dbj_commitment: dbj,
      total_calls: calls.length,
      total_called,
      remaining_commitment: remaining,
      pct_deployed,
      unpaid_calls,
      last_call_date,
      status,
    };
  });

  const recent_calls = [...allCalls]
    .sort((a, b) => (a.date_of_notice < b.date_of_notice ? 1 : -1))
    .slice(0, 10)
    .map((c) => {
      const fund = fundById.get(c.fund_id);
      return {
        id: c.id,
        fund_id: c.fund_id,
        fund_name: fund?.fund_name ?? 'Fund',
        notice_number: c.notice_number,
        date_of_notice: c.date_of_notice,
        call_amount: num(c.call_amount),
        currency: c.currency,
        status: c.status,
      };
    });

  const callById = new Map(allCalls.map((c) => [c.id, c]));
  const investment_line_items = allItems
    .filter((it) => it.purpose_category === 'investment')
    .map((it) => {
      const call = callById.get(it.capital_call_id);
      const fund = call ? fundById.get(call.fund_id) : undefined;
      return {
        id: it.id,
        investee_company: it.investee_company,
        amount: num(it.amount),
        currency: it.currency,
        fund_id: call?.fund_id,
        fund_name: fund?.fund_name ?? '',
        date_of_notice: call?.date_of_notice ?? '',
      };
    })
    .sort((a, b) => (a.date_of_notice < b.date_of_notice ? 1 : -1));

  let total_called_usd_equiv = 0;
  let total_remaining_usd_equiv = 0;
  let investments_usd_equiv = 0;
  let unpaid_calls_count = 0;

  for (const fs of fundSummaries) {
    const fund = fundById.get(fs.fund_id)!;
    const rate = fund.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
    total_called_usd_equiv += toUsdEquivalent(fs.total_called, fs.currency, rate);
    total_remaining_usd_equiv += toUsdEquivalent(fs.remaining_commitment, fs.currency, rate);
  }

  unpaid_calls_count = allCalls.filter((c) => ['unpaid', 'partial', 'overdue'].includes(c.status)).length;

  for (const it of allItems) {
    if (it.purpose_category !== 'investment') continue;
    const call = callById.get(it.capital_call_id);
    const fund = call ? fundById.get(call.fund_id) : undefined;
    const rate = fund?.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
    investments_usd_equiv += toUsdEquivalent(num(it.amount), it.currency, rate);
  }

  return NextResponse.json({
    funds: fundSummaries,
    recent_calls,
    investment_line_items,
    kpi: {
      total_called_usd_equiv,
      total_remaining_usd_equiv,
      unpaid_calls_count,
      investments_usd_equiv,
    },
  });
}
