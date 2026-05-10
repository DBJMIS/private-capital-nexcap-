import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logAndReturn } from '@/lib/api/errors';

type AdminClient = SupabaseClient;

type ApplicationRow = {
  id: string;
  tenant_id: string;
  fund_manager_id: string | null;
  created_by: string;
};

export type ResolvedPortalPortfolioFund = {
  id: string;
  fund_name: string;
  dbj_commitment: number | null;
  currency: string;
};

export type ResolvedPortalPortfolio = {
  tenantId: string;
  userId: string;
  /** Value stored on `vc_reporting_obligations.submitted_by` */
  portalSubmitterLabel: string;
  portfolioFund: ResolvedPortalPortfolioFund | null;
};

/**
 * Validates fund-manager session + access to fund workspace [id].
 * [id] may be a `vc_fund_applications` id (Path A/B) or a `vc_portfolio_funds` id (Path C).
 * Loads linked portfolio fund for reporting.
 */
export async function resolvePortalReportingContext(
  adminClient: AdminClient,
  session: Session,
  fundOrApplicationId: string,
): Promise<{ ok: true; ctx: ResolvedPortalPortfolio } | { ok: false; response: NextResponse }> {
  if (
    !session?.user?.id ||
    session.user.role !== 'fund_manager' ||
    typeof session.user.tenant_id !== 'string'
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'UNAUTHORISED', message: 'Fund managers only.' }, { status: 401 }),
    };
  }

  const tenantId = session.user.tenant_id;
  const userId = session.user.id;
  const portalSubmitterLabel =
    (typeof session.user.email === 'string' && session.user.email.trim()) ||
    (typeof session.user.name === 'string' && session.user.name.trim()) ||
    userId;

  const { data: contact } = await adminClient
    .from('fund_manager_contacts')
    .select('id, fund_manager_id')
    .eq('portal_user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { data: app, error: appErr } = await adminClient
    .from('vc_fund_applications')
    .select('id, tenant_id, fund_manager_id, created_by')
    .eq('id', fundOrApplicationId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr) {
    return {
      ok: false,
      response: logAndReturn(appErr, 'portal/reports-access:application', 'INTERNAL_ERROR', 'Could not load fund.', 500),
    };
  }

  if (app) {
    const application = app as ApplicationRow;
    const hasAccess =
      application.created_by === userId ||
      !!(contact?.fund_manager_id && application.fund_manager_id === contact.fund_manager_id);

    if (!hasAccess) {
      return { ok: false, response: NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden.' }, { status: 403 }) };
    }

    const { data: pfRow, error: pfErr } = await adminClient
      .from('vc_portfolio_funds')
      .select('id, fund_name, dbj_commitment, currency')
      .eq('tenant_id', tenantId)
      .eq('application_id', application.id)
      .maybeSingle();

    if (pfErr) {
      return {
        ok: false,
        response: logAndReturn(pfErr, 'portal/reports-access:portfolio', 'INTERNAL_ERROR', 'Could not load portfolio fund.', 500),
      };
    }

    const portfolioFund = pfRow
      ? {
          id: (pfRow as { id: string }).id,
          fund_name: (pfRow as { fund_name: string }).fund_name,
          dbj_commitment:
            (pfRow as { dbj_commitment: number | null }).dbj_commitment != null
              ? Number((pfRow as { dbj_commitment: number }).dbj_commitment)
              : null,
          currency: String((pfRow as { currency: string }).currency ?? 'USD').trim() || 'USD',
        }
      : null;

    return {
      ok: true,
      ctx: { tenantId, userId, portalSubmitterLabel, portfolioFund },
    };
  }

  const { data: pfDirect, error: pfDirectErr } = await adminClient
    .from('vc_portfolio_funds')
    .select('id, fund_name, dbj_commitment, currency, fund_manager_id')
    .eq('id', fundOrApplicationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (pfDirectErr) {
    return {
      ok: false,
      response: logAndReturn(pfDirectErr, 'portal/reports-access:path_c_pf', 'INTERNAL_ERROR', 'Could not load portfolio fund.', 500),
    };
  }

  if (!pfDirect) {
    return { ok: false, response: NextResponse.json({ error: 'NOT_FOUND', message: 'Fund not found.' }, { status: 404 }) };
  }

  const hasPathCAccess =
    contact?.fund_manager_id != null &&
    (pfDirect as { fund_manager_id: string | null }).fund_manager_id != null &&
    contact.fund_manager_id === (pfDirect as { fund_manager_id: string | null }).fund_manager_id;

  if (!hasPathCAccess) {
    return { ok: false, response: NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden.' }, { status: 403 }) };
  }

  const portfolioFund: ResolvedPortalPortfolioFund = {
    id: (pfDirect as { id: string }).id,
    fund_name: (pfDirect as { fund_name: string }).fund_name,
    dbj_commitment:
      (pfDirect as { dbj_commitment: number | null }).dbj_commitment != null
        ? Number((pfDirect as { dbj_commitment: number }).dbj_commitment)
        : null,
    currency: String((pfDirect as { currency: string }).currency ?? 'USD').trim() || 'USD',
  };

  return {
    ok: true,
    ctx: { tenantId, userId, portalSubmitterLabel, portfolioFund },
  };
}
