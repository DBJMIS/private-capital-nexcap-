import { NextResponse } from 'next/server';

import { logAndReturn } from '@/lib/api/errors';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const { id: fundManagerId, contactId } = await ctx.params;
    if (!fundManagerId || !contactId) {
      return logAndReturn(new Error('Missing ids'), 'fund-managers/contacts/revoke:POST', 'VALIDATION_ERROR', 'Invalid contact path.', 400);
    }

    const adminClient = createServiceRoleClient();
    const { error } = await adminClient
      .from('fund_manager_contacts')
      .update({
        portal_access: false,
        portal_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId);

    if (error) {
      return logAndReturn(error, 'fund-managers/contacts/revoke:POST:update', 'INTERNAL_ERROR', 'Could not revoke portal access.', 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return logAndReturn(error, 'fund-managers/contacts/revoke:POST', 'INTERNAL_ERROR', 'Could not revoke portal access.', 500);
  }
}
