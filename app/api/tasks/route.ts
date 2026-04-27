import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { parsePagination } from '@/lib/http/pagination';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { notifyTaskAssigned } from '@/lib/workflow/notify-stub';
import { scheduleAuditLog } from '@/lib/audit/log';
import { taskCreateBodySchema } from '@/lib/validation/api-schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view');
  const { limit, offset } = parsePagination(req);

  let q = supabase.from('vc_tasks').select('*').eq('tenant_id', profile.tenant_id);

  if (view === 'my_open') {
    q = q.eq('assigned_to', user.id).in('status', ['pending', 'in_progress']).order('due_date', { ascending: true });
  } else if (view === 'assigned_by_me') {
    q = q
      .eq('created_by', user.id)
      .neq('assigned_to', user.id)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false });
  } else {
    q = q.order('created_at', { ascending: false });
  }

  const { data: rows, error } = await q.range(offset, offset + limit - 1);

  if (error) return jsonError(sanitizeDbError(error), 500);

  return NextResponse.json({ tasks: rows ?? [], limit, offset });
}

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const parsed = taskCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body', 400, 'validation_error');
  }
  const body = parsed.data;

  const priority = body.priority ?? 'medium';

  const { data: row, error } = await supabase
    .from('vc_tasks')
    .insert({
      tenant_id: profile.tenant_id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      title: body.title.trim(),
      description: body.description ?? null,
      assigned_to: body.assigned_to,
      priority,
      due_date: body.due_date ?? null,
      created_by: user.id,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !row) return jsonError(sanitizeDbError(error), 500);

  await notifyTaskAssigned({ tenantId: profile.tenant_id, taskId: row.id });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'task',
    entityId: row.id,
    action: 'created',
    afterState: { title: row.title, assigned_to: row.assigned_to, status: row.status },
    metadata: { entity_type: row.entity_type, entity_id: row.entity_id },
  });

  return NextResponse.json({ task: row });
}
