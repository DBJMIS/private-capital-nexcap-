import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { logAndReturn } from '@/lib/api/errors';
import { authOptions } from '@/lib/auth-options';
import { loadPortalFundWorkspacePortfolioMetrics } from '@/lib/portal/portal-fund-workspace-portfolio-metrics';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { PortalDashboardResponse } from '@/types/portal-dashboard';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type ApplicationRow = {
  id: string;
  tenant_id: string;
  fund_manager_id: string | null;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  cfp_id: string | null;
  created_by: string;
};

type PortfolioFundRow = {
  id: string;
  fund_name: string;
  fund_status: string;
  dbj_commitment: number | null;
  currency: string;
  manager_name: string;
  commitment_date: string | null;
  fund_manager_id: string | null;
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'fund_manager' || !session.user.tenant_id) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Fund managers only.' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const tenantId = session.user.tenant_id;
    const userId = session.user.id;
    const adminClient = createServiceRoleClient();

    const { data: contact } = await adminClient
      .from('fund_manager_contacts')
      .select('id, fund_manager_id')
      .eq('portal_user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const { data: app, error: appErr } = await adminClient
      .from('vc_fund_applications')
      .select('id, tenant_id, fund_manager_id, fund_name, manager_name, status, submitted_at, rejection_reason, created_at, cfp_id, created_by')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (appErr) return logAndReturn(appErr, 'portal/funds/[id]:app', 'INTERNAL_ERROR', 'Could not load fund.', 500);

    type FundShape = Extract<PortalDashboardResponse, { state: 'active' }>['funds'][number];

    if (app) {
      const application = app as ApplicationRow;
      const hasAccess =
        application.created_by === userId ||
        !!(contact?.fund_manager_id && application.fund_manager_id === contact.fund_manager_id);
      if (!hasAccess) {
        return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
      }

      const { data: qRow, error: qErr } = await adminClient
        .from('vc_dd_questionnaires')
        .select('id, status, started_at, completed_at')
        .eq('tenant_id', tenantId)
        .eq('application_id', application.id)
        .maybeSingle();
      if (qErr) return logAndReturn(qErr, 'portal/funds/[id]:questionnaire', 'INTERNAL_ERROR', 'Could not load questionnaire.', 500);

      let questionnaire: FundShape['questionnaire'] = null;
      if (qRow?.id) {
        const { data: sections, error: sErr } = await adminClient
          .from('vc_dd_sections')
          .select('status')
          .eq('tenant_id', tenantId)
          .eq('questionnaire_id', qRow.id as string);
        if (sErr) return logAndReturn(sErr, 'portal/funds/[id]:sections', 'INTERNAL_ERROR', 'Could not load questionnaire sections.', 500);
        const total = (sections ?? []).length;
        const complete = (sections ?? []).filter((r) => (r as { status: string }).status === 'completed').length;
        questionnaire = {
          id: qRow.id as string,
          status: String((qRow as { status: string }).status),
          completed_sections: complete,
          total_sections: total,
          all_complete: total > 0 && total === complete,
          started_at: (qRow as { started_at?: string | null }).started_at ?? null,
          completed_at: (qRow as { completed_at?: string | null }).completed_at ?? null,
        };
      }

      let cfp: FundShape['cfp'] = null;
      if (application.cfp_id) {
        const { data: cfpRow } = await adminClient
          .from('vc_cfps')
          .select('title, status, closing_date')
          .eq('tenant_id', tenantId)
          .eq('id', application.cfp_id)
          .maybeSingle();
        if (cfpRow) {
          cfp = {
            title: (cfpRow as { title: string }).title,
            status: (cfpRow as { status: string }).status,
            closing_date: (cfpRow as { closing_date: string | null }).closing_date ?? null,
          };
        }
      }

      const { data: pfRow, error: pfErr } = await adminClient
        .from('vc_portfolio_funds')
        .select('id, fund_name, fund_status, dbj_commitment, currency, manager_name, commitment_date')
        .eq('tenant_id', tenantId)
        .eq('application_id', application.id)
        .maybeSingle();
      if (pfErr) return logAndReturn(pfErr, 'portal/funds/[id]:portfolio', 'INTERNAL_ERROR', 'Could not load portfolio fund.', 500);
      const portfolio_fund: FundShape['portfolio_fund'] = pfRow
        ? {
            id: (pfRow as { id: string }).id,
            fund_name: (pfRow as { fund_name: string }).fund_name,
            fund_status: (pfRow as { fund_status: string }).fund_status,
            dbj_commitment: (pfRow as { dbj_commitment: number | null }).dbj_commitment,
            currency: (pfRow as { currency: string }).currency,
            manager_name: (pfRow as { manager_name: string }).manager_name,
            commitment_date: (pfRow as { commitment_date: string | null }).commitment_date ?? null,
          }
        : null;

      let obligations: FundShape['obligations'] = null;
      let obligations_summary: FundShape['obligations_summary'] = null;
      let capital_calls: FundShape['capital_calls'] = [];
      let latest_snapshot: FundShape['latest_snapshot'] = null;
      if (portfolio_fund) {
        const m = await loadPortalFundWorkspacePortfolioMetrics(adminClient, tenantId, portfolio_fund.id, 20);
        if (!m.ok) return logAndReturn(m.error, 'portal/funds/[id]:metrics', 'INTERNAL_ERROR', 'Could not load portfolio metrics.', 500);
        obligations = m.metrics.obligations;
        obligations_summary = m.metrics.obligations_summary;
        capital_calls = m.metrics.capital_calls;
        latest_snapshot = m.metrics.latest_snapshot;
      }

      const isPortfolio = ['committed', 'contract_signed', 'funded'].includes(application.status) || portfolio_fund !== null;
      const fund: FundShape = {
        application: {
          id: application.id,
          fund_name: application.fund_name,
          manager_name: application.manager_name,
          status: application.status,
          submitted_at: application.submitted_at,
          rejection_reason: application.rejection_reason,
          created_at: application.created_at,
        },
        cfp,
        questionnaire,
        portfolio_fund,
        obligations,
        obligations_summary,
        capital_calls,
        latest_snapshot,
        stage: isPortfolio ? 'portfolio' : 'onboarding',
      };

      return NextResponse.json(fund);
    }

    const { data: pfDirect, error: pfDirectErr } = await adminClient
      .from('vc_portfolio_funds')
      .select('id, fund_name, fund_status, dbj_commitment, currency, manager_name, commitment_date, fund_manager_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (pfDirectErr) return logAndReturn(pfDirectErr, 'portal/funds/[id]:path_c_pf', 'INTERNAL_ERROR', 'Could not load fund.', 500);
    if (!pfDirect) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Fund not found.' }, { status: 404 });
    }

    const portfolioFundDirect = pfDirect as PortfolioFundRow;
    const hasPathCAccess =
      contact?.fund_manager_id != null &&
      portfolioFundDirect.fund_manager_id != null &&
      contact.fund_manager_id === portfolioFundDirect.fund_manager_id;
    if (!hasPathCAccess) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const m = await loadPortalFundWorkspacePortfolioMetrics(adminClient, tenantId, portfolioFundDirect.id, 20);
    if (!m.ok) return logAndReturn(m.error, 'portal/funds/[id]:path_c_metrics', 'INTERNAL_ERROR', 'Could not load portfolio metrics.', 500);

    const portfolio_fund: FundShape['portfolio_fund'] = {
      id: portfolioFundDirect.id,
      fund_name: portfolioFundDirect.fund_name,
      fund_status: portfolioFundDirect.fund_status ?? 'active',
      dbj_commitment: portfolioFundDirect.dbj_commitment,
      currency: portfolioFundDirect.currency ?? 'USD',
      manager_name: portfolioFundDirect.manager_name,
      commitment_date: portfolioFundDirect.commitment_date,
    };

    const fund: FundShape = {
      application: null,
      questionnaire: null,
      cfp: null,
      portfolio_fund,
      obligations: m.metrics.obligations,
      obligations_summary: m.metrics.obligations_summary,
      capital_calls: m.metrics.capital_calls,
      latest_snapshot: m.metrics.latest_snapshot,
      stage: 'portfolio',
      is_direct_portfolio: true,
      portfolio_fund_id: portfolioFundDirect.id,
    };

    return NextResponse.json(fund);
  } catch (error) {
    return logAndReturn(error, 'portal/funds/[id]:GET', 'INTERNAL_ERROR', 'Could not load fund workspace.', 500);
  }
}
