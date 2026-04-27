import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type PatchBody = {
  title?: string;
  description?: string | null;
  assigned_to?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  due_date?: string | null;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('vc_tasks')
    .select('id, created_by, assigned_to, status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isWriter = can(profile, 'write:applications');
  const isAssignee = existing.assigned_to === user.id;
  const isCreator = existing.created_by === user.id;

  if (!isWriter && !isAssignee && !isCreator) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.assigned_to !== undefined && (isWriter || isCreator)) patch.assigned_to = body.assigned_to;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.completed_at = body.status === 'completed' ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from('vc_tasks')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });

  return NextResponse.json({ task: row });
}
