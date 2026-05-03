import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  buildFollowupUserPrompt,
  buildSectionInputsFromDb,
  computeWeakestSections,
  parseClaudeFollowupJson,
  validateFollowupAgainstCriteria,
  type ClaudeFollowupItem,
  type DdAnswerRow,
} from '@/lib/assessment/followup-questions-logic';
import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const postSchema = z.object({
  assessment_id: z.string().uuid(),
  force_regenerate: z.boolean().optional(),
});

const patchSchema = z.object({
  question_id: z.string().uuid(),
  used: z.boolean(),
});

const SYSTEM_PROMPT = `You are a senior investment analyst at the Development Bank of Jamaica (DBJ), a development finance institution that invests in VC and private equity funds across Jamaica and the Caribbean. Your role is to prepare rigorous, specific follow-up questions for investment officers to use in meetings with fund managers after reviewing their DD questionnaire submissions. Questions must be grounded in the specific gaps identified in the scoring, reference actual content from their answers where possible, and be appropriate for a formal investment committee preparation context. Focus on developmental impact alongside financial returns as DBJ has a dual mandate.`;

async function callClaude(userPrompt: string): Promise<{ ok: boolean; text: string; err?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = 'claude-sonnet-4-20250514';
  if (!apiKey) return { ok: false, text: '', err: 'ANTHROPIC_API_KEY is not configured' };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const raw = (await response.json().catch(() => ({}))) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  const text = (raw.content ?? [])
    .filter((x) => x.type === 'text' && typeof x.text === 'string')
    .map((x) => x.text as string)
    .join('\n');
  return { ok: response.ok, text, err: raw.error?.message };
}

type FollowupRow = {
  id: string;
  assessment_id: string;
  fund_id: string | null;
  section_key: string;
  section_label: string;
  section_score: number | null;
  section_max_score: number | null;
  question: string;
  rationale: string | null;
  used: boolean;
  used_at: string | null;
  used_by: string | null;
  generated_at: string;
  generation_version: number;
};

