import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { parsePagination } from '@/lib/http/pagination';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ensureDealForApprovedApplication } from '@/lib/deals/from-application';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const { limit, offset } = parsePagination(req);

  let q = supabase
    .from('vc_deals')
    .select(
      'id, application_id, assessment_id, title, stage, assigned_officer, deal_value_usd, sector, geography, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('tenant_id', profile.tenant_id)
    .order('updated_at', { ascending: false });

  if (stage && stage !== 'all') {
    q = q.eq('stage', stage);
  }

  const { data: deals, error, count } = await q.range(offset, offset + limit - 1);
  if (error) return jsonError(sanitizeDbError(error), 500);

  const appIds = [...new Set((deals ?? []).map((d) => d.application_id))];
  const apps: Record<string, { fund_name: string; manager_name: string; status: string }> = {};
  if (appIds.length) {
    const { data: arows } = await supabase
      .from('vc_fund_applications')
      .select('id, fund_name, manager_name, status')
      .eq('tenant_id', profile.tenant_id)
      .in('id', appIds);
    for (const a of arows ?? []) {
      apps[a.id] = {
        fund_name: a.fund_name,
        manager_name: a.manager_name,
        status: a.status,
      };
    }
  }

  return NextResponse.json({
    deals: (deals ?? []).map((d) => ({
      ...d,
      application: apps[d.application_id] ?? null,
    })),
    total: count ?? 0,
    limit,
    offset,
  });
}

type PostBody = { application_id: string };

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:deals')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.application_id) {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status')
    .eq('id', body.application_id)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  if (app.status !== 'approved') {
    return NextResponse.json(
      { error: 'Application must be approved before opening a deal (use Approve for pipeline first)' },
      { status: 400 },
    );
  }

  const result = await ensureDealForApprovedApplication({
    supabase,
    tenantId: profile.tenant_id,
    applicationId: app.id,
    actorUserId: user.id,
    fundTitle: app.fund_name,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.created) {
    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'deal',
      entityId: result.deal_id,
      action: 'created',
      afterState: { application_id: app.id, source: 'api_deals_post' },
    });
  }

  return NextResponse.json({ deal_id: result.deal_id, created: result.created });
}
