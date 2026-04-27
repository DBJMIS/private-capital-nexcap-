import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { getPendingDisbursementApprovalId } from '@/lib/workflow/approval-rules';
import { runApprovalDecision } from '@/lib/workflow/run-decision';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; disbId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: investmentId, disbId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { decision_notes?: string };
  try {
    body = (await req.json()) as { decision_notes?: string };
  } catch {
    body = {};
  }

  const { data: d } = await supabase
    .from('vc_disbursements')
    .select('id, investment_id, status')
    .eq('id', disbId)
    .eq('investment_id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!d) return NextResponse.json({ error: 'Disbursement not found' }, { status: 404 });

  if (d.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending disbursements can be approved' }, { status: 400 });
  }

  const approvalId = await getPendingDisbursementApprovalId(supabase, profile.tenant_id, disbId);
  if (!approvalId) {
    return NextResponse.json(
      { error: 'No pending approval record for this disbursement (data migration may be required)' },
      { status: 400 },
    );
  }

  const result = await runApprovalDecision({
    supabase,
    tenantId: profile.tenant_id,
    actorUserId: user.id,
    profile,
    approvalId,
    decision: 'approved',
    decisionNotes: body.decision_notes ?? '',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
