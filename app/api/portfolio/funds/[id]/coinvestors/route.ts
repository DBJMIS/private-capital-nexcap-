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

const postSchema = z
  .object({
    investor_name: z.string().min(1),
    investor_type: z.enum(INVESTOR_TYPES),
    investor_country: z.string().optional().nullable(),
    commitment_amount: z.number().finite().nonnegative().optional().nullable(),
    currency: z.enum(['USD', 'JMD']).optional(),
    commitment_date: z.string().nullable().optional(),
    notes: z.string().optional().nullable(),
  })
  .strict();

type Ctx = { params: Promise<{ id: string }> };

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
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
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_fund_coinvestors')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('commitment_amount', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ coinvestors: (rows ?? []) as VcFundCoinvestor[] });
}

export async function POST(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
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

  if (body.commitment_date != null && body.commitment_date !== '' && !isValidDateOnly(body.commitment_date)) {
    return NextResponse.json({ error: 'Invalid commitment_date' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: fund, error: fundErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fundErr) return NextResponse.json({ error: fundErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const insert = {
    tenant_id: profile.tenant_id,
    fund_id: fundId,
    investor_name: body.investor_name.trim(),
    investor_type: body.investor_type,
    investor_country: body.investor_country?.trim() || null,
    commitment_amount: body.commitment_amount ?? null,
    currency: body.currency ?? 'USD',
    commitment_date:
      body.commitment_date === '' || body.commitment_date == null ? null : body.commitment_date,
    notes: body.notes?.trim() || null,
    created_by: profile.profile_id,
  };

  const { data: created, error } = await supabase.from('vc_fund_coinvestors').insert(insert).select('*').maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!created) return NextResponse.json({ error: 'Failed to create' }, { status: 500 });

  return NextResponse.json({ coinvestor: created as VcFundCoinvestor });
}
