import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { logAndReturn } from '@/lib/api/errors';
import { authOptions } from '@/lib/auth-options';
import { daysFromNow } from '@/lib/portal/format-helpers';
import { resolvePortalReportingContext } from '@/lib/portal/portal-reporting-access';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { PortalComplianceObligationDto, PortalComplianceResponse, PortalComplianceSummaryDto } from '@/types/portal-compliance';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type ObligationRaw = {
  id: string;
  report_type: string;
  period_label: string;
  period_year: number;
  period_month: number | null;
  due_date: string;
  status: string;
  days_overdue: number;
  submitted_date: string | null;
  review_notes: string | null;
  document_path: string | null;
};

function isOverdueRow(o: Pick<ObligationRaw, 'status' | 'days_overdue' | 'due_date'>): boolean {
  if (o.status === 'overdue') return true;
  if (typeof o.days_overdue === 'number' && o.days_overdue > 0) return true;
  return daysFromNow(o.due_date) < 0;
}

function isDueSoonRow(o: ObligationRaw): boolean {
  const ex = new Set<string>(['submitted', 'accepted', 'waived']);
  if (ex.has(o.status)) return false;
  const d = daysFromNow(o.due_date);
  return d >= 0 && d <= 30;
}

function computeSummary(obligations: ObligationRaw[]): PortalComplianceSummaryDto {
  let overdue = 0;
  let due_soon = 0;
  let submitted = 0;
  let accepted = 0;
  const total = obligations.length;

  for (const o of obligations) {
    const od = isOverdueRow(o);
    if (od) overdue += 1;
    else if (isDueSoonRow(o)) due_soon += 1;
    if (o.status === 'submitted') submitted += 1;
    if (o.status === 'accepted') accepted += 1;
  }

  const upcoming = Math.max(0, total - overdue - due_soon - submitted - accepted);

  return { total, overdue, due_soon, submitted, accepted, upcoming };
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
      const body: PortalComplianceResponse = {
        portfolio_fund: null,
        summary: null,
        obligations: [],
      };
      return NextResponse.json(body);
    }

    const { data: rows, error: obErr } = await adminClient
      .from('vc_reporting_obligations')
      .select(
        'id, report_type, period_label, period_year, period_month, due_date, status, days_overdue, submitted_date, review_notes, document_path',
      )
      .eq('tenant_id', tenantId)
      .eq('fund_id', portfolioFund.id)
      .order('due_date', { ascending: true });

    if (obErr)
      return logAndReturn(obErr, 'portal/funds/compliance:GET:obligations', 'INTERNAL_ERROR', 'Could not load obligations.', 500);

    const rawList = (rows ?? []) as ObligationRaw[];

    const obligations: PortalComplianceObligationDto[] = [];
    for (const row of rawList) {
      let document_url: string | null = null;
      if (row.document_path?.trim()) {
        const { data: signed, error: sigErr } = await adminClient.storage
          .from('portfolio-reports')
          .createSignedUrl(row.document_path.trim(), 3600);
        if (!sigErr && signed?.signedUrl) document_url = signed.signedUrl;
      }

      const pm =
        typeof row.period_month === 'number' && Number.isFinite(row.period_month) ? row.period_month : null;

      obligations.push({
        id: row.id,
        report_type: row.report_type,
        period_label: row.period_label,
        period_year: row.period_year,
        period_month: pm,
        due_date: row.due_date,
        status: row.status,
        days_overdue: typeof row.days_overdue === 'number' && Number.isFinite(row.days_overdue) ? row.days_overdue : 0,
        submitted_date: row.submitted_date,
        review_notes: row.review_notes,
        document_url,
      });
    }

    const summary = computeSummary(rawList);

    const body: PortalComplianceResponse = {
      portfolio_fund: { id: portfolioFund.id, fund_name: portfolioFund.fund_name },
      summary,
      obligations,
    };

    return NextResponse.json(body);
  } catch (error) {
    return logAndReturn(error, 'portal/funds/compliance:GET', 'INTERNAL_ERROR', 'Could not load compliance obligations.', 500);
  }
}
