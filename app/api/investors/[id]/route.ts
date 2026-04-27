import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { isUnderDeployed, utilizationPercent } from '@/lib/investors/recompute-capital';
import type { InvestorType } from '@/lib/investors/types';
import { INVESTOR_TYPES } from '@/lib/investors/types';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: row, error } = await supabase
    .from('vc_investors')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const c = Number(row.committed_capital_usd);
  const d = Number(row.deployed_capital_usd);
  const util = utilizationPercent(c, d);
  const under = isUnderDeployed(c, d);

  return NextResponse.json({
    investor: {
      ...row,
      utilization_percent: util,
      flags: under ? ['under_deployed'] : [],
    },
  });
}

type PatchBody = {
  name?: string;
  investor_type?: InvestorType;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.investor_type !== undefined) {
    if (!INVESTOR_TYPES.includes(body.investor_type)) {
      return NextResponse.json({ error: 'Invalid investor_type' }, { status: 400 });
    }
    patch.investor_type = body.investor_type;
  }
  if (body.country !== undefined) patch.country = body.country?.trim() || null;
  if (body.contact_name !== undefined) patch.contact_name = body.contact_name?.trim() || null;
  if (body.contact_email !== undefined) patch.contact_email = body.contact_email?.trim() || null;
  if (body.contact_phone !== undefined) patch.contact_phone = body.contact_phone?.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }

  const { data: prior } = await supabase
    .from('vc_investors')
    .select('name, investor_type, country, contact_name, contact_email, contact_phone')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const { data: row, error } = await supabase
    .from('vc_investors')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investor',
    entityId: id,
    action: 'updated',
    beforeState: (prior ?? undefined) as Record<string, unknown> | undefined,
    afterState: patch,
  });

  return NextResponse.json({ investor: row });
}
