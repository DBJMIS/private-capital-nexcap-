'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { CfpInfoStrip } from '@/components/cfp/CfpInfoStrip';
import { ApplicationPipelineHeader } from '@/components/applications/ApplicationPipelineHeader';
import { OverviewTab } from '@/components/applications/OverviewTab';
import { PrequalificationSummaryTab } from '@/components/applications/PrequalificationSummaryTab';
import { PresentationTab } from '@/components/applications/PresentationTab';
import { PanelScoringTab } from '@/components/applications/PanelScoringTab';
import { DdDecisionTab } from '@/components/applications/DdDecisionTab';
import { DueDiligenceTab } from '@/components/applications/DueDiligenceTab';
import { AssessmentTab } from '@/components/applications/AssessmentTab';
import { SiteVisitTab } from '@/components/applications/SiteVisitTab';
import { NegotiationTab } from '@/components/applications/NegotiationTab';
import {
  defaultTabForStatus,
  pipelineStageIndex,
  tabVisibilityContext,
  type PipelineStageContext,
  type PipelineTabKey,
} from '@/lib/applications/pipeline';
import type { PrequalificationRow } from '@/lib/prequalification/types';
import type { DdQuestionnaireWorkspace } from '@/lib/applications/dd-questionnaire-workspace';
import type { AssessmentCriteriaProgressRow, VcAssessmentSummary } from '@/lib/applications/assessment-workspace';
import { formatStatusDisplayLabel } from '@/components/ui/design-system';
import { formatDateTime, formatShortDate } from '@/lib/format-date';
import type { VcCommitment, VcContract, VcSiteVisit } from '@/types/database';

type AppModel = {
  id: string;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  country_of_incorporation: string;
  geographic_area: string;
  total_capital_commitment_usd: number;
};

type CfpStrip = { id: string; title: string; status: string; closing_date: string } | null;

type PipelineMeta = Record<string, unknown> | null;

function shortlistingFromPipelineMeta(meta: PipelineMeta): {
  notes: string | null;
  decided_at: string | null;
  decision: string | null;
} | null {
  if (!meta || typeof meta !== 'object') return null;
  const s = (meta as { shortlisting?: unknown }).shortlisting;
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  return {
    notes: o.notes != null ? String(o.notes) : null,
    decided_at: o.decided_at != null ? String(o.decided_at) : null,
    decision: o.decision != null ? String(o.decision) : null,
  };
}

