import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { Button } from '@/components/ui/button';
import { dsCard, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';
import { CfpInfoStrip } from '@/components/cfp/CfpInfoStrip';
import { AssignCfpWithRefresh } from '@/components/fund-applications/AssignCfpWithRefresh';
import type { ActiveCfpOption } from '@/components/fund-applications/AssignCfpMenu';
import { ApplicationPipelineWorkspace } from '@/components/applications/ApplicationPipelineWorkspace';
import type { PrequalificationRow } from '@/lib/prequalification/types';
import type { DdQuestionnaireWorkspace } from '@/lib/applications/dd-questionnaire-workspace';
import type { AssessmentCriteriaProgressRow, VcAssessmentSummary } from '@/lib/applications/assessment-workspace';
import type { VcCommitment, VcContract, VcSiteVisit } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function FundApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const { id: applicationId } = await params;
  const supabase = createServerClient();
  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select(
      'id, fund_name, manager_name, status, submitted_at, created_at, cfp_id, country_of_incorporation, geographic_area, total_capital_commitment_usd, pipeline_metadata',
    )
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) notFound();

  const row = app as {
    id: string;
    fund_name: string;
    manager_name: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    cfp_id: string | null;
    country_of_incorporation: string;
    geographic_area: string;
    total_capital_commitment_usd: number;
    pipeline_metadata: Record<string, unknown> | null;
  };

  let cfpStrip: { id: string; title: string; status: string; closing_date: string } | null = null;
  if (row.cfp_id) {
    const { data: cfpRow } = await supabase
      .from('vc_cfps')
      .select('id, title, status, closing_date')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', row.cfp_id)
      .maybeSingle();
    if (cfpRow) {
      const c = cfpRow as { id: string; title: string; status: string; closing_date: string };
      cfpStrip = { id: c.id, title: c.title, status: c.status, closing_date: c.closing_date };
    }
  }

  const { data: activeRows } = await supabase
    .from('vc_cfps')
    .select('id, title, closing_date')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .order('closing_date', { ascending: true });

  const activeCfps: ActiveCfpOption[] = (activeRows ?? []).map((r) => ({
    id: (r as { id: string }).id,
    title: (r as { title: string }).title,
    closing_date: (r as { closing_date: string }).closing_date,
  }));

  const showPreScreeningLink = row.status !== 'draft';

  const [{ data: prequalification }, { data: presentation }, { data: panelEvaluations }, { data: panelMembers }, { data: questionnaireRaw }, { data: assessmentRaw }, { data: siteVisitRaw }, { data: contractRaw }, { data: commitmentRaw }] =
    await Promise.all([
      supabase
        .from('vc_prequalification')
        .select(
          'id, tenant_id, application_id, s21_company_info, s21_fund_info, s21_fund_strategy, s21_fund_management, s21_legal_regulatory, s21_comments, s22_company_management, s22_fund_general, s22_fund_financial, s22_fund_esg, s22_comments, date_received, time_received, soft_copy_received, hard_copy_received, prequalified, not_prequalified, reviewed_by, reviewer_name, reviewed_at, overall_status, ai_summary, ai_analysed_at, proposal_document_path, created_at, updated_at',
        )
        .eq('tenant_id', profile.tenant_id)
        .eq('application_id', row.id)
        .maybeSingle(),
      supabase
        .from('vc_presentations')
        .select('id, status, scheduled_date, actual_date')
        .eq('tenant_id', profile.tenant_id)
        .eq('application_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vc_panel_evaluations')
        .select('id, status')
        .eq('tenant_id', profile.tenant_id)
        .eq('application_id', row.id),
      row.cfp_id
        ? supabase
            .from('vc_panel_members')
            .select('id')
            .eq('tenant_id', profile.tenant_id)
            .eq('cfp_id', row.cfp_id)
            .eq('is_fund_manager', false)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      supabase
        .from('vc_dd_questionnaires')
        .select(
          `
      id,
      status,
      completed_at,
      vc_dd_sections (
        id,
        section_key,
        status,
        section_order
      )
    `,
        )
        .eq('tenant_id', profile.tenant_id)
        .eq('application_id', row.id)
        .maybeSingle(),
      supabase
        .from('vc_assessments')
        .select('id, status, overall_score, passed, recommendation, completed_at')
        .eq('tenant_id', profile.tenant_id)
        .eq('application_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vc_site_visits')
        .select(
          'id, tenant_id, application_id, scheduled_date, actual_date, status, location, dbj_attendees, outcome, outcome_notes, legal_docs_reviewed, legal_docs_notes, report_file_path, report_file_name, notes, conducted_by, created_by, created_at, updated_at',
        )
        .eq('application_id', row.id)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle(),
      supabase
        .from('vc_contracts')
        .select(
          'id, tenant_id, application_id, contract_type, status, commitment_amount, commitment_currency, dbj_pro_rata_pct, management_fee_pct, carried_interest_pct, hurdle_rate_pct, fund_life_years, investment_period_years, legal_review_started_at, legal_review_completed_at, legal_reviewer_notes, adobe_sign_agreement_id, adobe_sign_status, signed_at, signed_by_dbj, signed_by_fund_manager, contract_file_path, contract_file_name, negotiation_rounds, created_by, created_at, updated_at',
        )
        .eq('application_id', row.id)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle(),
      supabase
        .from('vc_commitments')
        .select(
          'id, tenant_id, application_id, contract_id, fund_name, manager_name, fund_representative, commitment_amount, commitment_currency, dbj_pro_rata_pct, fund_year_end_month, listed, quarterly_report_due_days, audit_report_due_days, status, committed_at, first_drawdown_date, fund_close_date, created_by, created_at, updated_at',
        )
        .eq('application_id', row.id)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle(),
    ]);

  const panelSubmittedCount = (panelEvaluations ?? []).filter((e) => (e as { status: string }).status === 'submitted').length;

  const questionnaire: DdQuestionnaireWorkspace | null = questionnaireRaw
    ? (() => {
        const q = questionnaireRaw as {
          id: string;
          status: string | null;
          completed_at: string | null;
          vc_dd_sections?: Array<{ id: string; section_key: string; status: string; section_order?: number }>;
        };
        const raw = Array.isArray(q.vc_dd_sections) ? q.vc_dd_sections : [];
        const sections = [...raw]
          .sort((a, b) => (a.section_order ?? 0) - (b.section_order ?? 0))
          .map(({ id, section_key, status }) => ({ id, section_key, status }));
        return {
          id: q.id,
          status: q.status,
          completed_at: q.completed_at,
          sections,
        };
      })()
    : null;

  const assessment: VcAssessmentSummary | null = assessmentRaw
    ? {
        id: (assessmentRaw as { id: string }).id,
        status: (assessmentRaw as { status: string | null }).status ?? null,
        overall_score: (assessmentRaw as { overall_score: number | null }).overall_score ?? null,
        passed: (assessmentRaw as { passed: boolean | null }).passed ?? null,
        recommendation: (assessmentRaw as { recommendation: string | null }).recommendation ?? null,
        completed_at: (assessmentRaw as { completed_at: string | null }).completed_at ?? null,
      }
    : null;

  let criteriaProgress: AssessmentCriteriaProgressRow[] = [];
  if (assessment) {
    const { data: critRows } = await supabase
      .from('vc_assessment_criteria')
      .select('criteria_key, weighted_score')
      .eq('tenant_id', profile.tenant_id)
      .eq('assessment_id', assessment.id);

    criteriaProgress = (critRows ?? []).map((c) => ({
      criteria_key: (c as { criteria_key: string }).criteria_key,
      weighted_score: (c as { weighted_score: number | null }).weighted_score ?? null,
    }));
  }

  const siteVisit = (siteVisitRaw as VcSiteVisit | null) ?? null;

  const contract = (contractRaw as VcContract | null) ?? null;

  const commitment = (commitmentRaw as VcCommitment | null) ?? null;

  let portfolioFundId: string | null = null;
  if (commitment) {
    const { data: pfByCommit } = await supabase
      .from('vc_portfolio_funds')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('commitment_id', commitment.id)
      .maybeSingle();
    portfolioFundId = (pfByCommit as { id: string } | null)?.id ?? null;
  }
  if (!portfolioFundId) {
    const { data: pfByApp } = await supabase
      .from('vc_portfolio_funds')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('application_id', row.id)
      .maybeSingle();
    portfolioFundId = (pfByApp as { id: string } | null)?.id ?? null;
  }

  const [siteVisitSigned, contractSigned] = await Promise.all([
    siteVisit?.report_file_path
      ? supabase.storage.from('application-documents').createSignedUrl(siteVisit.report_file_path, 3600)
      : Promise.resolve({ data: null }),
    contract?.contract_file_path
      ? supabase.storage.from('application-documents').createSignedUrl(contract.contract_file_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const siteVisitReportSignedUrl = siteVisitSigned.data?.signedUrl ?? null;
  const contractFileSignedUrl = contractSigned.data?.signedUrl ?? null;

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/fund-applications">← Fund applications</Link>
        </Button>
      </div>

      {!cfpStrip ? (
        <div className={cn(dsCard.padded, 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
          <div>
            <p className={dsType.sectionTitle}>Call for Proposals</p>
            <p className={cn('mt-1 text-sm', dsType.muted)}>No CFP linked yet. Assign an active CFP for this application.</p>
          </div>
          <AssignCfpWithRefresh applicationId={row.id} activeCfps={activeCfps} />
        </div>
      ) : null}

      <ApplicationPipelineWorkspace
        application={row}
        cfp={cfpStrip}
        prequalification={(prequalification as PrequalificationRow | null) ?? null}
        presentation={
          presentation
            ? {
                status: (presentation as { status: string | null }).status ?? null,
                scheduled_date: (presentation as { scheduled_date: string | null }).scheduled_date ?? null,
                actual_date: (presentation as { actual_date: string | null }).actual_date ?? null,
              }
            : null
        }
        panelSubmittedCount={panelSubmittedCount}
        panelTotalCount={(panelMembers ?? []).length}
        questionnaire={questionnaire}
        assessment={assessment}
        criteriaProgress={criteriaProgress}
        canWrite={can(profile, 'write:applications')}
        pipelineMetadata={row.pipeline_metadata}
        siteVisit={siteVisit}
        contract={contract}
        commitment={commitment}
        siteVisitReportSignedUrl={siteVisitReportSignedUrl}
        contractFileSignedUrl={contractFileSignedUrl}
        portfolioFundId={portfolioFundId}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {showPreScreeningLink ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/applications/${row.id}/prequalification`}>Pre-qualification</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
