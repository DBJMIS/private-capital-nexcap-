import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { callClaudeJson } from '@/lib/prequalification/claude';
import { extractJsonObject } from '@/lib/prequalification/claude-json';
import { AI_ITEM_KEYS, emptyPrequalificationTemplate, type ChecklistResponse } from '@/lib/prequalification/types';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

const MAX_BYTES = 20 * 1024 * 1024;

const SYSTEM = `You are a DBJ investment analyst reviewing a fund manager's proposal document for prequalification.

Analyse the document and return a JSON object with exactly two keys: "checklist" and "summary".

For "checklist", assess each item:
- s21_company_info: Company name, registration, directors
- s21_fund_info: Fund name, structure, target size
- s21_fund_strategy: Investment strategy, sectors, geography
- s21_fund_management: Team, experience, governance
- s21_legal_regulatory: Legal structure, FSC compliance
- s22_company_management: Detailed team bios, org structure
- s22_fund_general: Fund terms, duration, fees
- s22_fund_financial: Financial projections, returns model
- s22_fund_esg: ESG policy and practices

Each checklist item must be:
{ "response": "yes"|"partial"|"no", "reasoning": "one sentence" }

For "summary":
- overall: 2 sentence overall assessment
- strengths: array of human-readable item names for items rated "yes", using these exact labels:
  "Company Information", "Fund Information", "Fund Strategy", "Fund Management",
  "Legal and Regulatory Requirements", "Company and Management Team",
  "Fund Details — General", "Fund Details — Financial", "Fund Details — ESG"
- gaps: array of human-readable item names for items rated "partial" or "no", using the same label list above
- recommendation:
  - "prequalify" if 7+ items are yes
  - "request_info" if 4-6 are yes or any are partial
  - "not_prequalify" if 3 or fewer yes

Return valid JSON only. No markdown.`;

export async function POST(req: Request, ctx: RouteCtx) {
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

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const { data: pq } = await supabase
    .from('vc_prequalification')
    .select('id, overall_status')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (pq && (pq as { overall_status: string }).overall_status !== 'pending') {
    return NextResponse.json({ error: 'Checklist is locked after a decision' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  if (!model) return NextResponse.json({ error: 'ANTHROPIC_MODEL is not configured' }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 20MB limit' }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (!name.endsWith('.pdf')) {
    return NextResponse.json(
      { error: 'AI document analysis currently supports PDF only. Please export or save as PDF and try again.' },
      { status: 415 },
    );
  }

  const b64 = buf.toString('base64');
  const userText =
    'Analyse the attached proposal PDF and return JSON only as specified in the system instructions. Include every checklist item key and a summary.';

  const ai = await callClaudeJson({
    apiKey,
    model,
    system: SYSTEM,
    userText,
    pdfBase64: { mediaType: 'application/pdf', data: b64 },
  });

  if (!ai.ok) {
    return NextResponse.json({ error: ai.error }, { status: 502 });
  }

  const parsed = extractJsonObject(ai.text);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 502 });
  }

  const root = parsed.value as {
    checklist?: Record<string, { response?: string; reasoning?: string }>;
    summary?: {
      overall?: string;
      strengths?: unknown;
      gaps?: unknown;
      recommendation?: string;
    };
  };
  const rawChecklist = root.checklist && typeof root.checklist === 'object' ? root.checklist : null;
  if (!rawChecklist) {
    return NextResponse.json({ error: 'Model response missing checklist' }, { status: 502 });
  }

  const columnToAiKey: Record<string, (typeof AI_ITEM_KEYS)[number]> = {
    s21_company_info: 'company_info',
    s21_fund_info: 'fund_info',
    s21_fund_strategy: 'fund_strategy',
    s21_fund_management: 'fund_management',
    s21_legal_regulatory: 'legal_regulatory',
    s22_company_management: 'company_management',
    s22_fund_general: 'fund_general',
    s22_fund_financial: 'fund_financial',
    s22_fund_esg: 'fund_esg',
  };

  const suggestions: Record<string, { response: 'yes' | 'no' | 'partial'; reasoning: string }> = {};
  const checklistPatch: Record<string, ChecklistResponse> = {};
  for (const [column, aiKey] of Object.entries(columnToAiKey)) {
    const cell = rawChecklist[column];
    const response = typeof cell?.response === 'string' ? cell.response.toLowerCase() : '';
    const reasoning = typeof cell?.reasoning === 'string' ? cell.reasoning : '';
    if (response === 'yes' || response === 'no' || response === 'partial') {
      suggestions[aiKey] = { response, reasoning: reasoning || '—' };
      checklistPatch[column] = response;
    }
  }

  const summaryRaw = root.summary && typeof root.summary === 'object' ? root.summary : {};
  const summary = {
    overall: typeof summaryRaw.overall === 'string' ? summaryRaw.overall : '',
    strengths: Array.isArray(summaryRaw.strengths) ? summaryRaw.strengths.filter((x): x is string => typeof x === 'string') : [],
    gaps: Array.isArray(summaryRaw.gaps) ? summaryRaw.gaps.filter((x): x is string => typeof x === 'string') : [],
    recommendation:
      summaryRaw.recommendation === 'prequalify' || summaryRaw.recommendation === 'request_info' || summaryRaw.recommendation === 'not_prequalify'
        ? summaryRaw.recommendation
        : 'request_info',
    generated_at: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  const pathValue = `upload:${file.name}`;

  const { data: existing } = await supabase
    .from('vc_prequalification')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  const existingId = (existing as { id: string } | null)?.id ?? null;

  const upsertPayload: Record<string, unknown> = {
    ...checklistPatch,
    ai_summary: summary,
    proposal_document_path: pathValue,
    ai_analysed_at: now,
  };

  if (existingId) {
    const { error: upErr } = await supabase
      .from('vc_prequalification')
      .update(upsertPayload)
      .eq('id', existingId)
      .eq('tenant_id', profile.tenant_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  } else {
    const insertRow = {
      tenant_id: profile.tenant_id,
      ...emptyPrequalificationTemplate(applicationId),
      ...upsertPayload,
    };
    const { error: insErr } = await supabase.from('vc_prequalification').insert(insertRow);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ suggestions, summary, proposal_document_path: pathValue, ai_analysed_at: now });
}
