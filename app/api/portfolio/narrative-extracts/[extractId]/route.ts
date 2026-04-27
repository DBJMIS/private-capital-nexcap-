import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  mergeNarrativeExtractMergeInput,
  narrativeExtractRowToMergeInput,
  parseNarrativeExtractionPayload,
} from '@/lib/portfolio/narrative-extraction';
import { createServerClient } from '@/lib/supabase/server';
import type { VcFundNarrativeExtract } from '@/types/database';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ extractId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { extractId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: row, error: fErr } = await supabase
    .from('vc_fund_narrative_extracts')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', extractId)
    .maybeSingle();

  if (fErr || !row) {
    return NextResponse.json({ error: 'Narrative extract not found' }, { status: 404 });
  }

  const merged = mergeNarrativeExtractMergeInput(narrativeExtractRowToMergeInput(row as VcFundNarrativeExtract), body);
  const parsed = parseNarrativeExtractionPayload(merged);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const d = parsed.data;
  const update = {
    extraction_confidence: d.confidence,
    fundraising_update: d.narrative.fundraising_update,
    pipeline_development: d.narrative.pipeline_development,
    team_update: d.narrative.team_update,
    compliance_update: d.narrative.compliance_update,
    impact_update: d.narrative.impact_update,
    risk_assessment: d.narrative.risk_assessment,
    outlook: d.narrative.outlook,
    indicators: d.indicators,
    source_snippets: d.source_snippets,
    fund_profile: d.fund_profile,
    allocations: d.allocations,
    fund_lps: d.fund_lps,
    pipeline_stats: d.pipeline_stats,
    capital_account_detail: d.capital_account_detail,
  };

  const { data: saved, error: upErr } = await supabase
    .from('vc_fund_narrative_extracts')
    .update(update)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', extractId)
    .select('*')
    .single();

  if (upErr || !saved) {
    return NextResponse.json({ error: upErr?.message ?? 'Failed to update narrative extract' }, { status: 500 });
  }

  return NextResponse.json({
    narrative_extract_id: (saved as { id: string }).id,
    narrative: d.narrative,
    indicators: d.indicators,
    fund_profile: d.fund_profile,
    allocations: d.allocations,
    fund_lps: d.fund_lps,
    pipeline_stats: d.pipeline_stats,
    capital_account_detail: d.capital_account_detail,
    confidence: d.confidence,
    source_snippets: d.source_snippets,
  });
}