async function assertAssessmentAccess(
  supabase: ReturnType<typeof createServerClient>,
  tenantId: string,
  assessmentId: string,
): Promise<{ ok: boolean; status?: string }> {
  const { data } = await supabase
    .from('vc_assessments')
    .select('id, status')
    .eq('id', assessmentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return { ok: false };
  return { ok: true, status: data.status as string };
}

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || (!can(profile, 'score:assessment') && !can(profile, 'write:applications'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const assessmentId = url.searchParams.get('assessment_id')?.trim();
  if (!assessmentId || !z.string().uuid().safeParse(assessmentId).success) {
    return NextResponse.json({ error: 'assessment_id query required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const access = await assertAssessmentAccess(supabase, profile.tenant_id, assessmentId);
  if (!access.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('ai_followup_questions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('section_score', { ascending: true, nullsFirst: false })
    .order('generated_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questionRows = (rows ?? []) as FollowupRow[];
  if (questionRows.length > 0) {
    return NextResponse.json({
      questions: questionRows,
      strongSubmission: false,
    });
  }

  const { data: criteriaRows, error: cErr } = await supabase
    .from('vc_assessment_criteria')
    .select('id, criteria_key')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id);
  if (cErr || !criteriaRows?.length) {
    return NextResponse.json({
      questions: [],
      strongSubmission: false,
    });
  }

  const critIds = criteriaRows.map((c: { id: string }) => c.id);
  const { data: subRows } = await supabase
    .from('vc_assessment_subcriteria')
    .select('criteria_id, subcriteria_key, score')
    .eq('tenant_id', profile.tenant_id)
    .in('criteria_id', critIds);

  const subByCrit = new Map<string, Array<{ subcriteria_key: string; score: number | null }>>();
  for (const s of subRows ?? []) {
    const row = s as { criteria_id: string; subcriteria_key: string; score: number | null };
    const arr = subByCrit.get(row.criteria_id) ?? [];
    arr.push({ subcriteria_key: row.subcriteria_key, score: row.score });
    subByCrit.set(row.criteria_id, arr);
  }

  const sectionInputs = buildSectionInputsFromDb(
    criteriaRows as Array<{ criteria_key: string; id: string }>,
    subByCrit,
  );
  const { sections: weakestSummaries, allSectionsAboveThreshold } = computeWeakestSections(sectionInputs);

  if (!allSectionsAboveThreshold && weakestSummaries.length === 0) {
    return NextResponse.json({
      questions: [],
      strongSubmission: false,
    });
  }

  return NextResponse.json({
    questions: [],
    strongSubmission: allSectionsAboveThreshold,
  });
}

export async function POST(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || (!can(profile, 'score:assessment') && !can(profile, 'write:applications'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bodyRaw = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { assessment_id: assessmentId, force_regenerate: forceRegenerate } = parsed.data;

  const userClient = createServerClient();
  const access = await assertAssessmentAccess(userClient, profile.tenant_id, assessmentId);
  if (!access.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = access.status ?? '';
  if (status !== 'completed' && status !== 'approved') {
    return NextResponse.json({ error: 'Assessment must be completed before generating follow-up questions' }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  if (!forceRegenerate) {
    const { data: existing, error: exErr } = await admin
      .from('ai_followup_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('section_score', { ascending: true, nullsFirst: false })
      .order('generated_at', { ascending: true });
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (existing && existing.length > 0) {
      return NextResponse.json({ questions: existing as FollowupRow[], strongSubmission: false, cached: true });
    }
  }

  const { data: assessment, error: aErr } = await admin
    .from('vc_assessments')
    .select('id, tenant_id, application_id, questionnaire_id, overall_score, overall_weighted_score, pass_threshold')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();
  if (aErr || !assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

  const { data: appRow } = await admin
    .from('vc_fund_applications')
    .select('fund_name')
    .eq('id', assessment.application_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();
  const fundName = (appRow as { fund_name?: string } | null)?.fund_name ?? 'Fund';

  const { data: fundRow } = await admin
    .from('vc_portfolio_funds')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', assessment.application_id)
    .maybeSingle();
  const fundId = (fundRow as { id?: string } | null)?.id ?? null;

  const { data: criteriaRows, error: cErr } = await admin
    .from('vc_assessment_criteria')
    .select('id, criteria_key')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id);
  if (cErr || !criteriaRows?.length) {
    return NextResponse.json({ error: 'Assessment criteria not found' }, { status: 400 });
  }

  const critIds = criteriaRows.map((c: { id: string }) => c.id);
  const { data: subRows } = await admin
    .from('vc_assessment_subcriteria')
    .select('criteria_id, subcriteria_key, score')
    .eq('tenant_id', profile.tenant_id)
    .in('criteria_id', critIds);

  const subByCrit = new Map<string, Array<{ subcriteria_key: string; score: number | null }>>();
  for (const s of subRows ?? []) {
    const row = s as { criteria_id: string; subcriteria_key: string; score: number | null };
    const arr = subByCrit.get(row.criteria_id) ?? [];
    arr.push({ subcriteria_key: row.subcriteria_key, score: row.score });
    subByCrit.set(row.criteria_id, arr);
  }

  const sectionInputs = buildSectionInputsFromDb(
    criteriaRows as Array<{ criteria_key: string; id: string }>,
    subByCrit,
  );
  const { sections: weakestSummaries, overallScore, allSectionsAboveThreshold } =
    computeWeakestSections(sectionInputs);

  if (!allSectionsAboveThreshold && weakestSummaries.length === 0) {
    return NextResponse.json(
      { error: 'Could not derive scoring sections for follow-up generation. Ensure the assessment is fully scored.' },
      { status: 400 },
    );
  }

  const overallDisplay =
    assessment.overall_weighted_score != null
      ? Number(assessment.overall_weighted_score)
      : assessment.overall_score != null
        ? Number(assessment.overall_score)
        : overallScore;

  if (allSectionsAboveThreshold) {
    const { data: existingStrong, error: strongExErr } = await admin
      .from('ai_followup_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('section_score', { ascending: true, nullsFirst: false })
      .order('generated_at', { ascending: true });
    if (strongExErr) return NextResponse.json({ error: strongExErr.message }, { status: 500 });
    return NextResponse.json({
      questions: (existingStrong ?? []) as FollowupRow[],
      strongSubmission: true,
      overallScore: overallDisplay,
    });
  }

  const { data: sectionsDd } = await admin
    .from('vc_dd_sections')
    .select('id, section_key, status')
    .eq('questionnaire_id', assessment.questionnaire_id)
    .eq('tenant_id', profile.tenant_id);

  const sectionIds = (sectionsDd ?? []).map((s: { id: string }) => s.id);
  let answersJoined: DdAnswerRow[] = [];
  if (sectionIds.length) {
    const { data: ans } = await admin
      .from('vc_dd_answers')
      .select('question_key, answer_text, answer_value, answer_boolean, answer_json, section_id')
      .eq('tenant_id', profile.tenant_id)
      .in('section_id', sectionIds);

    const sectionMeta = new Map<string, { section_key: string; section_status: string }>();
    for (const s of sectionsDd ?? []) {
      const row = s as { id: string; section_key: string; status: string };
      sectionMeta.set(row.id, { section_key: row.section_key, section_status: row.status });
    }

    answersJoined =
      (ans ?? []).map((a: Record<string, unknown>) => {
        const sid = String(a.section_id ?? '');
        const meta = sectionMeta.get(sid);
        return {
          question_key: String(a.question_key ?? ''),
          answer_text: (a.answer_text as string | null) ?? null,
          answer_value: (a.answer_value as number | null) ?? null,
          answer_boolean: (a.answer_boolean as boolean | null) ?? null,
          answer_json: a.answer_json,
          section_key: meta?.section_key ?? '',
          section_status: meta?.section_status ?? '',
        };
      }) ?? [];
  }

  const userPrompt = buildFollowupUserPrompt({
    fundName,
    overallScore: overallDisplay,
    weakest: weakestSummaries,
    allAnswers: answersJoined,
  });

  let parsedItems: ClaudeFollowupItem[] | null = null;
  const first = await callClaude(userPrompt);
  if (first.ok) {
    parsedItems = parseClaudeFollowupJson(first.text);
  }
  if (!parsedItems || parsedItems.length === 0) {
    const retryPrompt = `${userPrompt}\n\nYou must respond with valid JSON only: a JSON array of exactly 5 objects. No markdown, no backticks, no preamble.`;
    const second = await callClaude(retryPrompt);
    if (second.ok) {
      parsedItems = parseClaudeFollowupJson(second.text);
    }
  }

  if (!parsedItems || parsedItems.length === 0) {
    return NextResponse.json({ error: 'Unable to parse AI response. Try again.' }, { status: 502 });
  }

  const validated = validateFollowupAgainstCriteria(parsedItems).slice(0, 5);
  if (validated.length === 0) {
    return NextResponse.json({ error: 'AI returned no usable questions. Try regenerate.' }, { status: 502 });
  }

  const { data: verRows } = await admin
    .from('ai_followup_questions')
    .select('generation_version')
    .eq('assessment_id', assessmentId)
    .order('generation_version', { ascending: false })
    .limit(1);
  const nextVer =
    verRows && verRows.length > 0 ? Number((verRows[0] as { generation_version: number }).generation_version) + 1 : 1;

  if (forceRegenerate) {
    await admin.from('ai_followup_questions').delete().eq('assessment_id', assessmentId);
  }

  const inserts = validated.map((q) => ({
    assessment_id: assessmentId,
    fund_id: fundId,
    section_key: q.section_key,
    section_label: q.section_label,
    section_score: q.section_score,
    section_max_score: q.section_max_score,
    question: q.question,
    rationale: q.rationale || null,
    generation_version: nextVer,
  }));

  const { data: inserted, error: insErr } = await admin.from('ai_followup_questions').insert(inserts).select('*');
  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  const sorted = [...inserted].sort((x, y) => {
    const sx = Number((x as FollowupRow).section_score ?? 0);
    const sy = Number((y as FollowupRow).section_score ?? 0);
    return sx - sy;
  }) as FollowupRow[];

  return NextResponse.json({ questions: sorted, strongSubmission: false });
}

export async function PATCH(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || (!can(profile, 'score:assessment') && !can(profile, 'write:applications'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabaseAuth = createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bodyRaw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(bodyRaw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { question_id: questionId, used } = parsed.data;

  const userClient = createServerClient();
  const { data: row, error: rErr } = await userClient
    .from('ai_followup_questions')
    .select('id, assessment_id')
    .eq('id', questionId)
    .maybeSingle();
  if (rErr || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: asmt } = await userClient
    .from('vc_assessments')
    .select('id')
    .eq('id', row.assessment_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();
  if (!asmt) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: updated, error: uErr } = await userClient
    .from('ai_followup_questions')
    .update({
      used,
      used_at: used ? new Date().toISOString() : null,
      used_by: used ? user.id : null,
    })
    .eq('id', questionId)
    .select('*')
    .maybeSingle();

  if (uErr || !updated) return NextResponse.json({ error: uErr?.message ?? 'Update failed' }, { status: 500 });

  return NextResponse.json({ question: updated as FollowupRow });
}
