import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { runApprovalDecision } from '@/lib/workflow/run-decision';
import { approvalDecideBodySchema } from '@/lib/validation/api-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: approvalId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const parsed = approvalDecideBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body', 400, 'validation_error');
  }
  const body = parsed.data;

  const result = await runApprovalDecision({
    supabase,
    tenantId: profile.tenant_id,
    actorUserId: user.id,
    profile,
    approvalId,
    decision: body.decision,
    decisionNotes: body.decision_notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
