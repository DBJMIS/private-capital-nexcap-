export type PipelineTabKey =
  | 'overview'
  | 'prequalification'
  | 'presentation'
  | 'panel_scoring'
  | 'dd_decision'
  | 'due_diligence'
  | 'assessment'
  | 'site_visit'
  | 'negotiation';

/** Stepper keys (10 stages, indices 0–9). */
export type StepperStageKey =
  | 'submitted'
  | 'pre_qualified'
  | 'shortlisted'
  | 'presentation'
  | 'panel_evaluation'
  | 'due_diligence'
  | 'assessment'
  | 'site_visit'
  | 'negotiation'
  | 'committed';

export type StepperStageConfig = {
  key: StepperStageKey;
  label: string;
  shortLabel: string;
};

export const PIPELINE_STAGES: StepperStageConfig[] = [
  { key: 'submitted', label: 'Submitted', shortLabel: 'Sub' },
  { key: 'pre_qualified', label: 'Pre-qualified', shortLabel: 'Pre-Q' },
  { key: 'shortlisted', label: 'Shortlisted', shortLabel: 'Short' },
  { key: 'presentation', label: 'Presentation', shortLabel: 'Pres' },
  { key: 'panel_evaluation', label: 'Panel Evaluation', shortLabel: 'Panel' },
  { key: 'due_diligence', label: 'Due Diligence', shortLabel: 'DD' },
  { key: 'assessment', label: 'Assessment', shortLabel: 'Assess' },
  { key: 'site_visit', label: 'Site Visit', shortLabel: 'Visit' },
  { key: 'negotiation', label: 'Negotiation', shortLabel: 'Neg' },
  { key: 'committed', label: 'Committed', shortLabel: 'Done' },
];

/** DBJ process: map DB status → stepper index (0–9). Rejected maps to 9 (Committed step shows ✗). */
export function pipelineStageIndex(status: string): number {
  const s = status.trim().toLowerCase();
  switch (s) {
    case 'draft':
    case 'submitted':
    case 'pre_screening':
      return 0;
    case 'pre_qualified':
    case 'preliminary_screening':
      return 1;
    case 'shortlisted':
      return 2;
    case 'presentation_scheduled':
    case 'presentation_complete':
      return 3;
    case 'panel_evaluation':
      return 4;
    case 'dd_recommended':
    case 'due_diligence':
    case 'clarification_requested':
      return 5;
    case 'dd_complete':
      return 6;
    case 'site_visit':
      return 7;
    case 'negotiation':
    case 'contract_review':
    case 'contract_signed':
      return 8;
    case 'committed':
    case 'approved':
    case 'rejected':
      return 9;
    default:
      return 0;
  }
}

export type PipelineStageContext = {
  questionnaireCompleted: boolean;
};

export type PipelineTabVisibilityExtras = {
  siteVisit?: { status: string; outcome: string | null } | null;
  assessmentPassed?: boolean | null;
};

export function stageKeyFromStepperIndex(idx: number): StepperStageKey {
  return PIPELINE_STAGES[Math.min(Math.max(idx, 0), PIPELINE_STAGES.length - 1)]?.key ?? 'submitted';
}

export function defaultTabForStatus(status: string, ctx: PipelineStageContext): PipelineTabKey {
  const idx = pipelineStageIndex(status);
  if (idx <= 1) return 'prequalification';
  if (idx === 2) return 'presentation';
  if (idx === 3) return 'presentation';
  if (idx === 4) return 'panel_scoring';
  if (idx === 5) return 'due_diligence';
  if (idx === 6) return ctx.questionnaireCompleted ? 'assessment' : 'due_diligence';
  if (idx === 7) return 'site_visit';
  if (idx === 8) return 'negotiation';
  return 'overview';
}

/** Tab visibility helpers (string/status rules from DBJ spec). */
export function tabVisibilityContext(
  status: string,
  hasPanelScores: boolean,
  questionnaireCompleted: boolean,
  hasAssessment: boolean,
  extras?: PipelineTabVisibilityExtras,
) {
  const st = status.trim().toLowerCase();

  const afterShortlisted = new Set([
    'shortlisted',
    'presentation_scheduled',
    'presentation_complete',
    'panel_evaluation',
    'dd_recommended',
    'due_diligence',
    'clarification_requested',
    'dd_complete',
    'site_visit',
    'negotiation',
    'contract_review',
    'contract_signed',
    'committed',
    'approved',
    'rejected',
  ]);

  const afterPresentationComplete = new Set([
    'presentation_complete',
    'panel_evaluation',
    'dd_recommended',
    'due_diligence',
    'clarification_requested',
    'dd_complete',
    'site_visit',
    'negotiation',
    'contract_review',
    'contract_signed',
    'committed',
    'approved',
    'rejected',
  ]);

  const afterPanelOrScoring = new Set([
    'panel_evaluation',
    'dd_recommended',
    'due_diligence',
    'clarification_requested',
    'dd_complete',
    'site_visit',
    'negotiation',
    'contract_review',
    'contract_signed',
    'committed',
    'approved',
    'rejected',
  ]);

  const afterDdRecommended = new Set([
    'dd_recommended',
    'due_diligence',
    'clarification_requested',
    'dd_complete',
    'site_visit',
    'negotiation',
    'contract_review',
    'contract_signed',
    'committed',
    'approved',
    'rejected',
  ]);

  const afterDdComplete = new Set([
    'dd_complete',
    'site_visit',
    'negotiation',
    'contract_review',
    'contract_signed',
    'committed',
    'approved',
    'rejected',
  ]);

  const visit = extras?.siteVisit;
  const visitDone = (visit?.status ?? '').trim().toLowerCase() === 'completed';
  const visitOutcome = (visit?.outcome ?? '').trim().toLowerCase();
  const negotiationUnlockedByVisit = visitDone && (visitOutcome === 'satisfactory' || visitOutcome === 'conditional');
  const negotiationByStatus = new Set([
    'negotiation',
    'contract_review',
    'contract_signed',
    'committed',
    'approved',
  ]).has(st);

  return {
    showPresentation: afterShortlisted.has(st),
    showPanelScoring: afterPresentationComplete.has(st) || hasPanelScores,
    showDdDecision: afterPanelOrScoring.has(st) || hasPanelScores,
    showDueDiligence: afterDdRecommended.has(st),
    showAssessment: st === 'dd_complete' || questionnaireCompleted || hasAssessment,
    showSiteVisit: afterDdComplete.has(st) || extras?.assessmentPassed === true,
    showNegotiation: negotiationByStatus || negotiationUnlockedByVisit,
  };
}
