import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { buildCallsWithItems } from '@/lib/portfolio/capital-calls';
import type { VcCapitalCall, VcCapitalCallItem } from '@/types/database';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  due_date: z.string().nullable().optional(),
  date_paid: z.string().nullable().optional(),
  status: z.enum(['unpaid', 'paid', 'partial', 'overdue', 'cancelled']).optional(),
  notes: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string; callId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId, callId } = await ctx.params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
    return NextResponse.json({ error: 'Validation failed', details: msg }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: row, error: rErr } = await supabase
    .from('vc_capital_calls')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', callId)
    .maybeSingle();

  if (rErr || !row) {
    return NextResponse.json({ error: rErr?.message ?? 'Not found' }, { status: rErr ? 500 : 404 });
  }

  const patch: Record<string, unknown> = {};
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status !== undefined) patch.status = body.status;
  if (body.date_paid !== undefined) {
    patch.date_paid = body.date_paid;
    if (body.date_paid) patch.status = 'paid';
  }

  const { data: updated, error: uErr } = await supabase
    .from('vc_capital_calls')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', callId)
    .select('*')
    .single();

  if (uErr || !updated) {
    return NextResponse.json({ error: uErr?.message ?? 'Update failed' }, { status: 500 });
  }

  const call = updated as VcCapitalCall;
  const { data: itemsRaw } = await supabase
    .from('vc_capital_call_items')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('capital_call_id', callId)
    .order('sort_order', { ascending: true });

  const items = (itemsRaw ?? []) as VcCapitalCallItem[];
  const [withItems] = buildCallsWithItems([call], items);
  return NextResponse.json({ call: withItems });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId, callId } = await ctx.params;
  const supabase = createServerClient();

  const { data: row, error: rErr } = await supabase
    .from('vc_capital_calls')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', callId)
    .maybeSingle();

  if (rErr || !row) {
    return NextResponse.json({ error: rErr?.message ?? 'Not found' }, { status: rErr ? 500 : 404 });
  }

  if (row.status !== 'unpaid') {
    return NextResponse.json({ error: 'Only unpaid calls can be deleted' }, { status: 400 });
  }

  const { error: dErr } = await supabase.from('vc_capital_calls').delete().eq('tenant_id', profile.tenant_id).eq('id', callId);

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
