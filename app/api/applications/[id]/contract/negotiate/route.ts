import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog, clientIpFromRequest } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type RoundEntry = { round: number; date: string; notes: string; changed_by?: string | null };

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: { round?: number; date?: string; notes?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const round = typeof body.round === 'number' ? body.round : Number(body.round);
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  if (!Number.isFinite(round) || round < 1) {
    return NextResponse.json({ error: 'round must be a positive number' }, { status: 400 });
  }
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

  const supabase = createServerClient();
  const { data: contract, error: cErr } = await supabase
    .from('vc_contracts')
    .select('id, negotiation_rounds')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (cErr || !contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const row = contract as { id: string; negotiation_rounds: unknown };
  const existing = Array.isArray(row.negotiation_rounds) ? (row.negotiation_rounds as RoundEntry[]) : [];
  const entry: RoundEntry = {
    round,
    date,
    notes,
    changed_by: profile.profile_id,
  };
  const next = [...existing, entry];

  const { data: updated, error: upErr } = await supabase
    .from('vc_contracts')
    .update({ negotiation_rounds: next })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', row.id)
    .select('*')
    .single();

  if (upErr || !updated) return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'contract_negotiation_round',
    afterState: entry,
    ipAddress: clientIpFromRequest(req),
  });

  return NextResponse.json({ contract: updated });
}