export function ApplicationPipelineWorkspace({
  application,
  cfp,
  prequalification,
  presentation,
  panelSubmittedCount,
  panelTotalCount,
  questionnaire,
  assessment,
  criteriaProgress,
  canWrite,
  pipelineMetadata,
  siteVisit,
  contract,
  commitment,
  siteVisitReportSignedUrl,
  contractFileSignedUrl,
  portfolioFundId,
}: {
  application: AppModel;
  cfp: CfpStrip;
  prequalification: PrequalificationRow | null;
  presentation: { status: string | null; scheduled_date: string | null; actual_date: string | null } | null;
  panelSubmittedCount: number;
  panelTotalCount: number;
  questionnaire: DdQuestionnaireWorkspace | null;
  assessment: VcAssessmentSummary | null;
  criteriaProgress: AssessmentCriteriaProgressRow[];
  canWrite: boolean;
  pipelineMetadata: PipelineMeta;
  siteVisit: VcSiteVisit | null;
  contract: VcContract | null;
  commitment: VcCommitment | null;
  siteVisitReportSignedUrl: string | null;
  contractFileSignedUrl: string | null;
  portfolioFundId?: string | null;
}) {
  const pipelineCtx: PipelineStageContext = useMemo(
    () => ({
      questionnaireCompleted: (questionnaire?.status ?? '').trim().toLowerCase() === 'completed',
    }),
    [questionnaire?.status],
  );

  const [tab, setTab] = useState<PipelineTabKey>(() => defaultTabForStatus(application.status, pipelineCtx));
  const stageIdx = pipelineStageIndex(application.status);
  const hasScoring = panelSubmittedCount > 0;
  const vis = tabVisibilityContext(
    application.status,
    hasScoring,
    pipelineCtx.questionnaireCompleted,
    assessment != null,
    {
      siteVisit: siteVisit ? { status: siteVisit.status, outcome: siteVisit.outcome } : null,
      assessmentPassed: assessment?.passed === true,
    },
  );

  const shortlist = shortlistingFromPipelineMeta(pipelineMetadata);

  const tabs = useMemo(
    () => [
      { key: 'overview' as const, label: 'Overview' },
      { key: 'prequalification' as const, label: 'Pre-qualification' },
      { key: 'presentation' as const, label: 'Presentation', hidden: !vis.showPresentation },
      { key: 'panel_scoring' as const, label: 'Panel Scoring', hidden: !vis.showPanelScoring },
      { key: 'dd_decision' as const, label: 'DD Decision', hidden: !vis.showDdDecision },
      { key: 'due_diligence' as const, label: 'Due Diligence', hidden: !vis.showDueDiligence },
      { key: 'assessment' as const, label: 'Assessment', hidden: !vis.showAssessment },
      { key: 'site_visit' as const, label: 'Site Visit', hidden: !vis.showSiteVisit },
      { key: 'negotiation' as const, label: 'Negotiation', hidden: !vis.showNegotiation },
    ],
    [vis],
  );

  const st = application.status.trim().toLowerCase();
  const isCommitted = st === 'committed' || st === 'approved' || commitment != null;
  const isRejected = st === 'rejected';

  const visitStatus = (siteVisit?.status ?? '').trim().toLowerCase();
  const visitOutcome = (siteVisit?.outcome ?? '').trim().toLowerCase();
  const siteVisitStageState: 'completed' | 'current' | 'pending' =
    isCommitted || isRejected
      ? 'completed'
      : visitStatus === 'completed' || stageIdx > 7
        ? 'completed'
        : stageIdx === 7
          ? 'current'
          : 'pending';

  const negotiationRounds =
    contract?.negotiation_rounds && Array.isArray(contract.negotiation_rounds) ? contract.negotiation_rounds.length : 0;
  const legalReviewLabel = contract?.legal_review_completed_at
    ? 'complete'
    : contract?.legal_review_started_at
      ? 'in progress'
      : 'pending';

  const negotiationStageState: 'completed' | 'current' | 'pending' =
    isCommitted || isRejected
      ? 'completed'
      : stageIdx > 8
        ? 'completed'
        : stageIdx === 8
          ? 'current'
          : 'pending';

  const ddSectionsDone = questionnaire?.sections?.filter((s) => s.status.toLowerCase() === 'completed').length ?? 0;
  const scoreDetail =
    assessment?.overall_score != null && !Number.isNaN(Number(assessment.overall_score))
      ? `${Number(assessment.overall_score).toFixed(1)} / 100`
      : 'Not started';

  const stageRows = [
    {
      label: 'Submitted',
      state: application.submitted_at ? ('completed' as const) : ('pending' as const),
      detail: application.submitted_at ? formatShortDate(application.submitted_at) : 'Not started',
    },
    {
      label: 'Pre-qualified',
      state:
        prequalification?.overall_status === 'prequalified'
          ? ('completed' as const)
          : stageIdx === 1 && (st === 'pre_qualified' || st === 'preliminary_screening')
            ? ('current' as const)
            : stageIdx > 1
              ? ('completed' as const)
              : ('pending' as const),
      detail: prequalification?.reviewed_at
        ? `${prequalification.reviewer_name ?? 'Officer'} · ${formatDateTime(prequalification.reviewed_at)}`
        : 'Pending review',
    },
    {
      label: 'Shortlisted',
      state:
        stageIdx > 2 ? ('completed' as const) : stageIdx === 2 ? ('current' as const) : ('pending' as const),
      detail:
        shortlist?.decision === 'shortlisted' && shortlist.decided_at
          ? `Shortlisted · ${formatShortDate(shortlist.decided_at)}`
          : shortlist?.notes
            ? 'Notes on file'
            : 'Not started',
    },
    {
      label: 'Presentation',
      state:
        presentation?.status === 'completed' || stageIdx > 3
          ? ('completed' as const)
          : stageIdx === 3
            ? ('current' as const)
            : ('pending' as const),
      detail:
        presentation?.status === 'completed' && presentation.actual_date
          ? formatShortDate(presentation.actual_date)
          : presentation?.scheduled_date
            ? `Scheduled ${formatShortDate(presentation.scheduled_date)}`
            : 'Not started',
    },
    {
      label: 'Panel Evaluation',
      state:
        stageIdx > 4
          ? ('completed' as const)
          : stageIdx === 4 && st === 'panel_evaluation'
            ? ('current' as const)
            : stageIdx === 4 && hasScoring
              ? ('current' as const)
              : ('pending' as const),
      detail: `${panelSubmittedCount} of ${panelTotalCount || 0} members scored`,
    },
    {
      label: 'DD Recommended',
      state: ['dd_recommended', 'due_diligence', 'clarification_requested', 'dd_complete', 'site_visit', 'negotiation', 'contract_review', 'contract_signed', 'committed', 'approved', 'rejected'].includes(st)
        ? ('completed' as const)
        : ('pending' as const),
      detail: st === 'dd_recommended' || stageIdx > 4 ? 'Recorded' : 'Not started',
    },
    {
      label: 'Due Diligence',
      state: stageIdx > 5 ? ('completed' as const) : stageIdx === 5 ? ('current' as const) : ('pending' as const),
      detail: questionnaire?.sections?.length
        ? `${ddSectionsDone} of 9 sections · ${formatStatusDisplayLabel(questionnaire.status ?? 'draft')}`
        : questionnaire?.status
          ? formatStatusDisplayLabel(questionnaire.status)
          : 'Not started',
    },
    {
      label: 'DD Assessment',
      state:
        isCommitted || isRejected
          ? ('completed' as const)
          : assessment?.status && ['completed', 'approved'].includes(assessment.status.toLowerCase())
            ? ('completed' as const)
            : stageIdx === 6
              ? ('current' as const)
              : ('pending' as const),
      detail: scoreDetail,
    },
    {
      label: 'Site Visit',
      state: siteVisitStageState,
      detail: (() => {
        if (!siteVisit) return st === 'site_visit' ? 'Not scheduled' : 'Not started';
        if (visitStatus === 'scheduled' && siteVisit.scheduled_date) {
          return `Site visit scheduled for ${formatShortDate(siteVisit.scheduled_date)}`;
        }
        if (visitStatus === 'completed' && visitOutcome) {
          return `Site visit completed — ${visitOutcome}`;
        }
        if (visitStatus === 'cancelled') return 'Site visit cancelled';
        return siteVisit.scheduled_date ? `Scheduled ${formatShortDate(siteVisit.scheduled_date)}` : 'In progress';
      })(),
    },
    {
      label: 'Negotiation',
      state: negotiationStageState,
      detail: (() => {
        if (isCommitted) return 'Commitment recorded';
        if (!contract && (st === 'negotiation' || st === 'contract_review' || st === 'contract_signed')) {
          return 'Contract negotiation in progress';
        }
        if (!contract) return 'Not started';
        return `Contract negotiation in progress · Round ${negotiationRounds} on file · Legal review ${legalReviewLabel}`;
      })(),
    },
    {
      label: 'Committed',
      state: isCommitted || isRejected ? ('completed' as const) : stageIdx === 9 ? ('current' as const) : ('pending' as const),
      detail: isRejected ? (
        'Rejected'
      ) : commitment ? (
        <span className="space-y-1 block text-left">
          <span>{`✓ Commitment issued ${formatShortDate(commitment.committed_at)}`}</span>
          <span className="mt-1 block text-gray-600">Fund is active under monitoring</span>
          <Link
            href={portfolioFundId ? `/portfolio/funds/${portfolioFundId}` : '/portfolio/funds'}
            className="mt-1 inline-block text-[#0F8A6E] font-medium hover:underline"
          >
            View Monitoring →
          </Link>
        </span>
      ) : isCommitted ? (
        'Committed'
      ) : (
        'Pending'
      ),
    },
  ];

  const jumpToStage = (stage: string) => {
    if (stage === 'submitted') return setTab('overview');
    if (stage === 'pre_qualified') return setTab('prequalification');
    if (stage === 'shortlisted') return setTab('presentation');
    if (stage === 'presentation') return setTab('presentation');
    if (stage === 'panel_evaluation') return setTab('panel_scoring');
    if (stage === 'due_diligence') return setTab('due_diligence');
    if (stage === 'assessment') return setTab('assessment');
    if (stage === 'site_visit') return setTab('site_visit');
    if (stage === 'negotiation') return setTab('negotiation');
    if (stage === 'committed') return setTab('overview');
  };

  return (
    <div className="space-y-6">
      <ApplicationPipelineHeader
        fundName={application.fund_name}
        managerName={application.manager_name}
        status={application.status}
        activeTab={tab}
        tabs={tabs}
        onTabChange={setTab}
        onStageClick={jumpToStage}
      />

      {cfp ? <CfpInfoStrip cfp={cfp} /> : null}

      {tab === 'overview' ? (
        <OverviewTab application={application} stageRows={stageRows} />
      ) : tab === 'prequalification' ? (
        <PrequalificationSummaryTab
          applicationId={application.id}
          applicationStatus={application.status}
          prequalification={prequalification}
          pipelineMetadata={(pipelineMetadata as Record<string, unknown> | null) ?? null}
          canWrite={canWrite}
        />
      ) : tab === 'presentation' ? (
        <PresentationTab applicationId={application.id} />
      ) : tab === 'panel_scoring' ? (
        <PanelScoringTab applicationId={application.id} fundName={application.fund_name} />
      ) : tab === 'dd_decision' ? (
        <DdDecisionTab applicationId={application.id} fundName={application.fund_name} />
      ) : tab === 'due_diligence' ? (
        <DueDiligenceTab applicationId={application.id} questionnaire={questionnaire} />
      ) : tab === 'assessment' ? (
        <AssessmentTab
          applicationId={application.id}
          applicationStatus={application.status}
          fundName={application.fund_name}
          questionnaireId={questionnaire?.id ?? null}
          questionnaireCompleted={pipelineCtx.questionnaireCompleted}
          assessment={assessment}
          criteriaProgress={criteriaProgress}
          canWrite={canWrite}
        />
      ) : tab === 'site_visit' ? (
        <SiteVisitTab
          applicationId={application.id}
          application={application}
          canWrite={canWrite}
          initialSiteVisit={siteVisit}
          reportDownloadUrl={siteVisitReportSignedUrl}
        />
      ) : (
        <NegotiationTab
          applicationId={application.id}
          application={application}
          canWrite={canWrite}
          initialContract={contract}
          initialCommitment={commitment}
          initialPortfolioFundId={portfolioFundId ?? null}
          contractDownloadUrl={contractFileSignedUrl}
        />
      )}
    </div>
  );
}
