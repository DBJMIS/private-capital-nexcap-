import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { num } from '@/lib/portfolio/capital-calls';
import type { VcDistribution } from '@/types/database';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  distribution_number: z.number().int().positive().optional(),
  distribution_date: z.string().min(1).optional(),
  return_type: z.enum(['dividend', 'return_of_capital', 'capital_gain', 'interest', 'other']).optional(),
  amount: z.number().finite().positive().optional(),
  currency: z.enum(['USD', 'JMD']).optional(),
  units: z.number().finite().positive().optional().nullable(),
  per_unit_amount: z.number().finite().positive().optional().nullable(),
  source_company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reference_number: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string; distId: string }> };

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

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId, distId } = await ctx.params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
    return NextResponse.json({ error: 'Validation failed', details: msg }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, currency')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fErr || !fund) {
    return NextResponse.json({ error: fErr?.message ?? 'Not found' }, { status: fErr ? 500 : 404 });
  }

  const { data: existing, error: eErr } = await supabase
    .from('vc_distributions')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', distId)
    .maybeSingle();
  if (eErr || !existing) {
    return NextResponse.json({ error: eErr?.message ?? 'Not found' }, { status: eErr ? 500 : 404 });
  }

  if (body.currency && body.currency !== fund.currency) {
    return NextResponse.json({ error: 'currency must match fund currency' }, { status: 400 });
  }

  if (body.distribution_number !== undefined && body.distribution_number !== existing.distribution_number) {
    const { data: dup } = await supabase
      .from('vc_distributions')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .eq('distribution_number', body.distribution_number)
      .neq('id', distId)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: 'distribution_number already exists for this fund' }, { status: 409 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.distribution_number !== undefined) patch.distribution_number = body.distribution_number;
  if (body.distribution_date !== undefined) patch.distribution_date = body.distribution_date;
  if (body.return_type !== undefined) patch.return_type = body.return_type;
  if (body.amount !== undefined) patch.amount = body.amount;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.units !== undefined) patch.units = body.units;
  if (body.per_unit_amount !== undefined) patch.per_unit_amount = body.per_unit_amount;
  if (body.source_company !== undefined) patch.source_company = body.source_company?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.reference_number !== undefined) patch.reference_number = body.reference_number?.trim() || null;

  const { error: uErr } = await supabase
    .from('vc_distributions')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', distId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  try {
    await syncCumulativeTotals(profile.tenant_id, fundId);
  } catch (e) {
    return logAndReturn(e, 'distributions/cumulative-totals', 'INTERNAL_ERROR', 'Failed to update distribution', 500);
  }

  const { data: updated, error: rErr } = await supabase
    .from('vc_distributions')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', distId)
    .single();
  if (rErr || !updated) {
    return NextResponse.json({ error: rErr?.message ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ distribution: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId, distId } = await ctx.params;
  const supabase = createServerClient();

  const { data: existing, error: eErr } = await supabase
    .from('vc_distributions')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', distId)
    .maybeSingle();
  if (eErr || !existing) {
    return NextResponse.json({ error: eErr?.message ?? 'Not found' }, { status: eErr ? 500 : 404 });
  }

  const { error: dErr } = await supabase
    .from('vc_distributions')
    .delete()
    .eq('tenant_id', profile.tenant_id)
    .eq('id', distId);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  try {
    await syncCumulativeTotals(profile.tenant_id, fundId);
  } catch (e) {
    return logAndReturn(e, 'distributions/cumulative-totals-2', 'INTERNAL_ERROR', 'Failed to update distribution', 500);
  }

  return NextResponse.json({ deleted: true });
}
