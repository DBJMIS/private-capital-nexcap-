import { NextResponse } from 'next/server';
import { z } from 'zod';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  fund_manager_id: z.string().uuid(),
});

type TimelineEvent = { date: string; event: string; outcome: string };
type RelationshipHealth = 'STRONG' | 'DEVELOPING' | 'STRAINED' | 'INACTIVE';
type RelationshipProfile = {
  summary: string;
  strengths: string[];
  concerns: string[];
  interaction_timeline: TimelineEvent[];
  dd_history: {
    submissions: number;
    avg_score: number;
    highest_score: number;
    sections_consistently_weak: string[];
  };
  relationship_health: RelationshipHealth;
  recommended_next_steps: string[];
  data_gaps: string[];
  last_updated: string;
};

type AssessmentSummaryRow = { id: string; completed_at: string | null };
type FollowupHistoryRow = {
  assessment_id: string;
  section_label: string;
  section_score: number | null;
  section_max_score: number | null;
  used: boolean | null;
  generated_at: string;
};

function buildFollowUpQuestionHistoryBlock(
  assessments: AssessmentSummaryRow[],
  followups: FollowupHistoryRow[],
): string {
  if (!followups.length) {
    return 'No AI follow-up questions recorded for this manager\'s DD assessments.';
  }

  const byAssessment = new Map<string, FollowupHistoryRow[]>();
  for (const f of followups) {
    const arr = byAssessment.get(f.assessment_id) ?? [];
    arr.push(f);
    byAssessment.set(f.assessment_id, arr);
  }

  const weakSectionCounts = new Map<string, number>();
  for (const f of followups) {
    const max = Number(f.section_max_score ?? 0);
    const sc = Number(f.section_score ?? 0);
    if (max <= 0) continue;
    const pct = (sc / max) * 100;
    if (pct < 60) {
      weakSectionCounts.set(f.section_label, (weakSectionCounts.get(f.section_label) ?? 0) + 1);
    }
  }
  const persistentGaps = [...weakSectionCounts.entries()].filter(([, n]) => n >= 2).map(([label]) => label);

  const blocks: string[] = [];
  for (const a of assessments) {
    const qs = byAssessment.get(a.id);
    if (!qs?.length) continue;
    const subDate = a.completed_at ?? qs[0]?.generated_at ?? '';
    const genCount = qs.length;
    const usedCount = qs.filter((x) => x.used === true).length;
    blocks.push(
      `Submission date: ${subDate}\nQuestions generated: ${genCount}\nQuestions used in meetings: ${usedCount}`,
    );
  }

  blocks.push(
    `Sections with persistent gaps (scored below 60% on multiple submissions): ${
      persistentGaps.length ? persistentGaps.join(', ') : 'none identified'
    }`,
  );

  return blocks.join('\n\n');
}

