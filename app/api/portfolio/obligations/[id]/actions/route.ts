import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = createServerClient();

  const { data: ob, error: oErr } = await supabase
    .from('vc_reporting_obligations')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();
  if (oErr || !ob) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: actions, error } = await supabase
    .from('vc_compliance_actions')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('obligation_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ actions: actions ?? [] });
}
