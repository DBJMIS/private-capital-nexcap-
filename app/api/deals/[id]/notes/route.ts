import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: dealId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:deals')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { body?: string };
  try {
    body = (await req.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'body text required' }, { status: 400 });

  const { data: deal } = await supabase
    .from('vc_deals')
    .select('id')
    .eq('id', dealId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const { data: row, error } = await supabase
    .from('vc_deal_notes')
    .insert({
      tenant_id: profile.tenant_id,
      deal_id: dealId,
      body: text,
      author_id: user.id,
    })
    .select('id, body, author_id, created_at')
    .single();

  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'deal',
    entityId: dealId,
    action: 'note_added',
    afterState: { note_id: row.id },
    metadata: { note_preview: text.slice(0, 200) },
  });

  return NextResponse.json({ note: { ...row, author_name: profile.full_name } });
}
