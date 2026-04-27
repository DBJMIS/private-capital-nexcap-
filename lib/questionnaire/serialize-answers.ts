/**
 * Map UI values to vc_dd_answers columns.
 * File path: lib/questionnaire/serialize-answers.ts
 */

import type { PlainQuestion, QuestionDef } from '@/lib/questionnaire/types';

function isPlain(q: QuestionDef): q is PlainQuestion {
  return (
    q.type !== 'pipeline_companies' &&
    q.type !== 'legal_documents_table' &&
    q.type !== 'legal_documents_list' &&
    q.type !== 'contact_persons' &&
    q.type !== 'structured_list' &&
    q.type !== 'multi_select' &&
    q.type !== 'stage_allocation' &&
    q.type !== 'company_size_params'
  );
}

export function valueToAnswerColumns(
  q: QuestionDef,
  value: unknown,
): {
  answer_text: string | null;
  answer_value: number | null;
  answer_boolean: boolean | null;
  answer_json: unknown | null;
} {
  if (!isPlain(q)) {
    return {
      answer_text: null,
      answer_value: null,
      answer_boolean: null,
      answer_json: value === undefined ? null : value,
    };
  }

  switch (q.type) {
    case 'boolean': {
      const b = value === true || value === 'true';
      const f = value === false || value === 'false';
      return {
        answer_text: null,
        answer_value: null,
        answer_boolean: b ? true : f ? false : null,
        answer_json: null,
      };
    }
    case 'number':
    case 'currency': {
      const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
      return {
        answer_text: null,
        answer_value: Number.isFinite(n) ? n : null,
        answer_boolean: null,
        answer_json: null,
      };
    }
    case 'file':
      return {
        answer_text: typeof value === 'string' ? value : null,
        answer_value: null,
        answer_boolean: null,
        answer_json: null,
      };
    default:
      return {
        answer_text: value === null || value === undefined ? null : String(value),
        answer_value: null,
        answer_boolean: null,
        answer_json: null,
      };
  }
}

export function rowToAnswerValue(
  q: QuestionDef,
  row: {
    answer_text: string | null;
    answer_value: number | null;
    answer_boolean: boolean | null;
    answer_json: unknown | null;
  },
): unknown {
  if (!isPlain(q)) {
    return row.answer_json;
  }
  switch (q.type) {
    case 'boolean':
      return row.answer_boolean;
    case 'number':
    case 'currency':
      return row.answer_value;
    case 'file':
      return row.answer_text;
    default:
      return row.answer_text;
  }
}
