import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Tenant colleagues for assignment dropdowns (portfolio reviewer, etc.). */
export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('vc_profiles')
    .select('user_id, full_name, email')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profiles: rows ?? [] });
}
