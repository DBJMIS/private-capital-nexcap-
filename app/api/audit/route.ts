import { NextResponse } from 'next/server';

import { fetchAuditLogsTenantAdmin } from '@/lib/audit/fetch';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Full tenant audit log (admin only). */
export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  try {
    const events = await fetchAuditLogsTenantAdmin(supabase, profile.tenant_id, limit, offset);
    return NextResponse.json({ events, limit, offset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load audit';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
