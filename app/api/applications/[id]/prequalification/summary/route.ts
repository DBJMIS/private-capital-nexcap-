import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { callClaudeJson } from '@/lib/prequalification/claude';
import { extractJsonObject } from '@/lib/prequalification/claude-json';
import { S21_KEYS, S22_KEYS, allChecklistItemsReviewed, type PrequalificationRow } from '@/lib/prequalification/types';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

const SYSTEM = `You are reviewing a fund manager prequalification checklist for the Development Bank of Jamaica.

Based on these checklist responses, provide a JSON object only (no markdown) with keys:
- overall: string, two sentences overall assessment
- strong: array of strings, items marked YES (use short labels)
- gaps: array of strings, items marked PARTIAL or NO with specific gaps to address
- recommendation: one of exactly "Prequalify" | "Do not prequalify" | "Request additional information"

Be concise and professional.`;

export async function POST(_req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: pq, error: pqErr } = await supabase
    .from('vc_prequalification')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (pqErr || !pq) {
    return NextResponse.json({ error: 'Pre-qualification record not found' }, { status: 400 });
  }

  const row = pq as PrequalificationRow;
  if (row.overall_status !== 'pending') {
    return NextResponse.json({ error: 'Summary is only available before a final decision' }, { status: 400 });
  }
  if (!allChecklistItemsReviewed(row)) {
    return NextResponse.json({ error: 'All checklist items must be reviewed before generating an AI summary' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  if (!model) return NextResponse.json({ error: 'ANTHROPIC_MODEL is not configured' }, { status: 503 });

  const checklist: Record<string, string> = {};
  for (const k of S21_KEYS) checklist[k] = row[k];
  for (const k of S22_KEYS) checklist[k] = row[k];
  checklist.date_received = row.date_received ?? '';
  checklist.soft_copy_received = String(row.soft_copy_received);
  checklist.hard_copy_received = String(row.hard_copy_received);

  const userText = `Checklist responses (JSON):\n${JSON.stringify(checklist, null, 2)}`;

  const ai = await callClaudeJson({ apiKey, model, system: SYSTEM, userText });
  if (!ai.ok) {
    return NextResponse.json({ error: ai.error }, { status: 502 });
  }

  const parsed = extractJsonObject(ai.text);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 502 });
  }

  const obj = parsed.value as {
    overall?: string;
    strong?: unknown;
    gaps?: unknown;
    recommendation?: string;
  };

  const summary = {
    overall: typeof obj.overall === 'string' ? obj.overall : '',
    strong: Array.isArray(obj.strong) ? obj.strong.filter((x): x is string => typeof x === 'string') : [],
    gaps: Array.isArray(obj.gaps) ? obj.gaps.filter((x): x is string => typeof x === 'string') : [],
    recommendation: typeof obj.recommendation === 'string' ? obj.recommendation : 'Request additional information',
    generated_at: new Date().toISOString(),
  };

  const { data: updated, error: upErr } = await supabase
    .from('vc_prequalification')
    .update({ ai_summary: summary })
    .eq('id', row.id)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Failed to save summary' }, { status: 500 });
  }

  return NextResponse.json({ ai_summary: summary, prequalification: updated as PrequalificationRow });
}
