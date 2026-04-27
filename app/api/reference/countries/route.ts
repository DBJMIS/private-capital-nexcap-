import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('ref_countries')
    .select('code, name')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ countries: data ?? [] });
}
