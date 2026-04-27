import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id: assessmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { data: prev } = await supabase
    .from('vc_assessments')
    .select('status')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const { error } = await supabase
    .from('vc_assessments')
    .update({
      status: 'in_progress',
      completed_at: null,
      passed: null,
      recommendation: null,
      ai_narrative: null,
    })
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'assessment',
    entityId: assessmentId,
    action: 'status_changed',
    beforeState: { status: prev?.status ?? null },
    afterState: { status: 'in_progress' },
    metadata: { source: 'admin_unlock' },
  });

  return NextResponse.json({ ok: true, status: 'in_progress' });
}
