import { NextResponse } from 'next/server';
import { z } from 'zod';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  scope: z.enum(['full_portfolio', 'by_fund']),
  fund_id: z.string().uuid().optional(),
  force: z.boolean().optional(),
});

type HeadlineStat = { label: string; value: string; context: string };

function stripFence(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toUsd(amount: number, currency: string): number {
  if (currency === 'JMD') return amount / 157;
  return amount;
}

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function loadLatestNarrative(
  supabase: ReturnType<typeof createServerClient>,
  scope: 'full_portfolio' | 'by_fund',
  fundId?: string,
) {
  const { start, end } = currentMonthBounds();
  let q = supabase
    .from('ai_benchmark_narratives')
    .select('id, scope, fund_id, narrative, headline_stats, created_at')
    .eq('scope', scope)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(1);
  if (scope === 'by_fund') {
    q = q.eq('fund_id', fundId ?? '');
  }
  return q.maybeSingle();
}

async function buildStats(
  supabase: ReturnType<typeof createServerClient>,
  tenantId: string,
  scope: 'full_portfolio' | 'by_fund',
  fundId?: string,
) {
  let fundsQ = supabase
    .from('vc_portfolio_funds')
    .select('id, fund_name, fund_status, currency, dbj_commitment, dbj_pro_rata_pct')
    .eq('tenant_id', tenantId);
  if (scope === 'by_fund' && fundId) fundsQ = fundsQ.eq('id', fundId);
  else fundsQ = fundsQ.eq('fund_status', 'active');

  const { data: funds, error: fundErr } = await fundsQ;
  if (fundErr) throw new Error(fundErr.message);
  const fundRows = (funds ?? []) as Array<{
    id: string;
    fund_name: string;
    fund_status: string;
    currency: string;
    dbj_commitment: number;
    dbj_pro_rata_pct: number | null;
  }>;
  const ids = fundRows.map((f) => f.id);
  if (ids.length === 0) throw new Error('No funds found for requested scope');

  const [callsRes, distRes, snapRes, divRes, benchRes] = await Promise.all([
    supabase
      .from('vc_capital_calls')
      .select('fund_id, call_amount, currency')
      .eq('tenant_id', tenantId)
      .in('fund_id', ids),
    supabase
      .from('vc_distributions')
      .select('fund_id, amount, currency')
      .eq('tenant_id', tenantId)
      .in('fund_id', ids),
    supabase
      .from('vc_fund_snapshots')
      .select('fund_id, snapshot_date, nav')
      .eq('tenant_id', tenantId)
      .in('fund_id', ids)
      .order('snapshot_date', { ascending: false }),
    supabase
      .from('vc_divestments')
      .select('fund_id, status, is_full_exit, multiple_on_invested_capital')
      .eq('tenant_id', tenantId)
      .in('fund_id', ids),
    supabase
      .from('benchmark_indices')
      .select('index_name, vintage_year, asset_class, geography, median_irr, top_quartile_irr, median_moic, top_quartile_moic, source, as_of_date')
      .order('as_of_date', { ascending: false }),
  ]);

  if (callsRes.error) throw new Error(callsRes.error.message);
  if (distRes.error) throw new Error(distRes.error.message);
  if (snapRes.error) throw new Error(snapRes.error.message);
  if (divRes.error) throw new Error(divRes.error.message);
  if (benchRes.error) throw new Error(benchRes.error.message);

  const latestSnapshotByFund = new Map<string, { nav: number }>();
  for (const row of (snapRes.data ?? []) as Array<{ fund_id: string; nav: number }>) {
    if (!latestSnapshotByFund.has(row.fund_id)) latestSnapshotByFund.set(row.fund_id, { nav: safeNum(row.nav) });
  }

  let totalCommitted = 0;
  for (const f of fundRows) {
    totalCommitted += toUsd(safeNum(f.dbj_commitment), f.currency);
  }

  let totalDistributions = 0;
  for (const d of (distRes.data ?? []) as Array<{ amount: number; currency: string }>) {
    totalDistributions += toUsd(safeNum(d.amount), d.currency);
  }

  let avgIrr = 0;
  let irrN = 0;
  let unrealised = 0;
  for (const f of fundRows) {
    const s = latestSnapshotByFund.get(f.id);
    if (!s) continue;
    const dbjPct = safeNum(f.dbj_pro_rata_pct) > 0 ? safeNum(f.dbj_pro_rata_pct) / 100 : 1;
    unrealised += toUsd(safeNum(s.nav) * dbjPct, f.currency);
  }

  // Approximate average IRR from latest snapshots reported in `reported_irr` is unavailable here;
  // derive a portfolio-level proxy from DPI + unrealised against called capital.
  let called = 0;
  for (const c of (callsRes.data ?? []) as Array<{ call_amount: number; currency: string }>) {
    called += toUsd(safeNum(c.call_amount), c.currency);
  }
  if (called > 0) {
    const tvpi = (totalDistributions + unrealised) / called;
    avgIrr = Math.max(-10, Math.min(40, (tvpi - 1) * 12));
    irrN = 1;
  }

  const moics = (divRes.data ?? [])
    .map((d) => safeNum((d as { multiple_on_invested_capital: number | null }).multiple_on_invested_capital))
    .filter((m) => m > 0);
  const avgMoic = moics.length > 0 ? moics.reduce((a, b) => a + b, 0) / moics.length : 0;

  const exitedFunds = new Set(
    (divRes.data ?? [])
      .filter((d) => (d as { status: string }).status === 'completed' && (d as { is_full_exit: boolean }).is_full_exit)
      .map((d) => String((d as { fund_id: string }).fund_id)),
  ).size;

  return {
    portfolio: {
      avg_irr: avgIrr,
      avg_moic: avgMoic,
      total_committed_capital_usd: totalCommitted,
      total_distributions_usd: totalDistributions,
      unrealised_value_usd: unrealised,
      active_funds: fundRows.filter((f) => f.fund_status === 'active').length,
      exited_funds: exitedFunds,
      total_called_usd: called,
      irr_observations: irrN,
    },
    funds: fundRows,
    benchmarks: benchRes.data ?? [],
  };
}

function parseClaudeJson(text: string): { narrative: string; headline_stats: HeadlineStat[] } | null {
  try {
    const obj = JSON.parse(stripFence(text)) as { narrative?: unknown; headline_stats?: unknown };
    if (typeof obj.narrative !== 'string' || !Array.isArray(obj.headline_stats)) return null;
    const headline_stats = obj.headline_stats
      .map((s) => s as { label?: unknown; value?: unknown; context?: unknown })
      .filter((s) => typeof s.label === 'string' && typeof s.value === 'string' && typeof s.context === 'string')
      .map((s) => ({ label: s.label as string, value: s.value as string, context: s.context as string }));
    return { narrative: obj.narrative, headline_stats };
  } catch {
    return null;
  }
}

function parseClaudeJsonWithRecovery(text: string): { parsed: { narrative: string; headline_stats: HeadlineStat[] } | null; usedRegex: boolean } {
  const direct = parseClaudeJson(text);
  if (direct) return { parsed: direct, usedRegex: false };
  const jsonBlock = stripFence(text).match(/\{[\s\S]*\}/);
  if (!jsonBlock) return { parsed: null, usedRegex: false };
  const extracted = parseClaudeJson(jsonBlock[0]);
  return { parsed: extracted, usedRegex: true };
}

async function callAnthropicJson(
  apiKey: string,
  model: string,
  system: string,
  userPrompt: string,
): Promise<{ ok: boolean; text: string; errorMessage?: string }> {
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1600,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const raw = (await anthropicRes.json().catch(() => ({}))) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  const text = (raw.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
  return { ok: anthropicRes.ok, text, errorMessage: raw.error?.message };
}

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') === 'by_fund' ? 'by_fund' : 'full_portfolio';
  const fundId = url.searchParams.get('fund_id') ?? undefined;
  const supabase = createServerClient();
  const { data, error } = await loadLatestNarrative(supabase, scope, fundId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ narrative: data ?? null });
}