function parseProfile(text: string): RelationshipProfile | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const candidates = [cleaned];
  const extracted = cleaned.match(/\{[\s\S]*\}/);
  if (extracted?.[0]) candidates.push(extracted[0]);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as Partial<RelationshipProfile>;
      if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.concerns)) continue;
      const health = parsed.relationship_health;
      const validHealth: RelationshipHealth =
        health === 'STRONG' || health === 'DEVELOPING' || health === 'STRAINED' || health === 'INACTIVE' ? health : 'DEVELOPING';
      return {
        summary: parsed.summary,
        strengths: parsed.strengths.filter((x): x is string => typeof x === 'string'),
        concerns: parsed.concerns.filter((x): x is string => typeof x === 'string'),
        interaction_timeline: (parsed.interaction_timeline ?? [])
          .filter((x): x is TimelineEvent => !!x && typeof x === 'object' && typeof x.date === 'string' && typeof x.event === 'string' && typeof x.outcome === 'string')
          .slice(0, 20),
        dd_history: {
          submissions: Number(parsed.dd_history?.submissions ?? 0) || 0,
          avg_score: Number(parsed.dd_history?.avg_score ?? 0) || 0,
          highest_score: Number(parsed.dd_history?.highest_score ?? 0) || 0,
          sections_consistently_weak: (parsed.dd_history?.sections_consistently_weak ?? []).filter((x): x is string => typeof x === 'string'),
        },
        relationship_health: validHealth,
        recommended_next_steps: (parsed.recommended_next_steps ?? []).filter((x): x is string => typeof x === 'string'),
        data_gaps: (parsed.data_gaps ?? []).filter((x): x is string => typeof x === 'string'),
        last_updated: typeof parsed.last_updated === 'string' ? parsed.last_updated : new Date().toISOString(),
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const triggerSecret = process.env.RELATIONSHIP_PROFILE_TRIGGER_SECRET;
  const triggerHeader = req.headers.get('x-relationship-trigger-secret');
  const isInternalTrigger = !!triggerSecret && triggerHeader === triggerSecret;

  let profile = null as Awaited<ReturnType<typeof getProfile>> | null;
  if (!isInternalTrigger) {
    await requireAuth();
    profile = await getProfile();
    if (!profile || !can(profile, 'write:applications')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const bodyRaw = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(bodyRaw);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const fundManagerId = parsedBody.data.fund_manager_id;

  const supabase = createServiceRoleClient();

  const { data: manager, error: managerErr } = await supabase
    .from('fund_managers')
    .select('id, tenant_id, name, firm_name, email, phone, linkedin_url, first_contact_date, created_at')
    .eq('id', fundManagerId)
    .maybeSingle();
  if (managerErr) return NextResponse.json({ error: managerErr.message }, { status: 500 });
  if (!manager) return NextResponse.json({ error: 'Fund manager not found' }, { status: 404 });
  if (profile && manager.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: funds, error: fundsErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, tenant_id, application_id, fund_name, manager_name, commitment_date, fund_close_date, fund_status, created_at')
    .eq('tenant_id', manager.tenant_id)
    .eq('fund_manager_id', fundManagerId);
  if (fundsErr) return NextResponse.json({ error: fundsErr.message }, { status: 500 });

  const fundRows = funds ?? [];
  const fundIds = fundRows.map((f) => f.id);
  const applicationIds = fundRows.map((f) => f.application_id).filter((x): x is string => !!x);

  const [appsRes, decisionsRes, assessmentsRes, quarterlyRes, siteVisitsRes, divestmentsRes, notesRes, latestProfileRes] = await Promise.all([
    applicationIds.length
      ? supabase
          .from('vc_fund_applications')
          .select('id, tenant_id, status, submitted_at, created_at, updated_at')
          .eq('tenant_id', manager.tenant_id)
          .in('id', applicationIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabase
          .from('vc_dd_decisions')
          .select('application_id, ai_weighted_score, final_decision, decision_overrides_ai, weak_points, strong_points, conditions, decided_at, updated_at')
          .eq('tenant_id', manager.tenant_id)
          .in('application_id', applicationIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabase
          .from('vc_assessments')
          .select('id, application_id, overall_weighted_score, recommendation, status, completed_at, updated_at')
          .eq('tenant_id', manager.tenant_id)
          .in('application_id', applicationIds)
      : Promise.resolve({ data: [], error: null }),
    fundIds.length
      ? supabase
          .from('vc_quarterly_assessments')
          .select('fund_id, status, divestment_recommendation, recommendation_override_reason, assessment_date, updated_at')
          .eq('tenant_id', manager.tenant_id)
          .in('fund_id', fundIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabase
          .from('vc_site_visits')
          .select('application_id, status, outcome, outcome_notes, actual_date, created_at, updated_at')
          .eq('tenant_id', manager.tenant_id)
          .in('application_id', applicationIds)
      : Promise.resolve({ data: [], error: null }),
    fundIds.length
      ? supabase
          .from('vc_divestments')
          .select('fund_id, company_name, divestment_type, status, completion_date, proceeds_received, multiple_on_invested_capital, created_at')
          .eq('tenant_id', manager.tenant_id)
          .in('fund_id', fundIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('fund_manager_notes')
      .select('id, note, added_by, created_at')
      .eq('tenant_id', manager.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .order('created_at', { ascending: true }),
    supabase
      .from('ai_relationship_profiles')
      .select('version')
      .eq('tenant_id', manager.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const errors = [appsRes.error, decisionsRes.error, assessmentsRes.error, quarterlyRes.error, siteVisitsRes.error, divestmentsRes.error, notesRes.error, latestProfileRes.error].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0]?.message ?? 'Failed loading manager context' }, { status: 500 });
  }

  const assessmentRows = (assessmentsRes.data ?? []) as AssessmentSummaryRow[];
  const assessmentIds = assessmentRows.map((a) => a.id).filter(Boolean);

  let followupsRes: { data: FollowupHistoryRow[] | null; error: { message: string } | null } = {
    data: [],
    error: null,
  };
  if (assessmentIds.length > 0) {
    const fr = await supabase
      .from('ai_followup_questions')
      .select('assessment_id, section_label, section_score, section_max_score, used, generated_at')
      .in('assessment_id', assessmentIds);
    followupsRes = {
      data: (fr.data ?? []) as FollowupHistoryRow[],
      error: fr.error,
    };
  }
  if (followupsRes.error) {
    return NextResponse.json({ error: followupsRes.error.message }, { status: 500 });
  }

  const followUpHistoryBlock = buildFollowUpQuestionHistoryBlock(assessmentRows, followupsRes.data ?? []);

  const timeline: TimelineEvent[] = [];
  if (manager.first_contact_date) {
    timeline.push({ date: manager.first_contact_date, event: 'First contact', outcome: 'Relationship initiated' });
  }
  for (const app of appsRes.data ?? []) {
    if (app.submitted_at) timeline.push({ date: app.submitted_at, event: 'DD submission', outcome: `Application ${app.status}` });
  }
  for (const a of assessmentsRes.data ?? []) {
    if (a.completed_at) timeline.push({ date: a.completed_at, event: 'DD scoring completed', outcome: `Recommendation: ${a.recommendation ?? 'n/a'}` });
  }
  for (const d of decisionsRes.data ?? []) {
    if (d.decided_at) timeline.push({ date: d.decided_at, event: 'IC memo/decision', outcome: d.final_decision ?? 'pending' });
  }
  for (const q of quarterlyRes.data ?? []) {
    timeline.push({
      date: q.assessment_date ?? q.updated_at ?? new Date().toISOString(),
      event: 'Portfolio assessment',
      outcome: q.divestment_recommendation ?? q.status ?? 'updated',
    });
  }
  for (const x of divestmentsRes.data ?? []) {
    timeline.push({
      date: x.completion_date ?? x.created_at ?? new Date().toISOString(),
      event: 'Divestment outcome',
      outcome: `${x.company_name}: ${x.status}`,
    });
  }
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  const systemPrompt =
    'You are an institutional relationship intelligence analyst at the Development Bank of Jamaica. Your role is to synthesise all available information about a fund manager into a structured profile that helps DBJ staff build on prior knowledge, avoid repeating due diligence already done, and approach future interactions strategically. Be factual. Flag gaps where data is thin.';
  const userPrompt = `Manager context:\n${JSON.stringify(
    {
      manager,
      funds: fundRows,
      dd_applications: appsRes.data ?? [],
      dd_scores: assessmentsRes.data ?? [],
      dd_decisions: decisionsRes.data ?? [],
      override_and_portfolio_records: quarterlyRes.data ?? [],
      site_visits: siteVisitsRes.data ?? [],
      divestments: divestmentsRes.data ?? [],
      staff_notes: notesRes.data ?? [],
      timeline,
      ai_followup_questions_summary: followupsRes.data ?? [],
    },
    null,
    2,
  )}\n\nFOLLOW-UP QUESTION HISTORY:\n${followUpHistoryBlock}\n\nReturn JSON only:\n{\n  "summary": "2-3 sentence overview of the manager and DBJ's relationship",\n  "strengths": ["..."],\n  "concerns": ["..."],\n  "interaction_timeline": [{ "date": "", "event": "", "outcome": "" }],\n  "dd_history": { "submissions": 0, "avg_score": 0, "highest_score": 0, "sections_consistently_weak": [] },\n  "relationship_health": "STRONG | DEVELOPING | STRAINED | INACTIVE",\n  "recommended_next_steps": ["..."],\n  "data_gaps": ["..."],\n  "last_updated": ""\n}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });

  const callClaude = async (prompt: string) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
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
  };

  let parsed = null as RelationshipProfile | null;
  const first = await callClaude(userPrompt);
  if (!first.ok) {
    console.error('[relationship-profile] Claude call failed', first.err ?? 'unknown');
  } else {
    parsed = parseProfile(first.text);
    if (!parsed) {
      console.error('[relationship-profile] Failed to parse response. Raw follows:');
      console.error(first.text);
      const second = await callClaude(`${userPrompt}\n\nYou must respond with valid JSON only. No markdown, no backticks, no preamble.`);
      if (second.ok) {
        parsed = parseProfile(second.text);
        if (!parsed) {
          console.error('[relationship-profile] Retry parse failed. Raw follows:');
          console.error(second.text);
        }
      } else {
        console.error('[relationship-profile] Retry call failed', second.err ?? 'unknown');
      }
    }
  }
  if (!parsed) {
    return NextResponse.json({ error: 'Unable to generate relationship profile JSON' }, { status: 502 });
  }

  const nextVersion = Number(latestProfileRes.data?.version ?? 0) + 1;
  const dataPoints =
    fundRows.length +
    (appsRes.data?.length ?? 0) +
    (assessmentsRes.data?.length ?? 0) +
    (decisionsRes.data?.length ?? 0) +
    (quarterlyRes.data?.length ?? 0) +
    (siteVisitsRes.data?.length ?? 0) +
    (divestmentsRes.data?.length ?? 0) +
    (notesRes.data?.length ?? 0) +
    (followupsRes.data?.length ?? 0);

  const profilePayload: RelationshipProfile = {
    ...parsed,
    interaction_timeline: parsed.interaction_timeline.length > 0 ? parsed.interaction_timeline : timeline,
    dd_history: {
      submissions: parsed.dd_history.submissions || (appsRes.data?.length ?? 0),
      avg_score: parsed.dd_history.avg_score,
      highest_score: parsed.dd_history.highest_score,
      sections_consistently_weak: parsed.dd_history.sections_consistently_weak,
    },
    last_updated: new Date().toISOString(),
  };

  const { data: saved, error: saveErr } = await supabase
    .from('ai_relationship_profiles')
    .insert({
      tenant_id: manager.tenant_id,
      fund_manager_id: fundManagerId,
      profile: {
        ...profilePayload,
        ai_generated: true,
        staff_notes_count: notesRes.data?.length ?? 0,
        data_points: dataPoints,
      } as unknown as Json,
      version: nextVersion,
    })
    .select('id, generated_at, version, profile')
    .single();
  if (saveErr || !saved) return NextResponse.json({ error: saveErr?.message ?? 'Failed to save profile' }, { status: 500 });

  return NextResponse.json({
    fund_manager_id: fundManagerId,
    version: saved.version,
    generated_at: saved.generated_at,
    profile: saved.profile,
    data_points: dataPoints,
  });
}
