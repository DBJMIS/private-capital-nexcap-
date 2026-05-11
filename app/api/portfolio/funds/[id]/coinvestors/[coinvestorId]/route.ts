import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { VcFundCoinvestor } from '@/types/database';

export const dynamic = 'force-dynamic';

const INVESTOR_TYPES = [
  'DFI',
  'Commercial Bank',
  'Pension Fund',
  'Insurance Company',
  'Family Office',
  'Private Equity',
  'Government',
  'Other',
] as const;

const patchSchema = z
  .object({
    investor_name: z.string().min(1).optional(),
    investor_type: z.enum(INVESTOR_TYPES).optional(),
    investor_country: z.string().optional().nullable(),
    commitment_amount: z.number().finite().nonnegative().optional().nullable(),
    currency: z.enum(['USD', 'JMD']).optional(),
    commitment_date: z.string().nullable().optional(),
    notes: z.string().optional().nullable(),
  })
  .strict();

type Ctx = { params: Promise<{ id: string; coinvestorId: string }> };

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
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

  const { id: fundId, coinvestorId } = await ctx.params;
  if (!z.string().uuid().safeParse(fundId).success || !z.string().uuid().safeParse(coinvestorId).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
    return NextResponse.json({ error: 'Validation failed', details: msg }, { status: 400 });
  }

  if (body.commitment_date != null && body.commitment_date !== '' && !isValidDateOnly(body.commitment_date)) {
    return NextResponse.json({ error: 'Invalid commitment_date' }, { status: 400 });
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.investor_name !== undefined) patch.investor_name = body.investor_name.trim();
  if (body.investor_type !== undefined) patch.investor_type = body.investor_type;
  if (body.investor_country !== undefined) patch.investor_country = body.investor_country?.trim() || null;
  if (body.commitment_amount !== undefined) patch.commitment_amount = body.commitment_amount;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.commitment_date !== undefined) {
    patch.commitment_date = body.commitment_date === '' || body.commitment_date === null ? null : body.commitment_date;
  }
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const supabase = createServerClient();
  const { data: updated, error } = await supabase
    .from('vc_fund_coinvestors')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', coinvestorId)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ coinvestor: updated as VcFundCoinvestor });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (profile.role !== 'admin' && profile.role !== 'pctu_officer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId, coinvestorId } = await ctx.params;
  if (!z.string().uuid().safeParse(fundId).success || !z.string().uuid().safeParse(coinvestorId).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error, data } = await supabase
    .from('vc_fund_coinvestors')
    .delete()
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', coinvestorId)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