export async function POST(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bodyRaw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (parsed.data.scope === 'by_fund' && !parsed.data.fund_id) {
    return NextResponse.json({ error: 'fund_id is required for by_fund scope' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: currentMonthNarrative } = await loadLatestNarrative(supabase, parsed.data.scope, parsed.data.fund_id);
  const canRegenerate = profile.role === 'it_admin' || profile.role === 'portfolio_manager' || can(profile, 'write:applications');
  if (currentMonthNarrative && !parsed.data.force) {
    return NextResponse.json({
      narrative: (currentMonthNarrative as { narrative: string }).narrative,
      headline_stats: ((currentMonthNarrative as { headline_stats: Json }).headline_stats as HeadlineStat[]) ?? [],
      generated_at: (currentMonthNarrative as { created_at: string }).created_at,
    });
  }
  if (currentMonthNarrative && parsed.data.force && !canRegenerate) {
    return NextResponse.json({ error: 'Only admin/investment_manager can regenerate' }, { status: 403 });
  }

  try {
    const stats = await buildStats(supabase, profile.tenant_id, parsed.data.scope, parsed.data.fund_id);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });

  const system = `You are a senior investment analyst at the Development Bank of Jamaica preparing a portfolio performance commentary for an executive audience. Write in clear, confident, non-technical English. Be honest about underperformance — do not spin. Use the benchmark data provided as context. Always note that benchmarks are indicative and sourced from public indices.`;
  const user = `Scope: ${parsed.data.scope}
Portfolio/fund stats:
${JSON.stringify(stats.portfolio, null, 2)}

Benchmarks:
${JSON.stringify(stats.benchmarks, null, 2)}

Produce:
1) A 3-paragraph executive narrative (performance vs benchmark, key drivers, outlook).
2) 3 headline callout stats as objects: { "label": "", "value": "", "context": "" }.

Return strict JSON:
{ "narrative": "", "headline_stats": [] }`;

    let parsedClaude: { narrative: string; headline_stats: HeadlineStat[] } | null = null;
    try {
      const firstAttempt = await callAnthropicJson(apiKey, model, system, user);
      if (!firstAttempt.ok) {
        console.error('[benchmark-narrative] Anthropic non-OK response', firstAttempt.errorMessage ?? 'unknown error');
      } else {
        const firstParse = parseClaudeJsonWithRecovery(firstAttempt.text);
        parsedClaude = firstParse.parsed;
        if (!parsedClaude) {
          console.error('[benchmark-narrative] Parse failed on first attempt. Raw response follows.');
          console.error(firstAttempt.text);
        }
        if (!parsedClaude) {
          const retryPrompt = `${user}\n\nYou must respond with valid JSON only. No markdown, no backticks, no preamble.`;
          const secondAttempt = await callAnthropicJson(apiKey, model, system, retryPrompt);
          if (!secondAttempt.ok) {
            console.error('[benchmark-narrative] Anthropic retry non-OK response', secondAttempt.errorMessage ?? 'unknown error');
          } else {
            const secondParse = parseClaudeJsonWithRecovery(secondAttempt.text);
            parsedClaude = secondParse.parsed;
            if (!parsedClaude) {
              console.error('[benchmark-narrative] Parse failed on retry. Raw response follows.');
              console.error(secondAttempt.text);
            }
          }
        }
      }
    } catch (e) {
      console.error('[benchmark-narrative] Anthropic request failed', e);
    }
    if (!parsedClaude) {
      return NextResponse.json({ error: 'Unable to parse valid JSON from Claude response' }, { status: 502 });
    }

    const { data: saved, error: saveErr } = await supabase
      .from('ai_benchmark_narratives')
      .insert({
        scope: parsed.data.scope,
        fund_id: parsed.data.scope === 'by_fund' ? parsed.data.fund_id ?? null : null,
        narrative: parsedClaude.narrative,
        headline_stats: parsedClaude.headline_stats as unknown as Json,
      })
      .select('id, scope, fund_id, narrative, headline_stats, created_at')
      .single();
    if (saveErr || !saved) return NextResponse.json({ error: saveErr?.message ?? 'Failed to save narrative' }, { status: 500 });

    return NextResponse.json({
      narrative: parsedClaude.narrative,
      headline_stats: parsedClaude.headline_stats,
      generated_at: (saved as { created_at: string }).created_at,
    });
  } catch (e) {
    console.error('[benchmark-narrative] Unexpected failure', e);
    return NextResponse.json({ error: 'Benchmark narrative generation failed' }, { status: 500 });
  }
}
