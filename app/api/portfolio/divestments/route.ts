import { NextResponse } from 'next/server';
import { z } from 'zod';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import {
  DIVESTMENT_SELECT,
  DIVESTMENT_STATUSES,
  DIVESTMENT_TYPES,
  type DivestmentRow,
  summarizeDivestments,
} from '@/lib/portfolio/divestments';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  fund_id: z.string().uuid(),
  company_name: z.string().min(1),
  divestment_type: z.enum(DIVESTMENT_TYPES),
  completion_date: z.string().min(1),
  announcement_date: z.string().optional().nullable(),
  original_investment_amount: z.number().positive(),
  proceeds_received: z.number().min(0),
  currency: z.enum(['USD', 'JMD']),
  is_full_exit: z.boolean(),
  remaining_stake_pct: z.number().min(0).max(100).optional().nullable(),
  exit_route: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  buyer_name: z.string().optional().nullable(),
  status: z.enum(DIVESTMENT_STATUSES),
});

function validYear(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1900 || n > 9999) return null;
  return n;
}

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const url = new URL(req.url);
  const fundId = url.searchParams.get('fund_id')?.trim() || null;
  const type = url.searchParams.get('type')?.trim() || null;
  const status = url.searchParams.get('status')?.trim() || null;
  const year = validYear(url.searchParams.get('year'));

  let q = supabase
    .from('vc_divestments')
    .select(DIVESTMENT_SELECT)
    .eq('tenant_id', profile.tenant_id);
  if (fundId) q = q.eq('fund_id', fundId);
  if (type) q = q.eq('divestment_type', type);
  if (status) q = q.eq('status', status);
  if (year) {
    q = q.gte('completion_date', `${year}-01-01`).lte('completion_date', `${year}-12-31`);
  }

  const { data, error } = await q.order('completion_date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const divestments = (data ?? []) as DivestmentRow[];
  const fundIds = [...new Set(divestments.map((d) => d.fund_id))];
  const { data: funds } = fundIds.length
    ? await supabase
        .from('vc_portfolio_funds')
        .select('id, fund_name')
        .eq('tenant_id', profile.tenant_id)
        .in('id', fundIds)
    : { data: [] };
  const fundById = new Map((funds ?? []).map((f) => [String((f as { id: string }).id), { fund_name: String((f as { fund_name: string }).fund_name) }]));

  return NextResponse.json({
    divestments,
    summary: summarizeDivestments(divestments, fundById),
  });
}

export async function POST(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    const details = e instanceof z.ZodError ? e.flatten().fieldErrors : 'Invalid body';
    return NextResponse.json({ error: 'Validation failed', details }, { status: 400 });
  }

  if (body.divestment_type === 'partial_exit' && (body.remaining_stake_pct == null || Number.isNaN(body.remaining_stake_pct))) {
    return NextResponse.json({ error: 'remaining_stake_pct is required for partial_exit' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, currency')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', body.fund_id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
  if ((fund as { currency: string }).currency !== body.currency) {
    return NextResponse.json({ error: 'currency must match fund currency' }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    fund_id: body.fund_id,
    company_name: body.company_name.trim(),
    divestment_type: body.divestment_type,
    completion_date: body.completion_date,
    announcement_date: body.announcement_date ?? null,
    original_investment_amount: body.original_investment_amount,
    proceeds_received: body.proceeds_received,
    currency: body.currency,
    is_full_exit: body.is_full_exit,
    remaining_stake_pct: body.is_full_exit ? null : (body.remaining_stake_pct ?? null),
    exit_route: body.exit_route?.trim() || null,
    notes: body.notes?.trim() || null,
    buyer_name: body.buyer_name?.trim() || null,
    status: body.status,
    created_by: profile.profile_id,
  };

  const { data: created, error } = await supabase.from('vc_divestments').insert(insert).select(DIVESTMENT_SELECT).single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? 'Failed to create' }, { status: 500 });

  return NextResponse.json({ divestment: created }, { status: 201 });
}
