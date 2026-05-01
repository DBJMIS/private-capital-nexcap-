import { NextResponse } from 'next/server';
import { z } from 'zod';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { DIVESTMENT_SELECT, DIVESTMENT_STATUSES, DIVESTMENT_TYPES } from '@/lib/portfolio/divestments';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  company_name: z.string().min(1).optional(),
  divestment_type: z.enum(DIVESTMENT_TYPES).optional(),
  completion_date: z.string().optional(),
  announcement_date: z.string().nullable().optional(),
  original_investment_amount: z.number().positive().optional(),
  proceeds_received: z.number().min(0).optional(),
  currency: z.enum(['USD', 'JMD']).optional(),
  is_full_exit: z.boolean().optional(),
  remaining_stake_pct: z.number().min(0).max(100).nullable().optional(),
  exit_route: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  buyer_name: z.string().nullable().optional(),
  status: z.enum(DIVESTMENT_STATUSES).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    const details = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
    return NextResponse.json({ error: 'Validation failed', details }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: current, error: findErr } = await supabase
    .from('vc_divestments')
    .select('id, fund_id, currency, divestment_type')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();
  if (findErr || !current) return NextResponse.json({ error: findErr?.message ?? 'Not found' }, { status: findErr ? 500 : 404 });

  const nextType = body.divestment_type ?? (current as { divestment_type: string }).divestment_type;
  const nextRemaining = body.remaining_stake_pct;
  if (nextType === 'partial_exit' && nextRemaining === undefined) {
    return NextResponse.json({ error: 'remaining_stake_pct is required for partial_exit updates' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.company_name !== undefined) patch.company_name = body.company_name.trim();
  if (body.divestment_type !== undefined) patch.divestment_type = body.divestment_type;
  if (body.completion_date !== undefined) patch.completion_date = body.completion_date;
  if (body.announcement_date !== undefined) patch.announcement_date = body.announcement_date;
  if (body.original_investment_amount !== undefined) patch.original_investment_amount = body.original_investment_amount;
  if (body.proceeds_received !== undefined) patch.proceeds_received = body.proceeds_received;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.is_full_exit !== undefined) patch.is_full_exit = body.is_full_exit;
  if (body.remaining_stake_pct !== undefined) patch.remaining_stake_pct = body.remaining_stake_pct;
  if (body.exit_route !== undefined) patch.exit_route = body.exit_route?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.buyer_name !== undefined) patch.buyer_name = body.buyer_name?.trim() || null;
  if (body.status !== undefined) patch.status = body.status;

  const { data: updated, error } = await supabase
    .from('vc_divestments')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .select(DIVESTMENT_SELECT)
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });

  return NextResponse.json({ divestment: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const { error } = await supabase
    .from('vc_divestments')
    .update({ status: 'cancelled' })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
