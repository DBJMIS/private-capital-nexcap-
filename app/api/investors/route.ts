import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { parsePagination } from '@/lib/http/pagination';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { isUnderDeployed, utilizationPercent } from '@/lib/investors/recompute-capital';
import type { InvestorType } from '@/lib/investors/types';
import { INVESTOR_TYPES } from '@/lib/investors/types';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

function enrich(row: {
  id: string;
  committed_capital_usd: number;
  deployed_capital_usd: number;
  investor_type: string;
  country: string | null;
  name: string;
}) {
  const c = Number(row.committed_capital_usd);
  const d = Number(row.deployed_capital_usd);
  const util = utilizationPercent(c, d);
  const under = isUnderDeployed(c, d);
  return {
    ...row,
    committed_capital_usd: c,
    deployed_capital_usd: d,
    utilization_percent: util,
    flags: under ? ['under_deployed'] : [],
  };
}

export async function GET(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const country = searchParams.get('country')?.trim();
  const minUtil = searchParams.get('min_util');
  const maxUtil = searchParams.get('max_util');
  const utilFiltered =
    (minUtil != null && minUtil !== '') || (maxUtil != null && maxUtil !== '');
  const { limit, offset } = parsePagination(req);

  let q = utilFiltered
    ? supabase.from('vc_investors').select('*').eq('tenant_id', profile.tenant_id).order('name', { ascending: true })
    : supabase
        .from('vc_investors')
        .select('*', { count: 'exact' })
        .eq('tenant_id', profile.tenant_id)
        .order('name', { ascending: true });

  if (type && INVESTOR_TYPES.includes(type as InvestorType)) {
    q = q.eq('investor_type', type);
  }
  if (country) {
    q = q.ilike('country', `%${country}%`);
  }

  const { data: rows, error, count } = utilFiltered
    ? await q.limit(2000)
    : await q.range(offset, offset + limit - 1);
  if (error) return jsonError(sanitizeDbError(error), 500);

  let list = (rows ?? []).map((r) =>
    enrich(
      r as {
        id: string;
        committed_capital_usd: number;
        deployed_capital_usd: number;
        investor_type: string;
        country: string | null;
        name: string;
      },
    ),
  );

  const minU = minUtil != null && minUtil !== '' ? Number(minUtil) : null;
  const maxU = maxUtil != null && maxUtil !== '' ? Number(maxUtil) : null;
  if (minU != null && Number.isFinite(minU)) {
    list = list.filter((r) => r.utilization_percent != null && r.utilization_percent >= minU);
  }
  if (maxU != null && Number.isFinite(maxU)) {
    list = list.filter((r) => r.utilization_percent != null && r.utilization_percent <= maxU);
  }

  return NextResponse.json({
    investors: list,
    ...(utilFiltered ? { capped_at: 2000, note: 'Utilization filters load up to 2000 rows before client-side filter.' } : { total: count ?? list.length, limit, offset }),
  });
}

type PostBody = {
  name: string;
  investor_type: InvestorType;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

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

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!body.investor_type || !INVESTOR_TYPES.includes(body.investor_type)) {
    return NextResponse.json({ error: 'Valid investor_type is required' }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from('vc_investors')
    .insert({
      tenant_id: profile.tenant_id,
      name: body.name.trim(),
      investor_type: body.investor_type,
      country: body.country?.trim() || null,
      contact_name: body.contact_name?.trim() || null,
      contact_email: body.contact_email?.trim() || null,
      contact_phone: body.contact_phone?.trim() || null,
      committed_capital_usd: 0,
      deployed_capital_usd: 0,
    })
    .select('*')
    .single();

  if (error || !row) return jsonError(sanitizeDbError(error), 500);

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investor',
    entityId: row.id,
    action: 'created',
    afterState: { name: row.name, investor_type: row.investor_type },
  });

  return NextResponse.json({ investor: row });
}
