import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  aggregateItems,
  buildCallsWithItems,
  computeRunningForNotice,
  num,
} from '@/lib/portfolio/capital-calls';
import type { VcCapitalCall, VcCapitalCallItem } from '@/types/database';

export const dynamic = 'force-dynamic';

const PURPOSES = [
  'management_fee',
  'organisation_expenses',
  'administration_fee',
  'legal_fees',
  'director_fees',
  'regulatory_expenses',
  'other_fees',
  'investment',
] as const;

const itemSchema = z.object({
  purpose_category: z.enum(PURPOSES),
  investee_company: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  amount: z.number().finite().positive(),
  sort_order: z.number().int().nonnegative(),
});

const postSchema = z.object({
  notice_number: z.number().int().positive(),
  date_of_notice: z.string().min(1),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

type Ctx = { params: Promise<{ id: string }> };

function isValidDateString(value: string): boolean {
  const dt = new Date(value);
  return !Number.isNaN(dt.getTime());
}

function summaryFromCalls(
  calls: VcCapitalCall[],
  items: VcCapitalCallItem[],
  fund: { dbj_commitment: unknown; currency: string },
) {
  const dbj = num(fund.dbj_commitment);
  const sorted = [...calls].sort((a, b) => a.notice_number - b.notice_number);
  const last = sorted[sorted.length - 1];
  const total_called =
    last?.total_called_to_date != null ? num(last.total_called_to_date) : sorted.reduce((s, c) => s + num(c.call_amount), 0);
  const remaining =
    last?.remaining_commitment != null ? num(last.remaining_commitment) : Math.max(0, dbj - total_called);
  const pct_deployed = dbj > 0 ? Math.round((total_called / dbj) * 1000) / 10 : 0;

  const allItems = items;
  const { fees_total, investments_total } = aggregateItems(allItems);

  const total_paid = sorted.filter((c) => c.status === 'paid').reduce((s, c) => s + num(c.call_amount), 0);

  return {
    total_calls: calls.length,
    total_called,
    total_paid,
    remaining_commitment: remaining,
    pct_deployed,
    fees_total,
    investments_total,
    currency: fund.currency,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, dbj_commitment, currency, exchange_rate_jmd_usd')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: callsRaw, error: cErr } = await supabase
    .from('vc_capital_calls')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('notice_number', { ascending: true });

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const calls = (callsRaw ?? []) as VcCapitalCall[];
  const ids = calls.map((c) => c.id);

  let items: VcCapitalCallItem[] = [];
  if (ids.length > 0) {
    const { data: itemsRaw, error: iErr } = await supabase
      .from('vc_capital_call_items')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('capital_call_id', ids)
      .order('sort_order', { ascending: true });
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
    items = (itemsRaw ?? []) as VcCapitalCallItem[];
  }

  const withItems = buildCallsWithItems(calls, items);
  const summary = summaryFromCalls(calls, items, fund);

  return NextResponse.json({ calls: withItems, summary });
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !can(profile, 'write:applications')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (profile.role !== 'admin' && profile.role !== 'pctu_officer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id: fundId } = await ctx.params;
    if (!z.string().uuid().safeParse(fundId).success) {
      return NextResponse.json({ error: 'Invalid fund id' }, { status: 400 });
    }

    let body: z.infer<typeof postSchema>;
    try {
      body = postSchema.parse(await req.json());
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
      return NextResponse.json({ error: 'Validation failed', details: msg }, { status: 400 });
    }
    if (!isValidDateString(body.date_of_notice)) {
      return NextResponse.json({ error: 'Invalid date_of_notice' }, { status: 400 });
    }
    if (body.due_date && !isValidDateString(body.due_date)) {
      return NextResponse.json({ error: 'Invalid due_date' }, { status: 400 });
    }

    for (const it of body.items) {
      if (it.purpose_category === 'investment' && !String(it.investee_company ?? '').trim()) {
        return NextResponse.json({ error: 'investee_company required for investment line items' }, { status: 400 });
      }
    }

    const supabase = createServerClient();
    const { data: fund, error: fErr } = await supabase
      .from('vc_portfolio_funds')
      .select('id, currency, dbj_commitment')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', fundId)
      .maybeSingle();

    if (fErr) {
      console.error('[capital-calls:fund]', fErr);
      return NextResponse.json({ error: 'Failed to load fund' }, { status: 500 });
    }
    if (!fund) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const fundCurrency = fund.currency as string;
    const call_amount = body.items.reduce((s, it) => s + it.amount, 0);

    const { data: dup } = await supabase
      .from('vc_capital_calls')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .eq('notice_number', body.notice_number)
      .maybeSingle();

    if (dup) {
      return NextResponse.json({ error: 'notice_number already exists for this fund' }, { status: 409 });
    }

    const { data: existingRows } = await supabase
      .from('vc_capital_calls')
      .select('notice_number, call_amount')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId);

    const existing = (existingRows ?? []) as Pick<VcCapitalCall, 'notice_number' | 'call_amount'>[];
    const { total_called_to_date, remaining_commitment } = computeRunningForNotice(
      existing,
      body.notice_number,
      call_amount,
      num(fund.dbj_commitment),
    );

    const { data: created, error: insErr } = await supabase
      .from('vc_capital_calls')
      .insert({
        tenant_id: profile.tenant_id,
        fund_id: fundId,
        notice_number: body.notice_number,
        date_of_notice: body.date_of_notice,
        due_date: body.due_date ?? null,
        date_paid: null,
        call_amount,
        currency: fundCurrency,
        total_called_to_date,
        remaining_commitment,
        status: 'unpaid',
        notes: body.notes?.trim() || null,
        created_by: profile.profile_id,
      })
      .select('*')
      .single();

    if (insErr || !created) {
      console.error('[capital-calls:insert]', insErr);
      return NextResponse.json({ error: 'Failed to create capital call' }, { status: 500 });
    }

    const call = created as VcCapitalCall;
    const itemRows: VcCapitalCallItem[] = [];
    for (const it of body.items) {
      const { data: row, error: itemErr } = await supabase
        .from('vc_capital_call_items')
        .insert({
          tenant_id: profile.tenant_id,
          capital_call_id: call.id,
          purpose_category: it.purpose_category,
          investee_company: it.investee_company?.trim() || null,
          description: it.description?.trim() || null,
          amount: it.amount,
          currency: fundCurrency,
          sort_order: it.sort_order,
        })
        .select('*')
        .single();
      if (itemErr || !row) {
        await supabase.from('vc_capital_calls').delete().eq('id', call.id).eq('tenant_id', profile.tenant_id);
        console.error('[capital-calls:item-insert]', itemErr);
        return NextResponse.json({ error: 'Failed to create capital call items' }, { status: 500 });
      }
      itemRows.push(row as VcCapitalCallItem);
    }

    return NextResponse.json({ call: { ...call, items: itemRows } }, { status: 201 });
  } catch (error) {
    console.error('[capital-calls:post]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
