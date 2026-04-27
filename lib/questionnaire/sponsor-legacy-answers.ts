/**
 * Map legacy sponsor alignment answers into new keys (GET / one-time UI).
 */

import type { AnswerMap } from '@/lib/questionnaire/validate';

function stringVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function coerceSponsorLegacyAnswers(answers: AnswerMap): AnswerMap {
  const out = { ...answers };

  if (
    (out.has_conflicts_of_interest === undefined ||
      out.has_conflicts_of_interest === null ||
      out.has_conflicts_of_interest === '') &&
    stringVal(out.conflicts_of_interest).trim()
  ) {
    out.has_conflicts_of_interest = true;
    if (!stringVal(out.conflicts_description).trim()) {
      out.conflicts_description = stringVal(out.conflicts_of_interest);
    }
  }
  if (
    (out.has_regulations === undefined || out.has_regulations === null || out.has_regulations === '') &&
    stringVal(out.applicable_regulations_compliance).trim()
  ) {
    out.has_regulations = true;
    if (!stringVal(out.regulations_list).trim()) {
      out.regulations_list = stringVal(out.applicable_regulations_compliance);
    }
  }
  if (
    (out.has_litigation === undefined || out.has_litigation === null || out.has_litigation === '') &&
    stringVal(out.legal_status_litigation).trim()
  ) {
    out.has_litigation = true;
    if (!stringVal(out.litigation_description).trim()) {
      out.litigation_description = stringVal(out.legal_status_litigation);
    }
    if (!stringVal(out.litigation_status).trim()) {
      out.litigation_status = 'pending';
    }
  }

  if (out.manager_will_invest === undefined || out.manager_will_invest === null || out.manager_will_invest === '') {
    const legacy = out.alignment_manager_invest;
    if (legacy !== undefined && legacy !== null && legacy !== '') {
      const v = String(legacy).toLowerCase();
      if (v === 'no') out.manager_will_invest = false;
      else if (v === 'yes' || v === 'partial') out.manager_will_invest = true;
    }
  }

  const methodEmpty = !String(out.manager_investment_method ?? '').trim();
  if (methodEmpty && out.alignment_amount_pct != null && String(out.alignment_amount_pct).trim() !== '') {
    out.manager_investment_method = String(out.alignment_amount_pct);
  }

  return out;
}
