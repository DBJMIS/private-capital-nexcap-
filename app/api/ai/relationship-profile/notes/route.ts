import { NextResponse } from 'next/server';
import { z } from 'zod';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  fund_manager_id: z.string().uuid(),
  note: z.string().trim().min(1).max(5000),
});

export async function POST(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bodyRaw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(bodyRaw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const supabase = createServerClient();
  const { data: manager, error: managerErr } = await supabase
    .from('fund_managers')
    .select('id')
    .eq('id', parsed.data.fund_manager_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();
  if (managerErr) return NextResponse.json({ error: managerErr.message }, { status: 500 });
  if (!manager) return NextResponse.json({ error: 'Fund manager not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('fund_manager_notes')
    .insert({
      tenant_id: profile.tenant_id,
      fund_manager_id: parsed.data.fund_manager_id,
      note: parsed.data.note,
      added_by: profile.user_id,
    })
    .select('id, fund_manager_id, note, added_by, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to add note' }, { status: 500 });

  void fetch(`${new URL(req.url).origin}/api/ai/relationship-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({ fund_manager_id: parsed.data.fund_manager_id }),
  }).catch(() => {});

  return NextResponse.json({ note: data });
}
