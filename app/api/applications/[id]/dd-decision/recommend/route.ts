import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import type { CriterionAggregate } from '@/lib/applications/dd-decision-aggregate';
import { PANEL_SCORING_GROUPS } from '@/lib/applications/panel-scoring';
import { loadDdDecisionAggregation } from '@/lib/applications/dd-decision-loader';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export type DdCombinedAiRecommendation = {
  recommendation: 'full_dd' | 'conditional_dd' | 'no_dd';
  confidence: 'high' | 'medium' | 'low';
  weighted_score: number;
  summary: string;
  strong_points: string[];
  weak_points: string[];
  conditions: string | null;
  reasoning: string;
  category_highlights: { strongest: string; weakest: string };
};

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function parseCombinedAi(text: string): DdCombinedAiRecommendation | null {
  try {
    const raw = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
    const rec = raw.recommendation;
    if (rec !== 'full_dd' && rec !== 'conditional_dd' && rec !== 'no_dd') return null;
    const conf = raw.confidence;
    if (conf !== 'high' && conf !== 'medium' && conf !== 'low') return null;
    const summary = typeof raw.summary === 'string' ? raw.summary : '';
    const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : '';
    const strong_points = asStringArray(raw.strong_points);
    const weak_points = asStringArray(raw.weak_points);
    const conditions =
      raw.conditions === null || raw.conditions === undefined
        ? null
        : typeof raw.conditions === 'string'
          ? raw.conditions
          : String(raw.conditions);
    const ch = raw.category_highlights;
    let strongest = '';
    let weakest = '';
    if (ch && typeof ch === 'object' && !Array.isArray(ch)) {
      const o = ch as Record<string, unknown>;
      strongest = typeof o.strongest === 'string' ? o.strongest : '';
      weakest = typeof o.weakest === 'string' ? o.weakest : '';
    }
    const wsRaw = raw.weighted_score;
    const weighted_score =
      typeof wsRaw === 'number' && Number.isFinite(wsRaw)
        ? wsRaw
        : typeof wsRaw === 'string'
          ? Number(wsRaw)
          : NaN;
    if (!Number.isFinite(weighted_score)) return null;
    return {
      recommendation: rec,
      confidence: conf,
      weighted_score: Math.round(weighted_score * 100) / 100,
      summary,
      strong_points,
      weak_points,
      conditions,
      reasoning,
      category_highlights: { strongest, weakest },
    };
  } catch {
    return null;
  }
}

function buildCategoryAveragesBlock(av: Record<string, number>): string {
  const lines: string[] = [];
  for (const g of PANEL_SCORING_GROUPS) {
    const v = av[g.category] ?? 0;
    lines.push(`- ${g.category}: ${v}/4`);
  }
  return lines.join('\n');
}

function buildCriteriaBlock(criteria: CriterionAggregate[]): string {
  const byKey = new Map(criteria.map((c) => [c.criterion_key, c]));
  const lines: string[] = [];
  for (const group of PANEL_SCORING_GROUPS) {
    lines.push(`${group.category}:`);
    for (const item of group.items) {
      const c = byKey.get(item.key);
      if (!c) {
        lines.push(`- ${item.label}: S:0 R:0 W:0 I:0`);
        continue;
      }
      lines.push(`- ${item.label}: S:${c.scores.S} R:${c.scores.R} W:${c.scores.W} I:${c.scores.I}`);
    }
  }
  return lines.join('\n');
}

export async function POST(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let force = false;
  try {
    const b = (await req.json()) as { force?: boolean };
    force = Boolean(b.force);
  } catch {
    force = false;
  }

  const supabase = createServerClient();
  const bundle = await loadDdDecisionAggregation(supabase, profile.tenant_id, applicationId);
  if (!bundle.ok) {
    return NextResponse.json({ data: null, error: bundle.error }, { status: bundle.status });
  }

  if (bundle.dd_row?.ai_recommendation && !force) {
    const cached = bundle.dd_row.ai_recommendation as unknown;
    return NextResponse.json({
      data: {
        recommendation: cached,
        ai_recommended_at: bundle.dd_row.ai_recommended_at,
        ai_weighted_score: bundle.dd_row.ai_weighted_score,
        cached: true as const,
      },
      error: null,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return NextResponse.json({ data: null, error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  }

  const criteriaBlock = buildCriteriaBlock(bundle.criteria_aggregates);
  const categoryAvgBlock = buildCategoryAveragesBlock(bundle.category_averages);

  const system = `You are a senior DBJ investment committee analyst.
You must return valid JSON only. No other text.`;

  const userPrompt = `You are reviewing the combined panel evaluation scores for a fund manager applying to the Development Bank of Jamaica's VC programme.

Fund: ${bundle.fund_name}
Number of panel members: ${bundle.panel_evaluation_count}

COMBINED SCORES BY CATEGORY:
(For each criterion show: criterion name and the count of S/R/W/I votes from all members)

${criteriaBlock}

PANEL DD VOTES:
- Full Due Diligence: ${bundle.vote_totals.full_dd} votes
- Conditional DD: ${bundle.vote_totals.conditional_dd} votes
- No Due Diligence: ${bundle.vote_totals.no_dd} votes

CATEGORY AVERAGES (S=4, R=3, W=2, I=1):
${categoryAvgBlock}

Overall average (same scale): ${bundle.overall_average}/4

Based on this combined panel assessment, provide a decision recommendation.

Weight these categories more heavily:
TEAM (30%), INVESTMENT THESIS (25%), GOVERNANCE (20%), FIRM (15%), others (10%)

Decision thresholds:
- full_dd: Weighted average >= 3.0 AND majority panel votes for DD AND no critical category below 2.5
- conditional_dd: Weighted average 2.5-2.9 OR mixed votes OR one critical category weak
- no_dd: Weighted average < 2.5 OR majority NDD votes OR Team/Governance below 2.0

Return JSON:
{
  "recommendation": "full_dd"|"conditional_dd"|"no_dd",
  "confidence": "high"|"medium"|"low",
  "weighted_score": 3.2,
  "summary": "2-3 sentence overall assessment",
  "strong_points": [
    "Specific strength with evidence from scores"
  ],
  "weak_points": [
    "Specific concern with evidence from scores"
  ],
  "conditions": "Specific conditions if conditional_dd, null otherwise",
  "reasoning": "Paragraph explaining the recommendation based on the scores",
  "category_highlights": {
    "strongest": "TEAM",
    "weakest": "FINANCIALS"
  }
}`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
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
  const parsed = parseCombinedAi(textBlock);
  if (!parsed) {
    return NextResponse.json({ data: null, error: 'Could not parse AI response as valid recommendation JSON' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const payload = parsed as unknown as Record<string, unknown>;

  if (bundle.dd_row?.id) {
    const { error: upErr } = await supabase
      .from('vc_dd_decisions')
      .update({
        ai_recommendation: payload,
        ai_recommended_at: now,
        ai_weighted_score: parsed.weighted_score,
      })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', bundle.dd_row.id);
    if (upErr) return NextResponse.json({ data: null, error: upErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await supabase.from('vc_dd_decisions').insert({
      tenant_id: profile.tenant_id,
      application_id: applicationId,
      ai_recommendation: payload,
      ai_recommended_at: now,
      ai_weighted_score: parsed.weighted_score,
    });
    if (insErr) return NextResponse.json({ data: null, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      recommendation: parsed,
      ai_recommended_at: now,
      ai_weighted_score: parsed.weighted_score,
      cached: false as const,
    },
    error: null,
  });
}
