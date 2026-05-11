import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

const fundSizeStatuses = ['confirmed', 'estimated', 'sole_investor', 'not_applicable', 'unknown'] as const;

const patchSchema = z
  .object({
    total_fund_commitment: z.number().finite().nonnegative().optional(),
    fund_size_status: z.enum(fundSizeStatuses).nullable().optional(),
    fund_close_lp_count: z.number().int().nonnegative().nullable().optional(),
    fund_close_date_actual: z.string().nullable().optional(),
  })
  .strict();

type Ctx = { params: Promise<{ id: string }> };

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}

const SELECT_FIELDS =
  'fund_size_status, total_fund_commitment, dbj_commitment, dbj_pro_rata_pct, fund_close_lp_count, fund_close_date_actual, exchange_rate_jmd_usd, currency' as const;

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error } = await supabase
    .from('vc_portfolio_funds')
    .select(SELECT_FIELDS)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(fund);
}

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (profile.role !== 'admin' && profile.role !== 'pctu_officer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
    return NextResponse.json({ error: 'Validation failed', details: msg }, { status: 400 });
  }

  if (
    body.fund_close_date_actual != null &&
    body.fund_close_date_actual !== '' &&
    !isValidDateOnly(body.fund_close_date_actual)
  ) {
    return NextResponse.json({ error: 'Invalid fund_close_date_actual' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.total_fund_commitment !== undefined) patch.total_fund_commitment = body.total_fund_commitment;
  if (body.fund_size_status !== undefined) patch.fund_size_status = body.fund_size_status;
  if (body.fund_close_lp_count !== undefined) patch.fund_close_lp_count = body.fund_close_lp_count;
  if (body.fund_close_date_actual !== undefined) {
    patch.fund_close_date_actual =
      body.fund_close_date_actual === '' || body.fund_close_date_actual === null ? null : body.fund_close_date_actual;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No allowed fields to update' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: updated, error } = await supabase
    .from('vc_portfolio_funds')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .select(SELECT_FIELDS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}
