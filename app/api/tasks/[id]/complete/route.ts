import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: existing } = await supabase
    .from('vc_tasks')
    .select('id, assigned_to, created_by, status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    return NextResponse.json({ error: 'Task is already closed' }, { status: 400 });
  }

  if (existing.assigned_to !== user.id && existing.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from('vc_tasks')
    .update({
      status: 'completed',
      completed_at: now,
    })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'task',
    entityId: id,
    action: 'completed',
    beforeState: { status: existing.status },
    afterState: { status: 'completed', completed_at: now },
  });

  return NextResponse.json({ task: row });
}
