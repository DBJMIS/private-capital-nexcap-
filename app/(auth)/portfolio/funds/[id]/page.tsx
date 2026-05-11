import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { FundDetailClient } from '@/components/portfolio/FundDetailClient';
import { buildCapitalStructureData } from '@/lib/portfolio/capital-structure-data';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  computeFundObligationOverview,
  type FundObligationOverviewObligation,
} from '@/lib/portfolio/fund-obligation-overview';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type { VcFundCoinvestor } from '@/types/database';

export const dynamic = 'force-dynamic';

type Row = PortfolioFundRow & { id: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Fund · ${id.slice(0, 8)}…` };
}

export default async function PortfolioFundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const { id } = await params;
  const supabase = createServerClient();

  const [{ data: fund, error }, { data: obligations }, { data: coinvestorsRaw }] = await Promise.all([
    supabase
      .from('vc_portfolio_funds')
      .select(
        'id, tenant_id, application_id, commitment_id, fund_name, manager_name, fund_manager_id, fund_representative, manager_email, manager_phone, currency, total_fund_commitment, dbj_commitment, dbj_pro_rata_pct, listed, fund_status, year_end_month, quarterly_report_due_days, audit_report_due_days, requires_quarterly_financial, requires_quarterly_inv_mgmt, requires_audited_annual, requires_inhouse_quarterly, report_months, audit_month, exchange_rate_jmd_usd, commitment_date, fund_close_date, fund_life_years, investment_period_years, contacts, notes, created_by, created_at, updated_at, fund_category, fund_end_date, is_pvc, management_fee_pct, performance_fee_pct, hurdle_rate_pct, target_irr_pct, sector_focus, impact_objectives, pctu_profile, fund_size_status, fund_close_lp_count, fund_close_date_actual',
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('vc_reporting_obligations')
      .select(
        'id, fund_id, report_type, period_label, due_date, status, days_overdue, submitted_date, submitted_by, reviewed_date, document_path, document_name, escalation_level, reminder_sent_at, period_year, period_month',
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', id)
      .order('due_date', { ascending: true })
      .limit(100),
    supabase
      .from('vc_fund_coinvestors')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', id)
      .order('commitment_amount', { ascending: false, nullsFirst: false }),
  ]);

  if (error || !fund) notFound();

  const allObs = (obligations ?? []) as FundObligationOverviewObligation[];
  const obligationOverview = computeFundObligationOverview(allObs);
  const sortedDesc = [...allObs].sort((a, b) => b.due_date.localeCompare(a.due_date));
  const initialReportingRows = sortedDesc.slice(0, 20);
  const capitalStructureData = buildCapitalStructureData(fund as Row, (coinvestorsRaw ?? []) as VcFundCoinvestor[]);
  const canEditCapitalStructure = profile.role === 'admin' || profile.role === 'pctu_officer';

  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-gray-500">Loading fund…</div>}>
      <FundDetailClient
        fund={fund as Row}
        obligationOverview={obligationOverview}
        obligationCount={allObs.length}
        initialReportingRows={initialReportingRows as Record<string, unknown>[]}
        canWrite={can(profile, 'write:applications')}
        canDeleteSnapshots={can(profile, 'delete:records')}
        capitalStructureData={capitalStructureData}
        canEditCapitalStructure={canEditCapitalStructure}
      />
    </Suspense>
  );
}
