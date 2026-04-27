export type ChecklistResponse = 'yes' | 'no' | 'partial' | 'not_reviewed';

export type PrequalOverallStatus = 'pending' | 'prequalified' | 'not_prequalified';

export type PrequalificationRow = {
  id: string;
  tenant_id: string;
  application_id: string;
  s21_company_info: ChecklistResponse;
  s21_fund_info: ChecklistResponse;
  s21_fund_strategy: ChecklistResponse;
  s21_fund_management: ChecklistResponse;
  s21_legal_regulatory: ChecklistResponse;
  s21_comments: string | null;
  s22_company_management: ChecklistResponse;
  s22_fund_general: ChecklistResponse;
  s22_fund_financial: ChecklistResponse;
  s22_fund_esg: ChecklistResponse;
  s22_comments: string | null;
  date_received: string | null;
  time_received: string | null;
  soft_copy_received: boolean;
  hard_copy_received: boolean;
  prequalified: boolean | null;
  not_prequalified: boolean | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  overall_status: PrequalOverallStatus;
  ai_summary: unknown;
  ai_analysed_at: string | null;
  proposal_document_path: string | null;
  created_at: string;
  updated_at: string;
};

export const S21_KEYS = [
  's21_company_info',
  's21_fund_info',
  's21_fund_strategy',
  's21_fund_management',
  's21_legal_regulatory',
] as const;

export const S22_KEYS = [
  's22_company_management',
  's22_fund_general',
  's22_fund_financial',
  's22_fund_esg',
] as const;

export type S21Key = (typeof S21_KEYS)[number];
export type S22Key = (typeof S22_KEYS)[number];

export const AI_ITEM_KEYS = [
  'company_info',
  'fund_info',
  'fund_strategy',
  'fund_management',
  'legal_regulatory',
  'company_management',
  'fund_general',
  'fund_financial',
  'fund_esg',
] as const;

export type AiItemKey = (typeof AI_ITEM_KEYS)[number];

export const CHECKLIST_ITEM_LABELS: Record<string, string> = {
  s21_company_info: 'Company Information',
  s21_fund_info: 'Fund Information',
  s21_fund_strategy: 'Fund Strategy',
  s21_fund_management: 'Fund Management',
  s21_legal_regulatory: 'Legal and Regulatory Requirements',
  s22_company_management: 'Company and Management Team',
  s22_fund_general: 'Fund Details — General',
  s22_fund_financial: 'Fund Details — Financial',
  s22_fund_esg: 'Fund Details — ESG',
};

export const RECOMMENDATION_LABELS: Record<string, string> = {
  prequalify: 'Recommend Prequalification',
  not_prequalify: 'Do Not Prequalify',
  request_info: 'Request Additional Information',
};

export const RECOMMENDATION_COLORS: Record<string, string> = {
  prequalify: 'bg-emerald-100 text-emerald-700',
  not_prequalify: 'bg-red-100 text-red-700',
  request_info: 'bg-amber-100 text-amber-700',
};

export function emptyPrequalificationTemplate(applicationId: string): Omit<
  PrequalificationRow,
  'id' | 'tenant_id' | 'created_at' | 'updated_at'
> {
  return {
    application_id: applicationId,
    s21_company_info: 'not_reviewed',
    s21_fund_info: 'not_reviewed',
    s21_fund_strategy: 'not_reviewed',
    s21_fund_management: 'not_reviewed',
    s21_legal_regulatory: 'not_reviewed',
    s21_comments: null,
    s22_company_management: 'not_reviewed',
    s22_fund_general: 'not_reviewed',
    s22_fund_financial: 'not_reviewed',
    s22_fund_esg: 'not_reviewed',
    s22_comments: null,
    date_received: null,
    time_received: null,
    soft_copy_received: false,
    hard_copy_received: false,
    prequalified: null,
    not_prequalified: null,
    reviewed_by: null,
    reviewer_name: null,
    reviewed_at: null,
    overall_status: 'pending',
    ai_summary: null,
    ai_analysed_at: null,
    proposal_document_path: null,
  };
}

export function isChecklistResponse(v: unknown): v is ChecklistResponse {
  return v === 'yes' || v === 'no' || v === 'partial' || v === 'not_reviewed';
}

export function countReviewed(keys: readonly ChecklistResponse[]): number {
  return keys.filter((k) => k !== 'not_reviewed').length;
}

export function allChecklistItemsReviewed(
  row: Pick<PrequalificationRow, (typeof S21_KEYS)[number] | (typeof S22_KEYS)[number]>,
): boolean {
  return [...S21_KEYS, ...S22_KEYS].every((k) => row[k] !== 'not_reviewed');
}

export function canDecidePrequal(
  row: Pick<
    PrequalificationRow,
    | (typeof S21_KEYS)[number]
    | (typeof S22_KEYS)[number]
    | 'date_received'
    | 'soft_copy_received'
    | 'hard_copy_received'
    | 'overall_status'
  >,
): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (row.overall_status !== 'pending') {
    reasons.push('A decision has already been recorded.');
  }
  for (const k of S21_KEYS) {
    if (row[k] === 'not_reviewed') reasons.push(`Section 2.1 item ${k} is not reviewed.`);
  }
  for (const k of S22_KEYS) {
    if (row[k] === 'not_reviewed') reasons.push(`Section 2.2 item ${k} is not reviewed.`);
  }
  if (!row.date_received) reasons.push('Date received is required.');
  if (!row.soft_copy_received && !row.hard_copy_received) {
    reasons.push('At least one of soft copy or hard copy must be marked received.');
  }
  return { ok: reasons.length === 0, reasons };
}

export function mapAiKeyToColumn(key: string): S21Key | S22Key | null {
  const m: Record<string, S21Key | S22Key> = {
    company_info: 's21_company_info',
    fund_info: 's21_fund_info',
    fund_strategy: 's21_fund_strategy',
    fund_management: 's21_fund_management',
    legal_regulatory: 's21_legal_regulatory',
    company_management: 's22_company_management',
    fund_general: 's22_fund_general',
    fund_financial: 's22_fund_financial',
    fund_esg: 's22_fund_esg',
  };
  return m[key] ?? null;
}
