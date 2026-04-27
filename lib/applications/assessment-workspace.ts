export type VcAssessmentSummary = {
  id: string;
  status: string | null;
  overall_score: number | null;
  passed: boolean | null;
  recommendation: string | null;
  completed_at: string | null;
};

export type AssessmentCriteriaProgressRow = {
  criteria_key: string;
  weighted_score: number | null;
};
