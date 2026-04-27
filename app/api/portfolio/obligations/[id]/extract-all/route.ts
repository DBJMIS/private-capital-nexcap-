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
import {
  buildSnapshotExtractionUserPrompt,
  FINANCIAL_SNAPSHOT_REPORT_TYPES,
  parseSnapshotExtractionModelJson,
  SNAPSHOT_EXTRACTION_SYSTEM,
  type SnapshotExtractedFields,
  type SnapshotExtractionConfidence,
} from '@/lib/portfolio/snapshot-extraction';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

type SnapshotBranch = {
  ok: boolean;
  extracted: SnapshotExtractedFields | null;
  confidence: Record<string, string> | null;
  skipped?: boolean;
  error?: string;
};

type NarrativeBranch = {
  ok: boolean;
  extract_id: string | null;
  narrative: import('@/lib/portfolio/narrative-extraction').NarrativeExtractionPayload['narrative'] | null;
  indicators: import('@/lib/portfolio/narrative-extraction').NarrativeExtractionPayload['indicators'] | null;
  allocations: unknown | null;
  fund_lps: unknown | null;
  pipeline_stats: unknown | null;
  fund_profile: unknown | null;
  capital_account_detail: unknown | null;
  confidence: Record<string, string> | null;
  source_snippets: unknown | null;
  error?: string;
};

function confidenceToStrings(c: SnapshotExtractionConfidence | null | undefined): Record<string, string> | null {
  if (!c || typeof c !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v != null) out[k] = String(v);
  }
  return Object.keys(out).length ? out : null;
}

