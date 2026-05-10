import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { logAndReturn } from '@/lib/api/errors';
import { authOptions } from '@/lib/auth-options';
import { loadPortalDashboardPortfolioMetrics } from '@/lib/portal/portal-fund-workspace-portfolio-metrics';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { PortalDashboardResponse } from '@/types/portal-dashboard';

export const dynamic = 'force-dynamic';

export type { PortalDashboardResponse } from '@/types/portal-dashboard';

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
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Not signed in.' }, { status: 401 });
    }
    if (session.user.role !== 'fund_manager') {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Fund managers only.' }, { status: 401 });
    }

    const userId = session.user.id;
    const tenantId = session.user.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Missing tenant context.' }, { status: 401 });
    }

    const adminClient = createServiceRoleClient();

    const { data: contactRecord, error: contactErr } = await adminClient
      .from('fund_manager_contacts')
      .select('id, fund_manager_id')
      .eq('portal_user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (contactErr) {
      return logAndReturn(contactErr, 'portal/dashboard:contact', 'INTERNAL_ERROR', 'Could not resolve contact access.', 500);
    }

    const { data: appRows, error: appErr } = contactRecord?.fund_manager_id
      ? await adminClient
          .from('vc_fund_applications')
          .select('id, tenant_id, fund_manager_id, fund_name, manager_name, status, submitted_at, rejection_reason, created_at, cfp_id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .or(`created_by.eq.${userId},fund_manager_id.eq.${contactRecord.fund_manager_id}`)
          .order('created_at', { ascending: false })
      : await adminClient
          .from('vc_fund_applications')
          .select('id, tenant_id, fund_manager_id, fund_name, manager_name, status, submitted_at, rejection_reason, created_at, cfp_id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .eq('created_by', userId)
          .order('created_at', { ascending: false });

    if (appErr) {
      return logAndReturn(appErr, 'portal/dashboard:application', 'INTERNAL_ERROR', 'Could not load application.', 500);
    }

    const applications = (appRows ?? []) as ApplicationRow[];
    type ActiveFund = Extract<PortalDashboardResponse, { state: 'active' }>['funds'][number];
    const funds: ActiveFund[] = [];

    for (const application of applications) {
      const { data: qRow, error: qErr } = await adminClient
        .from('vc_dd_questionnaires')
        .select('id, status, started_at, completed_at')
        .eq('tenant_id', tenantId)
        .eq('application_id', application.id)
        .limit(1)
        .maybeSingle();
      if (qErr) {
        return logAndReturn(qErr, 'portal/dashboard:questionnaire', 'INTERNAL_ERROR', 'Could not load questionnaire.', 500);
      }

      let questionnaire: ActiveFund['questionnaire'] = null;
      if (qRow?.id) {
        const { data: sections, error: secErr } = await adminClient
          .from('vc_dd_sections')
          .select('status')
          .eq('tenant_id', tenantId)
          .eq('questionnaire_id', qRow.id as string);
        if (secErr) {
          return logAndReturn(secErr, 'portal/dashboard:sections', 'INTERNAL_ERROR', 'Could not load questionnaire sections.', 500);
        }
        const total_sections = (sections ?? []).length;
        const completed_sections = (sections ?? []).filter((s) => (s as { status: string }).status === 'completed').length;
        questionnaire = {
          id: qRow.id as string,
          status: String((qRow as { status: string }).status),
          completed_sections,
          total_sections,
          all_complete: total_sections > 0 && completed_sections === total_sections,
          started_at: (qRow as { started_at?: string | null }).started_at ?? null,
          completed_at: (qRow as { completed_at?: string | null }).completed_at ?? null,
        };
      }

      let cfp: ActiveFund['cfp'] = null;
      if (application.cfp_id) {
        const { data: cfpRow, error: cfpErr } = await adminClient
          .from('vc_cfps')
          .select('title, status, closing_date')
          .eq('tenant_id', tenantId)
          .eq('id', application.cfp_id)
          .maybeSingle();
        if (cfpErr) {
          return logAndReturn(cfpErr, 'portal/dashboard:cfp', 'INTERNAL_ERROR', 'Could not load CFP.', 500);
        }
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
        .limit(1)
        .maybeSingle();
      if (pfErr) {
        return logAndReturn(pfErr, 'portal/dashboard:portfolio_by_app', 'INTERNAL_ERROR', 'Could not load portfolio fund.', 500);
      }

      const portfolio_fund: ActiveFund['portfolio_fund'] = pfRow
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

      let obligations: ActiveFund['obligations'] = null;
      let obligations_summary: ActiveFund['obligations_summary'] = null;
      let capital_calls: ActiveFund['capital_calls'] = [];
      let latest_snapshot: ActiveFund['latest_snapshot'] = null;

      if (portfolio_fund) {
        const m = await loadPortalDashboardPortfolioMetrics(adminClient, tenantId, portfolio_fund.id, 3);
        if (!m.ok) {
          return logAndReturn(m.error, 'portal/dashboard:portfolio_metrics', 'INTERNAL_ERROR', 'Could not load portfolio metrics.', 500);
        }
        obligations = m.metrics.obligations;
        obligations_summary = m.metrics.obligations_summary;
        capital_calls = m.metrics.capital_calls;
        latest_snapshot = m.metrics.latest_snapshot;
      }

      const isPortfolio =
        ['committed', 'contract_signed', 'funded'].includes(application.status) || portfolio_fund !== null;

      funds.push({
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
      });
    }

    /** Path C: portfolio funds seeded without `vc_fund_applications` (direct `fund_manager_id` match). */
    if (contactRecord?.fund_manager_id) {
      const linkedPfIds = new Set(funds.map((f) => f.portfolio_fund?.id).filter((x): x is string => Boolean(x)));

      const { data: directRows, error: directErr } = await adminClient
        .from('vc_portfolio_funds')
        .select('id, fund_name, fund_status, dbj_commitment, currency, manager_name, commitment_date')
        .eq('tenant_id', tenantId)
        .eq('fund_manager_id', contactRecord.fund_manager_id)
        .eq('fund_status', 'active')
        .is('application_id', null);

      if (directErr) {
        return logAndReturn(directErr, 'portal/dashboard:direct_portfolio', 'INTERNAL_ERROR', 'Could not load portfolio funds.', 500);
      }

      for (const raw of directRows ?? []) {
        const pf = raw as {
          id: string;
          fund_name: string;
          fund_status: string;
          dbj_commitment: number | null;
          currency: string;
          manager_name: string;
          commitment_date: string | null;
        };
        if (linkedPfIds.has(pf.id)) continue;

        const m = await loadPortalDashboardPortfolioMetrics(adminClient, tenantId, pf.id, 3);
        if (!m.ok) {
          return logAndReturn(m.error, 'portal/dashboard:path_c_metrics', 'INTERNAL_ERROR', 'Could not load portfolio metrics.', 500);
        }

        funds.push({
          application: null,
          questionnaire: null,
          cfp: null,
          portfolio_fund: {
            id: pf.id,
            fund_name: pf.fund_name,
            fund_status: pf.fund_status ?? 'active',
            dbj_commitment: pf.dbj_commitment,
            currency: pf.currency ?? 'USD',
            manager_name: pf.manager_name,
            commitment_date: pf.commitment_date,
          },
          obligations: m.metrics.obligations,
          obligations_summary: m.metrics.obligations_summary,
          capital_calls: m.metrics.capital_calls,
          latest_snapshot: m.metrics.latest_snapshot,
          stage: 'portfolio',
          is_direct_portfolio: true,
          portfolio_fund_id: pf.id,
        });
      }
    }

    if (funds.length === 0) {
      const empty: PortalDashboardResponse = { state: 'no_application', funds: [] };
      return NextResponse.json(empty);
    }

    const body: PortalDashboardResponse = { state: 'active', funds };
    return NextResponse.json(body);
  } catch (e) {
    return logAndReturn(e, 'portal/dashboard:GET', 'INTERNAL_ERROR', 'Dashboard unavailable.', 500);
  }
}
