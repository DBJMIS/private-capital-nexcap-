/**
 * DD Questionnaire config types (DBJ Fund Manager DD Questionnaire).
 * File path: lib/questionnaire/types.ts
 */

import type { StructuredListKind } from '@/lib/questionnaire/structured-list-registry';

export type DdSectionKey =
  | 'basic_info'
  | 'sponsor'
  | 'deal_flow'
  | 'portfolio_monitoring'
  | 'investment_strategy'
  | 'governing_rules'
  | 'investors_fundraising'
  | 'legal'
  | 'additional';

export type QuestionFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'email'
  | 'phone'
  | 'url'
  | 'select'
  | 'boolean'
  | 'file'
  | 'pipeline_companies'
  | 'legal_documents_table'
  | 'legal_documents_list'
  | 'structured_list'
  | 'multi_select'
  | 'stage_allocation'
  | 'company_size_params';

export type SelectOption = { value: string; label: string };

export type BaseQuestion = {
  key: string;
  label: string;
  required?: boolean;
  helper?: string;
  placeholder?: string;
};

export type PlainQuestion = BaseQuestion & {
  type: Exclude<
    QuestionFieldType,
    'pipeline_companies' | 'legal_documents_table' | 'legal_documents_list' | 'structured_list' | 'multi_select'
  >;
  maxLength?: number;
  maxWords?: number;
  rows?: number;
  /** Static options when `type` is `select` (omit if `optionsSource` is set). */
  options?: SelectOption[];
  /** Load select options from API (e.g. `countries` → `/api/reference/countries`). */
  optionsSource?: 'countries';
  /** Storage tag for file questions (Section 2, 5, 8, staff CVs) */
  uploadTag?: string;
};

export type PipelineCompaniesQuestion = BaseQuestion & {
  type: 'pipeline_companies';
};

export type LegalDocumentsTableQuestion = BaseQuestion & {
  type: 'legal_documents_table';
};

export type LegalDocumentsListQuestion = BaseQuestion & {
  type: 'legal_documents_list';
};

/** Basic info — multiple contacts stored in `vc_dd_contact_persons` (legacy JSON in answers optional). */
export type ContactPersonsQuestion = BaseQuestion & {
  type: 'contact_persons';
};

/** Repeatable rows stored in normalized DD tables (sponsor section). */
export type StructuredListQuestion = BaseQuestion & {
  type: 'structured_list';
  listKind: Exclude<StructuredListKind, 'contact_persons'>;
  addLabel: string;
  /** e.g. investment professionals note under the group */
  footnote?: string;
};

/** Section V: four stage percentages (stored in `answer_json`). */
export type StageAllocationQuestion = BaseQuestion & {
  type: 'stage_allocation';
};

/** Section V: revenue and per-company investment bounds (stored in `answer_json`). */
export type CompanySizeParamsQuestion = BaseQuestion & {
  type: 'company_size_params';
};

export type MultiSelectQuestion = BaseQuestion & {
  type: 'multi_select';
  options?: SelectOption[];
  optionsSource?: 'countries';
};

export type QuestionDef =
  | PlainQuestion
  | PipelineCompaniesQuestion
  | LegalDocumentsTableQuestion
  | LegalDocumentsListQuestion
  | ContactPersonsQuestion
  | StructuredListQuestion
  | StageAllocationQuestion
  | CompanySizeParamsQuestion
  | MultiSelectQuestion;

export type SectionMeta = {
  key: DdSectionKey;
  order: number;
  title: string;
  /** Right-rail guidance */
  helper: string;
  /** Questions rendered in main column */
  questions: QuestionDef[];
};
