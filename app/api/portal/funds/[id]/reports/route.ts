import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { logAndReturn } from '@/lib/api/errors';
import { authOptions } from '@/lib/auth-options';
import { resolvePortalReportingContext } from '@/lib/portal/portal-reporting-access';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { PortalReportingObligationDto } from '@/types/portal-reports';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type ObligationRaw = {
  id: string;
  report_type: string;
  period_label: string;
  period_year: number;
  due_date: string;
  status: string;
  days_overdue: number;
  submitted_date: string | null;
  submitted_by: string | null;
  review_notes: string | null;
  document_path: string | null;
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Not signed in.' }, { status: 401 });
    }

    const { id: applicationId } = await ctx.params;
    const adminClient = createServiceRoleClient();
    const access = await resolvePortalReportingContext(adminClient, session, applicationId);
    if (!access.ok) return access.response;

    const { tenantId, portfolioFund } = access.ctx;

    if (!portfolioFund) {
      return NextResponse.json({ obligations: [] as PortalReportingObligationDto[], portfolio_fund: null });
    }

    const { data: rows, error: obErr } = await adminClient
      .from('vc_reporting_obligations')
      .select(
        'id, report_type, period_label, period_year, due_date, status, days_overdue, submitted_date, submitted_by, review_notes, document_path',
      )
      .eq('tenant_id', tenantId)
      .eq('fund_id', portfolioFund.id)
      .order('due_date', { ascending: true });

    if (obErr) return logAndReturn(obErr, 'portal/funds/reports:GET:obligations', 'INTERNAL_ERROR', 'Could not load obligations.', 500);

    const list = (rows ?? []) as ObligationRaw[];
    const obligations: PortalReportingObligationDto[] = [];

    for (const row of list) {
      let document_url: string | null = null;
      if (row.document_path?.trim()) {
        const { data: signed, error: sigErr } = await adminClient.storage
          .from('portfolio-reports')
          .createSignedUrl(row.document_path.trim(), 3600);
        if (!sigErr && signed?.signedUrl) document_url = signed.signedUrl;
      }

      obligations.push({
        id: row.id,
        report_type: row.report_type,
        period_label: row.period_label,
        period_year: row.period_year,
        due_date: row.due_date,
        status: row.status,
        days_overdue: typeof row.days_overdue === 'number' ? row.days_overdue : 0,
        submitted_date: row.submitted_date,
        submitted_by: row.submitted_by,
        review_notes: row.review_notes,
        document_url,
      });
    }

    return NextResponse.json({
      obligations,
      portfolio_fund: portfolioFund,
    });
  } catch (error) {
    return logAndReturn(error, 'portal/funds/reports:GET', 'INTERNAL_ERROR', 'Could not load reports.', 500);
  }
}
