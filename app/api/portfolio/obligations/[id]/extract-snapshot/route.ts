import { NextResponse } from 'next/server';
import mammoth from 'mammoth';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { callClaudeJson } from '@/lib/prequalification/claude';
import {
  buildSnapshotExtractionUserPrompt,
  FINANCIAL_SNAPSHOT_REPORT_TYPES,
  parseSnapshotExtractionModelJson,
  SNAPSHOT_EXTRACTION_SYSTEM,
} from '@/lib/portfolio/snapshot-extraction';
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
    snapshot_id: string | null;
  };

  if (row.snapshot_extracted) {
    return NextResponse.json({
      already_extracted: true,
      fund_id: row.fund_id,
      obligation_id: obligationId,
      snapshot_id: row.snapshot_id,
    });
  }

  if (!FINANCIAL_SNAPSHOT_REPORT_TYPES.includes(row.report_type as (typeof FINANCIAL_SNAPSHOT_REPORT_TYPES)[number])) {
    return NextResponse.json(
      { error: 'Snapshot extraction is only supported for quarterly financial or audited annual reports.' },
      { status: 400 },
    );
  }

  if (!row.document_path) {
    return NextResponse.json({ error: 'No document uploaded for this obligation.' }, { status: 400 });
  }

  const isPdf =
    row.document_path.toLowerCase().endsWith('.pdf') ||
    (row.document_name?.toLowerCase().endsWith('.pdf') ?? false);
  const isDocx =
    row.document_path.toLowerCase().endsWith('.docx') ||
    (row.document_name?.toLowerCase().endsWith('.docx') ?? false);
  if (!isPdf && !isDocx) {
    return NextResponse.json({ error: 'Snapshot extraction requires PDF or DOCX.' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return NextResponse.json({ error: 'AI extraction is not configured (ANTHROPIC_API_KEY).' }, { status: 503 });
  }

  const { data: fileBlob, error: dErr } = await supabase.storage.from('portfolio-reports').download(row.document_path);
  if (dErr || !fileBlob) {
    return NextResponse.json({ error: dErr?.message ?? 'Could not download document from storage.' }, { status: 500 });
  }

  const buf = Buffer.from(await fileBlob.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: 'Downloaded document was empty.' }, { status: 400 });
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
    return NextResponse.json({ error: claude.error }, { status: 502 });
  }

  const parsed = parseSnapshotExtractionModelJson(claude.text);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json({
    already_extracted: false,
    extracted: parsed.extracted,
    confidence: parsed.confidence,
    fund_id: row.fund_id,
    obligation_id: obligationId,
  });
}
