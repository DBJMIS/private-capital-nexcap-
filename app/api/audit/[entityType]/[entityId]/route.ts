import { NextResponse } from 'next/server';

import { logAndReturn } from '@/lib/api/errors';
import {
  fetchAuditLogsForAssessment,
  fetchAuditLogsForDdQuestionnaire,
  fetchAuditLogsForDeal,
  fetchAuditLogsForFundApplication,
  fetchAuditLogsForInvestment,
  fetchAuditLogsForInvestor,
} from '@/lib/audit/fetch';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'fund_application',
  'deal',
  'investment',
  'assessment',
  'dd_questionnaire',
  'investor',
]);

type Ctx = { params: Promise<{ entityType: string; entityId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { entityType, entityId } = await ctx.params;
  if (!ALLOWED.has(entityType)) {
    return NextResponse.json({ error: 'Unsupported entity type' }, { status: 400 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    let events;
    if (entityType === 'fund_application') {
      events = await fetchAuditLogsForFundApplication(supabase, profile.tenant_id, entityId);
    } else if (entityType === 'deal') {
      events = await fetchAuditLogsForDeal(supabase, profile.tenant_id, entityId);
    } else if (entityType === 'investment') {
      events = await fetchAuditLogsForInvestment(supabase, profile.tenant_id, entityId);
    } else if (entityType === 'assessment') {
      events = await fetchAuditLogsForAssessment(supabase, profile.tenant_id, entityId);
    } else if (entityType === 'investor') {
      events = await fetchAuditLogsForInvestor(supabase, profile.tenant_id, entityId);
    } else {
      events = await fetchAuditLogsForDdQuestionnaire(supabase, profile.tenant_id, entityId);
    }
    return NextResponse.json({ events });
  } catch (e) {
    return logAndReturn(e, 'audit/entity', 'INTERNAL_ERROR', 'Failed to load audit log', 500);
  }
}
