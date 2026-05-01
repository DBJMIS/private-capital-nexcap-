import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { byTypeTotals, nextCumulative, RETURN_TYPES } from '@/lib/portfolio/distributions';
import { num } from '@/lib/portfolio/capital-calls';
import type { VcDistribution } from '@/types/database';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  distribution_number: z.number().int().positive(),
  distribution_date: z.string().min(1),
  return_type: z.enum(RETURN_TYPES),
  amount: z.number().finite().positive(),
  currency: z.enum(['USD', 'JMD']),
  units: z.number().finite().positive().optional().nullable(),
  per_unit_amount: z.number().finite().positive().optional().nullable(),
  source_company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reference_number: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

function isValidDateString(value: string): boolean {
  const dt = new Date(value);
  return !Number.isNaN(dt.getTime());
}

async function syncCumulativeTotals(tenantId: string, fundId: string) {
  const supabase = createServerClient();
  const { data: rowsRaw, error: rErr } = await supabase
    .from('vc_distributions')
    .select('id, distribution_number, amount')
    .eq('tenant_id', tenantId)
    .eq('fund_id', fundId)
    .order('distribution_number', { ascending: true });

  if (rErr) throw new Error(rErr.message);
  const rows = (rowsRaw ?? []) as Pick<VcDistribution, 'id' | 'distribution_number' | 'amount'>[];

  let running = 0;
  for (const row of rows) {
    running += num(row.amount);
    const { error: uErr } = await supabase
      .from('vc_distributions')
      .update({ cumulative_total: running })
      .eq('tenant_id', tenantId)
      .eq('id', row.id);
    if (uErr) throw new Error(uErr.message);
  }
}

function buildSummary(rows: VcDistribution[], commitment: number, currency: string) {
  const total_amount = rows.reduce((sum, row) => sum + num(row.amount), 0);
  const by_type = byTypeTotals(rows);
  const yield_pct = commitment > 0 ? Math.round((total_amount / commitment) * 1000) / 10 : 0;
  return {
    total_distributions: rows.length,
    total_amount,
    currency,
    by_type,
    yield_pct,
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
    .select('id, currency, dbj_commitment')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rowsRaw, error: dErr } = await supabase
    .from('vc_distributions')
    .select(
      'id, fund_id, distribution_number, distribution_date, return_type, amount, currency, units, per_unit_amount, cumulative_total, source_company, reference_number, notes, created_at, updated_at',
    )
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('distribution_number', { ascending: true });
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const distributions = (rowsRaw ?? []) as VcDistribution[];
  const summary = buildSummary(distributions, num(fund.dbj_commitment), fund.currency as string);
  return NextResponse.json({ distributions, summary });
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
    if (!isValidDateString(body.distribution_date)) {
      return NextResponse.json({ error: 'Invalid distribution_date' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: fund, error: fErr } = await supabase
      .from('vc_portfolio_funds')
      .select('id, currency, dbj_commitment')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', fundId)
      .maybeSingle();
    if (fErr) {
      console.error('[distributions:fund]', fErr);
      return NextResponse.json({ error: 'Failed to load fund' }, { status: 500 });
    }
    if (!fund) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const fundCurrency = fund.currency as string;
    if (body.currency !== fundCurrency) {
      return NextResponse.json({ error: 'currency must match fund currency' }, { status: 400 });
    }

    const { data: dup } = await supabase
      .from('vc_distributions')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .eq('distribution_number', body.distribution_number)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: 'distribution_number already exists for this fund' }, { status: 409 });
    }

    const { data: existingRows } = await supabase
      .from('vc_distributions')
      .select('distribution_number, amount')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId);

    const cumulative_total = nextCumulative(existingRows ?? [], body.distribution_number, body.amount);

    const { data: inserted, error: iErr } = await supabase
      .from('vc_distributions')
      .insert({
        tenant_id: profile.tenant_id,
        fund_id: fundId,
        distribution_number: body.distribution_number,
        distribution_date: body.distribution_date,
        return_type: body.return_type,
        amount: body.amount,
        currency: fundCurrency,
        units: body.units ?? null,
        per_unit_amount: body.per_unit_amount ?? null,
        cumulative_total,
        source_company: body.source_company?.trim() || null,
        notes: body.notes?.trim() || null,
        reference_number: body.reference_number?.trim() || null,
        created_by: profile.profile_id,
      })
      .select(
        'id, fund_id, distribution_number, distribution_date, return_type, amount, currency, units, per_unit_amount, cumulative_total, source_company, reference_number, notes, created_at, updated_at',
      )
      .single();
    if (iErr || !inserted) {
      console.error('[distributions:insert]', iErr);
      return NextResponse.json({ error: 'Failed to create distribution' }, { status: 500 });
    }

    try {
      await syncCumulativeTotals(profile.tenant_id, fundId);
    } catch (e) {
      console.error('[distributions:cumulative]', e);
      return NextResponse.json({ error: 'Failed to update cumulative totals' }, { status: 500 });
    }

    const { data: created, error: rErr } = await supabase
      .from('vc_distributions')
      .select(
        'id, fund_id, distribution_number, distribution_date, return_type, amount, currency, units, per_unit_amount, cumulative_total, source_company, reference_number, notes, created_at, updated_at',
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('id', inserted.id)
      .single();
    if (rErr || !created) {
      console.error('[distributions:reload]', rErr);
      return NextResponse.json({ error: 'Failed to load created row' }, { status: 500 });
    }

    return NextResponse.json({ distribution: created }, { status: 201 });
  } catch (error) {
    console.error('[distributions:post]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