async function runSnapshotExtraction(params: {
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>;
  row: {
    fund_id: string;
    report_type: string;
    period_year: number;
    period_month: number;
    period_label: string;
    document_path: string | null;
    document_name: string | null;
    snapshot_extracted: boolean | null;
  };
  buf: Buffer;
  isPdf: boolean;
}): Promise<SnapshotBranch> {
  const { row, buf, isPdf, profile } = params;
  if (row.snapshot_extracted) {
    return { ok: true, extracted: null, confidence: null, skipped: true };
  }

  if (!FINANCIAL_SNAPSHOT_REPORT_TYPES.includes(row.report_type as (typeof FINANCIAL_SNAPSHOT_REPORT_TYPES)[number])) {
    return { ok: false, extracted: null, confidence: null, error: 'Snapshot extraction is only supported for quarterly financial or audited annual reports.' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return { ok: false, extracted: null, confidence: null, error: 'AI extraction is not configured (ANTHROPIC_API_KEY).' };
  }

  const userText = buildSnapshotExtractionUserPrompt({
    period_label: row.period_label,
    period_year: row.period_year,
    period_month: row.period_month,
    report_type: row.report_type,
  });

  const claude = isPdf
    ? await callClaudeJson({
        apiKey,
        model,
        system: SNAPSHOT_EXTRACTION_SYSTEM,
        userText,
        pdfBase64: { mediaType: 'application/pdf', data: buf.toString('base64') },
      })
    : await (async () => {
        const ext = await mammoth.extractRawText({ buffer: buf });
        const text = ext.value?.trim() ?? '';
        if (!text) return { ok: false as const, error: 'Could not extract text from DOCX document.' };
        return callClaudeJson({
          apiKey,
          model,
          system: SNAPSHOT_EXTRACTION_SYSTEM,
          userText: `${userText}\n\nReport text:\n${text}`,
        });
      })();

  if (!claude.ok) {
    return { ok: false, extracted: null, confidence: null, error: claude.error };
  }

  const parsed = parseSnapshotExtractionModelJson(claude.text);
  if (!parsed.ok) {
    return { ok: false, extracted: null, confidence: null, error: parsed.error };
  }

  return {
    ok: true,
    extracted: parsed.extracted,
    confidence: confidenceToStrings(parsed.confidence),
  };
}

async function runNarrativeExtraction(params: {
  supabase: ReturnType<typeof createServerClient>;
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>;
  obligationId: string;
  row: {
    fund_id: string;
    report_type: string;
    period_year: number;
    period_month: number;
    period_label: string;
  };
  buf: Buffer;
  isPdf: boolean;
}): Promise<NarrativeBranch> {
  const { supabase, profile, obligationId, row, buf, isPdf } = params;

  if (!FINANCIAL_SNAPSHOT_REPORT_TYPES.includes(row.report_type as (typeof FINANCIAL_SNAPSHOT_REPORT_TYPES)[number])) {
    return {
      ok: false,
      extract_id: null,
      narrative: null,
      indicators: null,
      allocations: null,
      fund_lps: null,
      pipeline_stats: null,
      fund_profile: null,
      capital_account_detail: null,
      confidence: null,
      source_snippets: null,
      error: 'Narrative extraction is only supported for quarterly financial or audited annual reports.',
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return {
      ok: false,
      extract_id: null,
      narrative: null,
      indicators: null,
      allocations: null,
      fund_lps: null,
      pipeline_stats: null,
      fund_profile: null,
      capital_account_detail: null,
      confidence: null,
      source_snippets: null,
      error: 'AI extraction is not configured (ANTHROPIC_API_KEY).',
    };
  }

  const { data: fund } = await supabase
    .from('vc_portfolio_funds')
    .select('fund_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', row.fund_id)
    .maybeSingle();
  const fundName = (fund as { fund_name?: string } | null)?.fund_name ?? 'Fund';

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
      return {
        ok: false,
        extract_id: null,
        narrative: null,
        indicators: null,
        allocations: null,
        fund_lps: null,
        pipeline_stats: null,
        fund_profile: null,
        capital_account_detail: null,
        confidence: null,
        source_snippets: null,
        error: 'Could not extract text from this document',
      };
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
  if (!claude.ok) {
    return {
      ok: false,
      extract_id: null,
      narrative: null,
      indicators: null,
      allocations: null,
      fund_lps: null,
      pipeline_stats: null,
      fund_profile: null,
      capital_account_detail: null,
      confidence: null,
      source_snippets: null,
      error: claude.error,
    };
  }

  const parsed = parseNarrativeExtractionModelJson(claude.text);
  if (!parsed.ok) {
    return {
      ok: false,
      extract_id: null,
      narrative: null,
      indicators: null,
      allocations: null,
      fund_lps: null,
      pipeline_stats: null,
      fund_profile: null,
      capital_account_detail: null,
      confidence: null,
      source_snippets: null,
      error: parsed.error,
    };
  }

  const periodQuarter = Math.max(1, Math.min(4, Math.floor((row.period_month - 1) / 3) + 1));
  const d = parsed.data;
  const payload = {
    tenant_id: profile.tenant_id,
    fund_id: row.fund_id,
    source_obligation_id: obligationId,
    period_year: row.period_year,
    period_quarter: periodQuarter,
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
    extracted_at: new Date().toISOString(),
  };

  const { data: saved, error: upErr } = await supabase
    .from('vc_fund_narrative_extracts')
    .upsert(payload, { onConflict: 'tenant_id,fund_id,source_obligation_id' })
    .select('id')
    .single();

  if (upErr || !saved) {
    return {
      ok: false,
      extract_id: null,
      narrative: d.narrative,
      indicators: d.indicators,
      allocations: d.allocations,
      fund_lps: d.fund_lps,
      pipeline_stats: d.pipeline_stats,
      fund_profile: d.fund_profile,
      capital_account_detail: d.capital_account_detail,
      confidence: d.confidence as Record<string, string>,
      source_snippets: d.source_snippets,
      error: upErr?.message ?? 'Failed to save narrative extract',
    };
  }

  const extractId = (saved as { id: string }).id;
  return {
    ok: true,
    extract_id: extractId,
    narrative: d.narrative,
    indicators: d.indicators,
    allocations: d.allocations,
    fund_lps: d.fund_lps,
    pipeline_stats: d.pipeline_stats,
    fund_profile: d.fund_profile,
    capital_account_detail: d.capital_account_detail,
    confidence: d.confidence as Record<string, string>,
    source_snippets: d.source_snippets,
  };
}

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
      'id, fund_id, tenant_id, report_type, period_year, period_month, period_label, document_path, document_name, snapshot_extracted, snapshot_id',
    )
    .eq('tenant_id', profile.tenant_id)
    .eq('id', obligationId)
    .maybeSingle();

  if (oErr || !ob) {
    return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });
  }

  const row = ob as {
    fund_id: string;
    report_type: string;
    period_year: number;
    period_month: number;
    period_label: string;
    document_path: string | null;
    document_name: string | null;
    snapshot_extracted: boolean | null;
  };

  if (!row.document_path) {
    return NextResponse.json({ error: 'No document uploaded for this obligation.' }, { status: 400 });
  }

  const pathLower = row.document_path.toLowerCase();
  const nameLower = row.document_name?.toLowerCase() ?? '';
  const isPdf = pathLower.endsWith('.pdf') || nameLower.endsWith('.pdf');
  const isDocx = pathLower.endsWith('.docx') || nameLower.endsWith('.docx');
  if (!isPdf && !isDocx) {
    return NextResponse.json({ error: 'Unsupported file type. Only PDF and Word documents (.docx) are supported.' }, { status: 400 });
  }

  const { data: fileBlob, error: dErr } = await supabase.storage.from('portfolio-reports').download(row.document_path);
  if (dErr || !fileBlob) {
    return NextResponse.json({ error: dErr?.message ?? 'Could not download document from storage.' }, { status: 500 });
  }

  const buf = Buffer.from(await fileBlob.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: 'Downloaded document was empty.' }, { status: 400 });
  }

  const [snapSettled, narrSettled] = await Promise.allSettled([
    runSnapshotExtraction({ profile, row, buf, isPdf }),
    runNarrativeExtraction({ supabase, profile, obligationId, row, buf, isPdf }),
  ]);

  const snapshot: SnapshotBranch =
    snapSettled.status === 'fulfilled'
      ? snapSettled.value
      : {
          ok: false,
          extracted: null,
          confidence: null,
          error: snapSettled.reason instanceof Error ? snapSettled.reason.message : String(snapSettled.reason),
        };

  const narrative: NarrativeBranch =
    narrSettled.status === 'fulfilled'
      ? narrSettled.value
      : {
          ok: false,
          extract_id: null,
          narrative: null,
          indicators: null,
          allocations: null,
          fund_lps: null,
          pipeline_stats: null,
          fund_profile: null,
          capital_account_detail: null,
          confidence: null,
          source_snippets: null,
          error: narrSettled.reason instanceof Error ? narrSettled.reason.message : String(narrSettled.reason),
        };

  return NextResponse.json({
    snapshot,
    narrative,
    fund_id: row.fund_id,
    obligation_id: obligationId,
    document_name: row.document_name,
  });
}
