import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { logAndReturn } from '@/lib/api/errors';
import { authOptions } from '@/lib/auth-options';
import { num, PURPOSE_CATEGORY_LABELS } from '@/lib/portfolio/capital-calls';
import { resolvePortalReportingContext } from '@/lib/portal/portal-reporting-access';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { PortalCapitalCallDto, PortalCapitalCallsResponse } from '@/types/portal-capital-calls';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type CallRowRaw = {
  id: string;
  call_amount: unknown;
  currency: string;
  due_date: string | null;
  date_of_notice: string;
  date_paid: string | null;
  notice_number: number;
  total_called_to_date: number | null;
  remaining_commitment: number | null;
  status: string;
  notes: string | null;
};

type ItemRowRaw = {
  id: string;
  capital_call_id: string;
  description: string | null;
  purpose_category: string;
  amount: unknown;
};

function computeSummary(
  calls: ReadonlyArray<{ notice_number: number; call_amount: unknown; total_called_to_date: number | null; remaining_commitment: number | null }>,
  dbjCommitment: number,
): { total_called: number; total_remaining_commitment: number; call_count: number } {
  const sorted = [...calls].sort((a, b) => a.notice_number - b.notice_number);
  const last = sorted[sorted.length - 1];
  const total_called =
    last?.total_called_to_date != null ? num(last.total_called_to_date) : sorted.reduce((s, c) => s + num(c.call_amount), 0);
  const remainingCommitment =
    last?.remaining_commitment != null ? num(last.remaining_commitment) : Math.max(0, dbjCommitment - total_called);
  return {
    total_called,
    total_remaining_commitment: remainingCommitment,
    call_count: calls.length,
  };
}

function itemDescription(row: ItemRowRaw): string {
  const raw = typeof row.description === 'string' ? row.description.trim() : '';
  if (raw) return raw;
  return PURPOSE_CATEGORY_LABELS[row.purpose_category] ?? row.purpose_category.replace(/_/g, ' ');
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'fund_manager' || typeof session.user.tenant_id !== 'string') {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Fund managers only.' }, { status: 401 });
    }

    const { id: applicationId } = await ctx.params;
    const adminClient = createServiceRoleClient();
    const access = await resolvePortalReportingContext(adminClient, session, applicationId);
    if (!access.ok) return access.response;

    const { tenantId, portfolioFund } = access.ctx;

    if (!portfolioFund) {
      const empty: PortalCapitalCallsResponse = {
        portfolio_fund: null,
        summary: { total_called: 0, total_remaining_commitment: 0, call_count: 0, currency: 'USD' },
        capital_calls: [],
      };
      return NextResponse.json(empty);
    }

    const portfolioFundOut: PortalCapitalCallsResponse['portfolio_fund'] = {
      id: portfolioFund.id,
      fund_name: portfolioFund.fund_name,
      dbj_commitment: portfolioFund.dbj_commitment,
      currency: portfolioFund.currency,
    };

    const currency = portfolioFund.currency;
    const dbjCommitment = portfolioFund.dbj_commitment ?? 0;

    const { data: callRows, error: cErr } = await adminClient
      .from('vc_capital_calls')
      .select(
        'id, call_amount, currency, due_date, date_of_notice, date_paid, notice_number, total_called_to_date, remaining_commitment, status, notes',
      )
      .eq('tenant_id', tenantId)
      .eq('fund_id', portfolioFund.id)
      .order('due_date', { ascending: false, nullsFirst: false })
      .order('date_of_notice', { ascending: false });

    if (cErr) return logAndReturn(cErr, 'portal/funds/capital-calls:GET:calls', 'INTERNAL_ERROR', 'Could not load capital calls.', 500);

    const callsRaw = (callRows ?? []) as CallRowRaw[];
    const ids = callsRaw.map((c) => c.id);

    const itemsByCall = new Map<string, ItemRowRaw[]>();
    if (ids.length > 0) {
      const { data: itemRows, error: iErr } = await adminClient
        .from('vc_capital_call_items')
        .select('id, capital_call_id, description, purpose_category, amount')
        .eq('tenant_id', tenantId)
        .in('capital_call_id', ids)
        .order('sort_order', { ascending: true });

      if (iErr)
        return logAndReturn(iErr, 'portal/funds/capital-calls:GET:items', 'INTERNAL_ERROR', 'Could not load capital call items.', 500);

      for (const row of (itemRows ?? []) as ItemRowRaw[]) {
        const list = itemsByCall.get(row.capital_call_id) ?? [];
        list.push(row);
        itemsByCall.set(row.capital_call_id, list);
      }
    }

    const capital_calls: PortalCapitalCallDto[] = callsRaw.map((c) => {
      const rawItems = itemsByCall.get(c.id) ?? [];
      const items = rawItems.map((it) => ({
        id: it.id,
        description: itemDescription(it),
        amount: num(it.amount),
      }));

      return {
        id: c.id,
        call_amount: num(c.call_amount),
        currency: c.currency ?? currency,
        due_date: c.due_date,
        date_of_notice: c.date_of_notice,
        date_paid: c.date_paid,
        notice_number: typeof c.notice_number === 'number' && Number.isFinite(c.notice_number) ? c.notice_number : null,
        total_called_to_date: c.total_called_to_date != null ? num(c.total_called_to_date) : null,
        remaining_commitment: c.remaining_commitment != null ? num(c.remaining_commitment) : null,
        status: c.status,
        notes: c.notes,
        items,
      };
    });

    const summaryNums = computeSummary(callsRaw, dbjCommitment);
    const body: PortalCapitalCallsResponse = {
      portfolio_fund: portfolioFundOut,
      summary: {
        ...summaryNums,
        currency,
      },
      capital_calls,
    };

    return NextResponse.json(body);
  } catch (error) {
    return logAndReturn(error, 'portal/funds/capital-calls:GET', 'INTERNAL_ERROR', 'Could not load capital calls.', 500);
  }
}
