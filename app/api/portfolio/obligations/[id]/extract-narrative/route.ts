import { NextResponse } from 'next/server';
import mammoth from 'mammoth';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { callClaudeJson } from '@/lib/prequalification/claude';
import {
  buildNarrativeExtractionUserPrompt,
  NARRATIVE_EXTRACTION_SYSTEM,
  parseNarrativeExtractionModelJson,
} from '@/lib/portfolio/narrative-extraction';
import { FINANCIAL_SNAPSHOT_REPORT_TYPES } from '@/lib/portfolio/snapshot-extraction';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: obligationId } = await ctx.params;
  const supabase = createServerClient();

  const { data: ob, error: oErr } = await supabase
    .from('vc_reporting_obligations')
    .select(
      'id, fund_id, report_type, period_year, period_month, period_label, document_path, document_name',
    )
    .eq('tenant_id', profile.tenant_id)
    .eq('id', obligationId)
    .maybeSingle();

  if (oErr || !ob) return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });

  const row = ob as {
    fund_id: string;
    report_type: string;
    period_year: number;
    period_month: number;
    period_label: string;
    document_path: string | null;
    document_name: string | null;
  };

  if (!FINANCIAL_SNAPSHOT_REPORT_TYPES.includes(row.report_type as (typeof FINANCIAL_SNAPSHOT_REPORT_TYPES)[number])) {
    return NextResponse.json(
      { error: 'Narrative extraction is only supported for quarterly financial or audited annual reports.' },
      { status: 400 },
    );
  }
  if (!row.document_path) {
    return NextResponse.json({ error: 'No document uploaded for this obligation.' }, { status: 400 });
  }

  const pathLower = row.document_path.toLowerCase();
  const nameLower = row.document_name?.toLowerCase() ?? '';
  const isPdf = pathLower.endsWith('.pdf') || nameLower.endsWith('.pdf');
  const isDocx = pathLower.endsWith('.docx') || nameLower.endsWith('.docx');
  if (!isPdf && !isDocx) {
    return NextResponse.json(
      { error: 'Unsupported file type. Only PDF and Word documents (.docx) are supported.' },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return NextResponse.json({ error: 'AI extraction is not configured (ANTHROPIC_API_KEY).' }, { status: 503 });
  }

  const { data: fund } = await supabase
    .from('vc_portfolio_funds')
    .select('fund_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', row.fund_id)
    .maybeSingle();
  const fundName = (fund as { fund_name?: string } | null)?.fund_name ?? 'Fund';

  const { data: fileBlob, error: dErr } = await supabase.storage.from('portfolio-reports').download(row.document_path);
  if (dErr || !fileBlob) {
    return NextResponse.json({ error: dErr?.message ?? 'Could not download document from storage.' }, { status: 500 });
  }
  const buf = Buffer.from(await fileBlob.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: 'Downloaded document was empty.' }, { status: 400 });

  const prompt = buildNarrativeExtractionUserPrompt({
    fundName,
    periodLabel: row.period_label,
    reportType: row.report_type,
  });

  let userText = prompt;
  let pdfBase64: { mediaType: 'application/pdf'; data: string } | undefined;
  if (isPdf) {
    pdfBase64 = { mediaType: 'application/pdf', data: buf.toString('base64') };
  } else {
    const result = await mammoth.extractRawText({ buffer: buf });
    const docText = result.value?.trim() ?? '';
    if (!docText) {
      return NextResponse.json({ error: 'Could not extract text from this document' }, { status: 422 });
    }
    userText = `The following is the text content of a fund quarterly report:\n\n${docText}\n\n---\n\n${prompt}`;
  }

  const claude = await callClaudeJson({
    apiKey,
    model,
    system: NARRATIVE_EXTRACTION_SYSTEM,
    userText,
    pdfBase64,
    maxTokens: 4000,
  });
  if (!claude.ok) return NextResponse.json({ error: claude.error }, { status: 502 });

  const parsed = parseNarrativeExtractionModelJson(claude.text);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const periodQuarter = Math.max(1, Math.min(4, Math.floor((row.period_month - 1) / 3) + 1));
  const payload = {
    tenant_id: profile.tenant_id,
    fund_id: row.fund_id,
    source_obligation_id: obligationId,
    period_year: row.period_year,
    period_quarter: periodQuarter,
    extraction_confidence: parsed.data.confidence,
    fundraising_update: parsed.data.narrative.fundraising_update,
    pipeline_development: parsed.data.narrative.pipeline_development,
    team_update: parsed.data.narrative.team_update,
    compliance_update: parsed.data.narrative.compliance_update,
    impact_update: parsed.data.narrative.impact_update,
    risk_assessment: parsed.data.narrative.risk_assessment,
    outlook: parsed.data.narrative.outlook,
    indicators: parsed.data.indicators,
    source_snippets: parsed.data.source_snippets,
    fund_profile: parsed.data.fund_profile,
    allocations: parsed.data.allocations,
    fund_lps: parsed.data.fund_lps,
    pipeline_stats: parsed.data.pipeline_stats,
    capital_account_detail: parsed.data.capital_account_detail,
    extracted_at: new Date().toISOString(),
  };

  const { data: saved, error: upErr } = await supabase
    .from('vc_fund_narrative_extracts')
    .upsert(payload, { onConflict: 'tenant_id,fund_id,source_obligation_id' })
    .select('*')
    .single();
  if (upErr || !saved) {
    return NextResponse.json({ error: upErr?.message ?? 'Failed to save narrative extract' }, { status: 500 });
  }

  return NextResponse.json({
    narrative_extract_id: (saved as { id: string }).id,
    narrative: parsed.data.narrative,
    indicators: parsed.data.indicators,
    fund_profile: parsed.data.fund_profile,
    allocations: parsed.data.allocations,
    fund_lps: parsed.data.fund_lps,
    pipeline_stats: parsed.data.pipeline_stats,
    capital_account_detail: parsed.data.capital_account_detail,
    confidence: parsed.data.confidence,
    source_snippets: parsed.data.source_snippets,
  });
}
