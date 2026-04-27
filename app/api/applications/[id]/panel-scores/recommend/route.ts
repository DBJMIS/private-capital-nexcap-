import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { PANEL_CRITERIA, PANEL_CRITERION_KEYS, PANEL_SCORING_GROUPS, type PanelRating } from '@/lib/applications/panel-scoring';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type AiRecommendationPayload = {
  recommendation: 'full_dd' | 'conditional_dd' | 'no_dd';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  strengths: string[];
  concerns: string[];
  conditions: string;
  reasoning: string;
};

function formatScoresForPrompt(scores: { criterion_key: string; rating: string }[]): string {
  const byKey = new Map(scores.map((s) => [s.criterion_key, s.rating]));
  const lines: string[] = [];
  for (const group of PANEL_SCORING_GROUPS) {
    lines.push(`\n## ${group.category}`);
    for (const item of group.items) {
      const r = byKey.get(item.key) ?? '—';
      lines.push(`- ${item.label} (${item.key}): ${r}`);
    }
  }
  return lines.join('\n');
}

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

function parseAiJson(text: string): AiRecommendationPayload | null {
  try {
    const raw = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
    const rec = raw.recommendation;
    if (rec !== 'full_dd' && rec !== 'conditional_dd' && rec !== 'no_dd') return null;
    const conf = raw.confidence;
    if (conf !== 'high' && conf !== 'medium' && conf !== 'low') return null;
    const summary = typeof raw.summary === 'string' ? raw.summary : '';
    const strengths = Array.isArray(raw.strengths) ? raw.strengths.map((s) => String(s)) : [];
    const concerns = Array.isArray(raw.concerns) ? raw.concerns.map((s) => String(s)) : [];
    const conditions = typeof raw.conditions === 'string' ? raw.conditions : '';
    const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : '';
    return {
      recommendation: rec,
      confidence: conf,
      summary,
      strengths,
      concerns,
      conditions,
      reasoning,
    };
  } catch {
    return null;
  }
}

function isPanelRating(s: string): s is PanelRating {
  return s === 'S' || s === 'R' || s === 'W' || s === 'I';
}

export async function POST(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: {
    scores?: { criterion_key: string; rating: string }[];
    member_name?: string;
    fund_name?: string;
    panel_member_id?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 });
  }

  const panelMemberId = String(body.panel_member_id ?? '').trim();
  const memberName = String(body.member_name ?? '').trim();
  const fundName = String(body.fund_name ?? '').trim() || 'Fund manager';
  const scoresIn = Array.isArray(body.scores) ? body.scores : [];

  if (!panelMemberId) {
    return NextResponse.json({ data: null, error: 'panel_member_id is required' }, { status: 400 });
  }

  const byKey = new Map<string, string>();
  for (const s of scoresIn) {
    const k = String(s.criterion_key ?? '').trim();
    const r = String(s.rating ?? '').trim();
    if (k && PANEL_CRITERION_KEYS.has(k) && isPanelRating(r)) byKey.set(k, r);
  }
  if (byKey.size !== PANEL_CRITERIA.length) {
    return NextResponse.json(
      { data: null, error: `All ${PANEL_CRITERIA.length} criteria must have a valid S, R, W, or I rating` },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return NextResponse.json({ data: null, error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  }

  const supabase = createServerClient();
  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, cfp_id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!app) return NextResponse.json({ data: null, error: 'Application not found' }, { status: 404 });
  const cfpId = (app as { cfp_id: string | null }).cfp_id;
  if (!cfpId) return NextResponse.json({ data: null, error: 'Application has no linked CFP' }, { status: 400 });

  const { data: member } = await supabase
    .from('vc_panel_members')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('cfp_id', cfpId)
    .eq('id', panelMemberId)
    .maybeSingle();
  if (!member) return NextResponse.json({ data: null, error: 'Panel member not found for this CFP' }, { status: 404 });

  const scoresForPrompt = PANEL_CRITERIA.map((c) => ({
    criterion_key: c.key,
    rating: byKey.get(c.key)!,
  }));
  const formattedBlock = formatScoresForPrompt(scoresForPrompt);

  const system = `You are a DBJ investment analyst reviewing panel evaluation scores for a private capital fund manager.
You must return valid JSON only. No other text.`;

  const userPrompt = `A panel member has rated a fund manager across ${PANEL_CRITERIA.length} criteria using S (Strong), R (Regular), W (Weak), I (Incomplete).

Fund: ${fundName}
Panel member: ${memberName || 'Panel member'}

Scores by category:
${formattedBlock}

Based on these scores, provide a recommendation:

Return JSON with exactly this structure:
{
  "recommendation": "full_dd" | "conditional_dd" | "no_dd",
  "confidence": "high" | "medium" | "low",
  "summary": "2 sentence summary of overall performance",
  "strengths": ["key strength 1", "key strength 2", "key strength 3"],
  "concerns": ["concern 1", "concern 2"],
  "conditions": "Only if conditional_dd — specific conditions required",
  "reasoning": "One paragraph explaining the recommendation"
}

Scoring guide:
- full_dd: Predominantly S and R ratings, strong team and investment thesis, minor weaknesses acceptable
- conditional_dd: Mix of S/R/W, some critical areas are weak but fundable with conditions
- no_dd: Multiple W and I ratings, especially in Team, Investment Strategy, or Governance categories

Weight these categories more heavily:
- TEAM (most important)
- INVESTMENT THESIS
- GOVERNANCE
- FIRM background`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return NextResponse.json(
      { data: null, error: `Claude API error (${anthropicRes.status}): ${errText.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const anthropicJson = (await anthropicRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlock = anthropicJson.content?.find((c) => c.type === 'text')?.text ?? '';
  const parsed = parseAiJson(textBlock);
  if (!parsed) {
    return NextResponse.json({ data: null, error: 'Could not parse AI response as valid recommendation JSON' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const payload = parsed as unknown as Record<string, unknown>;

  const { data: existingEval } = await supabase
    .from('vc_panel_evaluations')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .eq('panel_member_id', panelMemberId)
    .maybeSingle();

  let evaluationId: string;
  if (existingEval) {
    evaluationId = (existingEval as { id: string }).id;
    const { error: upErr } = await supabase
      .from('vc_panel_evaluations')
      .update({
        ai_recommendation: payload,
        ai_recommended_at: now,
      })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', evaluationId);
    if (upErr) return NextResponse.json({ data: null, error: upErr.message }, { status: 500 });
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('vc_panel_evaluations')
      .insert({
        tenant_id: profile.tenant_id,
        application_id: applicationId,
        cfp_id: cfpId,
        panel_member_id: panelMemberId,
        status: 'pending',
        ai_recommendation: payload,
        ai_recommended_at: now,
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      return NextResponse.json({ data: null, error: insErr?.message ?? 'Failed to create evaluation' }, { status: 500 });
    }
    evaluationId = (inserted as { id: string }).id;
  }

  return NextResponse.json({
    data: {
      recommendation: parsed,
      evaluation_id: evaluationId,
    },
    error: null,
  });
}
