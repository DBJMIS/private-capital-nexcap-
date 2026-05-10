export type PipelineStageOverview = {
  key: string;
  label: string;
  /** Final committed stage only — shown per mockup. */
  description?: string;
};

export const PIPELINE_STAGES_OVERVIEW: PipelineStageOverview[] = [
  { key: 'submitted', label: 'Application submitted' },
  { key: 'pre_screening', label: 'Pre-screening' },
  { key: 'pre_qualified', label: 'Pre-qualified' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'presentation_scheduled', label: 'Presentation' },
  { key: 'panel_evaluation', label: 'Panel evaluation' },
  { key: 'dd_recommended', label: 'Due diligence' },
  { key: 'dd_complete', label: 'Due diligence complete' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'contract_signed', label: 'Contract signed' },
  { key: 'committed', label: 'Committed', description: 'DBJ has committed capital to your fund' },
];

export type QuestionnaireLite = {
  completed_sections: number;
  total_sections: number;
  all_complete: boolean;
} | null;

/** Maps workflow status → pipeline milestone index (0–10). Unknown → 0. */
export function getStageIndexOverview(status: string): number {
  const map: Record<string, number> = {
    draft: -1,
    rejected: -2,
    submitted: 0,
    preliminary_screening: 1,
    pre_screening: 1,
    pre_qualified: 2,
    shortlisted: 3,
    presentation_scheduled: 4,
    presentation_complete: 4,
    panel_evaluation: 5,
    dd_recommended: 6,
    dd_complete: 7,
    site_visit: 7,
    negotiation: 8,
    contract_review: 8,
    contract_signed: 9,
    committed: 10,
    funded: 10,
    approved: 9,
    clarification_requested: 5,
    due_diligence: 6,
  };
  if (Object.prototype.hasOwnProperty.call(map, status)) {
    const v = map[status];
    return typeof v === 'number' ? v : 0;
  }
  return 0;
}

export function estimateCompletedStageIndexBeforeRejection(
  questionnaire: QuestionnaireLite,
  submittedAt: string | null,
): number {
  if (questionnaire?.all_complete) return 7;
  if (questionnaire && questionnaire.total_sections > 0 && questionnaire.completed_sections > 0) return 6;
  if (submittedAt) return 1;
  return 0;
}
