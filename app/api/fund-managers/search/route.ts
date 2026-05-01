import { NextResponse } from 'next/server';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({ managers: [] as unknown[] });
  }

  const supabase = createServerClient();
  const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

  const [byName, byFirm] = await Promise.all([
    supabase
      .from('fund_managers')
      .select('id, name, firm_name, email')
      .eq('tenant_id', profile.tenant_id)
      .ilike('name', pattern)
      .limit(20),
    supabase
      .from('fund_managers')
      .select('id, name, firm_name, email')
      .eq('tenant_id', profile.tenant_id)
      .ilike('firm_name', pattern)
      .limit(20),
  ]);

  if (byName.error) return NextResponse.json({ error: byName.error.message }, { status: 500 });
  if (byFirm.error) return NextResponse.json({ error: byFirm.error.message }, { status: 500 });

  const merged = new Map<string, { id: string; name: string; firm_name: string; email: string | null }>();
  for (const row of [...(byName.data ?? []), ...(byFirm.data ?? [])]) {
    merged.set(row.id, row);
  }

  return NextResponse.json({ managers: [...merged.values()].slice(0, 20) });
}
