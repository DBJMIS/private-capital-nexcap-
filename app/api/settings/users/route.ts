import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { loadUserManagementSnapshot } from '@/lib/settings/user-management-snapshot';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const snapshot = await loadUserManagementSnapshot(supabase, profile.tenant_id);
  return NextResponse.json(snapshot);
}
