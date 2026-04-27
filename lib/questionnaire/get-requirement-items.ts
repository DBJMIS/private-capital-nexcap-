/**
 * Human-readable checklist for the section requirements bar.
 * Keep in sync with canMarkSectionComplete (lib/questionnaire/can-mark-section-complete.ts).
 */

import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import type { DdSectionKey, PlainQuestion, QuestionDef } from '@/lib/questionnaire/types';
import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import {
  contactPersonsSectionSatisfied,
  countContactsWithNameAndEmail,
  normalizeContactPersonsValue,
} from '@/lib/questionnaire/contact-persons';
import { countWords } from '@/lib/questionnaire/word-count';
import {
  pipelineCompanyRowsMeetRequirements,
  type LegalDocRow,
  type PipelineRow,
} from '@/lib/questionnaire/validate';
import { canMarkSectionComplete } from '@/lib/questionnaire/can-mark-section-complete';
import { filterBlankStructuredListRowsForReplace } from '@/lib/questionnaire/structured-list-db';

export type RequirementItem = { label: string; satisfied: boolean };

export type RequirementItemsResult = {
  items: RequirementItem[];
  allSatisfied: boolean;
  satisfiedCount: number;
  totalCount: number;
};

function isPlainQuestion(q: QuestionDef): q is PlainQuestion {
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

function stringVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function parseJsonArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function numFromUnknown(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function stageAllocationPercents(raw: unknown): { ideas: number; startups: number; scaling: number; mature: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ideas = numFromUnknown(o.ideas_pct);
  const startups = numFromUnknown(o.startups_pct);
  const scaling = numFromUnknown(o.scaling_pct);
  const mature = numFromUnknown(o.mature_pct);
  if (ideas === null || startups === null || scaling === null || mature === null) return null;
  return { ideas, startups, scaling, mature };
}

function companySizeRevenueInvestmentFromRaw(raw: unknown): {
  minRev: number | null;
  maxRev: number | null;
  minInv: number | null;
  maxInv: number | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { minRev: null, maxRev: null, minInv: null, maxInv: null };
  }
  const o = raw as Record<string, unknown>;
  return {
    minRev: numFromUnknown(o.revenue_min_usd),
    maxRev: numFromUnknown(o.revenue_max_usd),
    minInv: numFromUnknown(o.investment_min_per_company_usd),
    maxInv: numFromUnknown(o.investment_max_per_company_usd),
  };
}

function companySizeParamsNumbers(raw: unknown): {
  revenue_min_usd: number;
  revenue_max_usd: number;
  investment_min_usd: number;
  investment_max_usd: number;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const revenue_min_usd = numFromUnknown(o.revenue_min_usd);
  const revenue_max_usd = numFromUnknown(o.revenue_max_usd);
  const investment_min_usd = numFromUnknown(o.investment_min_per_company_usd);
  const investment_max_usd = numFromUnknown(o.investment_max_per_company_usd);
  if (
    revenue_min_usd === null ||
    revenue_max_usd === null ||
    investment_min_usd === null ||
    investment_max_usd === null
  ) {
    return null;
  }
  return { revenue_min_usd, revenue_max_usd, investment_min_usd, investment_max_usd };
}

function hasFile(docs: DdDocumentRow[], tag: string): boolean {
  return docs.some((d) => d.tag === tag);
}

function multiSelectCountriesOk(v: unknown): boolean {
  const rows = parseJsonArray<string>(v);
  return rows.length >= 1;
}

function plainQuestionSatisfied(
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: PlainQuestion,
  sectionKey: DdSectionKey,
): boolean {
  const raw = answers[q.key];
  if (q.required) {
    if (q.type === 'boolean') {
      if (raw !== true && raw !== false && raw !== 'true' && raw !== 'false') return false;
    } else if (q.type === 'file') {
      const tag = q.uploadTag ?? q.key;
      if (!hasFile(documents, tag)) return false;
    } else {
      const s = stringVal(raw).trim();
      if (!s) return false;
      if (q.type === 'currency' || q.type === 'number') {
        const n = Number(String(raw).replace(/,/g, ''));
        if (Number.isNaN(n) || n < 0) return false;
        if (q.key === 'jamaica_min_allocation_pct' && n < 40) return false;
      }
    }
  }
  if (q.maxWords) {
    const s = stringVal(raw);
    if (countWords(s) > q.maxWords) return false;
  }
  if (q.key === 'investment_thesis' && sectionKey === 'investment_strategy') {
    if (stringVal(raw).trim().length < 100) return false;
  }
  return true;
}

function structuredListGateSatisfied(
  _sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  q: Extract<QuestionDef, { type: 'structured_list' }>,
): boolean {
  const rowsRaw = parseJsonArray<Record<string, unknown>>(answers[q.key]);
  const rows = filterBlankStructuredListRowsForReplace(q.listKind, rowsRaw) as Record<string, unknown>[];
  const min = STRUCTURED_LIST_REGISTRY[q.listKind].minRows;
  if (rows.length < min) return false;
  if (q.required && q.listKind === 'investment_professionals' && rows.length < 1) return false;
  if (q.required && (q.listKind === 'sector_allocations' || q.listKind === 'investment_instruments') && rows.length < 1) {
    return false;
  }
  if (q.required && q.listKind === 'office_locations') {
    if (rows.length < 1) return false;
  }
  if (q.required && q.listKind === 'potential_investors') {
    if (!rows.some((row) => String(row.investor_name ?? '').trim())) return false;
  }
  const req = q.required;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    switch (q.listKind) {
      case 'shareholders':
        if (req && !String(r.full_name ?? '').trim()) return false;
        break;
      case 'investment_professionals': {
        if (!req) break;
        const ps = String(r.position_status ?? 'full_time').trim();
        if (ps !== 'full_time' && ps !== 'part_time' && ps !== 'vacant') return false;
        if (ps === 'vacant') {
          if (!String(r.title ?? '').trim()) return false;
          const ht = String(r.hire_timeline ?? '').trim();
          if (ht !== 'immediate' && ht !== 'within_6_months' && ht !== 'within_1_year') return false;
        } else {
          if (!String(r.full_name ?? '').trim()) return false;
          if (!String(r.title ?? '').trim()) return false;
          const rawPct = r.time_dedication_pct;
          const pctStr =
            rawPct === null || rawPct === undefined ? '' : String(rawPct).replace(/,/g, '').trim();
          if (!pctStr) return false;
          const n = Number(pctStr);
          if (!Number.isFinite(n) || n < 0 || n > 100) return false;
        }
        break;
      }
      case 'office_locations': {
        if (req && !String(r.address ?? '').trim()) return false;
        break;
      }
      case 'support_staff':
        if (String(r.full_name ?? '').trim() || String(r.position ?? '').trim() || String(r.department ?? '').trim()) {
          if (!String(r.full_name ?? '').trim()) return false;
          const d = String(r.department ?? '').trim();
          if (!['legal', 'accounting', 'it', 'admin', 'other'].includes(d)) return false;
        }
        break;
      case 'outside_advisors':
        if (String(r.full_name ?? '').trim() || String(r.role ?? '').trim()) {
          if (!String(r.full_name ?? '').trim()) return false;
        }
        break;
      case 'outsourced_services':
        if (String(r.company_name ?? '').trim() || String(r.activities ?? '').trim()) {
          if (!String(r.company_name ?? '').trim()) return false;
        }
        break;
      case 'investment_rounds': {
        const hasAny =
          String(r.round_name ?? '').trim() ||
          (r.min_usd !== null && r.min_usd !== undefined && String(r.min_usd).trim() !== '') ||
          (r.max_usd !== null && r.max_usd !== undefined && String(r.max_usd).trim() !== '');
        if (hasAny) {
          if (!String(r.round_name ?? '').trim()) return false;
          const lo = numFromUnknown(r.min_usd);
          const hi = numFromUnknown(r.max_usd);
          if (lo !== null && hi !== null && lo > hi) return false;
        }
        break;
      }
      case 'sector_allocations': {
        const hasSector =
          String(r.sector_name ?? '').trim() ||
          (r.max_pct !== null && r.max_pct !== undefined && String(r.max_pct).trim() !== '');
        if (req) {
          if (!String(r.sector_name ?? '').trim()) return false;
          const mx = numFromUnknown(r.max_pct);
          if (mx === null || mx < 0 || mx > 100) return false;
        } else if (hasSector) {
          if (!String(r.sector_name ?? '').trim()) return false;
          const mx = numFromUnknown(r.max_pct);
          if (mx !== null && (mx < 0 || mx > 100)) return false;
        }
        break;
      }
      case 'geographic_allocations': {
        const hasGeo =
          String(r.region_country ?? '').trim() ||
          (r.max_pct !== null && r.max_pct !== undefined && String(r.max_pct).trim() !== '');
        if (hasGeo) {
          if (!String(r.region_country ?? '').trim()) return false;
          const mx = numFromUnknown(r.max_pct);
          if (mx !== null && (mx < 0 || mx > 100)) return false;
        }
        break;
      }
      case 'investment_instruments': {
        const hasInst =
          String(r.instrument_name ?? '').trim() ||
          (r.fund_pct !== null && r.fund_pct !== undefined && String(r.fund_pct).trim() !== '') ||
          String(r.legal_notes ?? '').trim();
        if (req) {
          if (!String(r.instrument_name ?? '').trim()) return false;
          const pct = numFromUnknown(r.fund_pct);
          if (pct === null || pct < 0 || pct > 100) return false;
        } else if (hasInst) {
          if (!String(r.instrument_name ?? '').trim()) return false;
          const pct = numFromUnknown(r.fund_pct);
          if (pct !== null && (pct < 0 || pct > 100)) return false;
        }
        break;
      }
      case 'coinvestors': {
        const hasCo =
          String(r.company_name ?? '').trim() ||
          String(r.contact_name ?? '').trim() ||
          String(r.phone ?? '').trim() ||
          String(r.email ?? '').trim();
        if (hasCo && !String(r.company_name ?? '').trim()) return false;
        break;
      }
      case 'secured_investors': {
        const hasRow =
          String(r.investor_name ?? '').trim() ||
          (r.amount_usd !== null && r.amount_usd !== undefined && String(r.amount_usd).trim() !== '') ||
          String(r.description ?? '').trim();
        if (hasRow && !String(r.investor_name ?? '').trim()) return false;
        break;
      }
      case 'potential_investors': {
        const hasRow =
          String(r.investor_name ?? '').trim() ||
          (r.expected_amount_usd !== null &&
            r.expected_amount_usd !== undefined &&
            String(r.expected_amount_usd).trim() !== '') ||
          String(r.timeline ?? '').trim();
        if (hasRow && !String(r.investor_name ?? '').trim()) return false;
        break;
      }
      default:
        break;
    }
  }
  return true;
}

function specialQuestionSatisfied(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: QuestionDef,
): boolean {
  if (!isPlainQuestion(q)) {
    if (q.type === 'pipeline_companies') {
      const rows = parseJsonArray<PipelineRow>(answers[q.key]);
      if (q.required && rows.length < 1) return false;
      return pipelineCompanyRowsMeetRequirements(rows);
    }
    if (q.type === 'legal_documents_table') {
      const rows = parseJsonArray<LegalDocRow>(answers[q.key]);
      if (q.required && rows.length < 1) return false;
      for (const r of rows) {
        if (!r.name?.trim() || !r.purpose?.trim() || !r.status?.trim()) return false;
      }
      return true;
    }
    if (q.type === 'legal_documents_list') {
      const rows = parseJsonArray<{ document_name?: string; purpose?: string; status?: string }>(
        answers[q.key],
      ).filter((r) => {
        const nm = String(r.document_name ?? (r as { name?: string }).name ?? '').trim();
        return nm.length > 0;
      });
      if (q.required && rows.length < 1) return false;
      for (const r of rows) {
        const nm = String(r.document_name ?? (r as { name?: string }).name ?? '').trim();
        if (!nm || !String(r.purpose ?? '').trim() || !String(r.status ?? '').trim()) return false;
      }
      return true;
    }
    if (q.type === 'contact_persons') {
      const rows = normalizeContactPersonsValue(answers[q.key]);
      if (q.required && !contactPersonsSectionSatisfied(rows)) return false;
      return true;
    }
    if (q.type === 'stage_allocation') {
      const parts = stageAllocationPercents(answers[q.key]);
      if (q.required && !parts) return false;
      if (parts) {
        if ([parts.ideas, parts.startups, parts.scaling, parts.mature].some((n) => n < 0 || n > 100)) return false;
        const sum = parts.ideas + parts.startups + parts.scaling + parts.mature;
        if (Math.abs(sum - 100) > 0.01) return false;
      }
      return true;
    }
    if (q.type === 'company_size_params') {
      const nums = companySizeParamsNumbers(answers[q.key]);
      if (q.required && !nums) return false;
      if (nums) {
        if (
          nums.revenue_min_usd < 0 ||
          nums.revenue_max_usd < 0 ||
          nums.investment_min_usd < 0 ||
          nums.investment_max_usd < 0
        ) {
          return false;
        }
        if (nums.revenue_min_usd > nums.revenue_max_usd) return false;
        if (nums.investment_min_usd > nums.investment_max_usd) return false;
      }
      return true;
    }
    if (q.type === 'structured_list') {
      return structuredListGateSatisfied(sectionKey, answers, q);
    }
    if (q.type === 'multi_select') {
      const rows = parseJsonArray<string>(answers[q.key]);
      if (q.required && rows.length < 1) return false;
      return true;
    }
  }
  return plainQuestionSatisfied(answers, documents, q as PlainQuestion, sectionKey);
}

function sponsorExtraRules(answers: Record<string, unknown>): boolean {
  const invest = answers.manager_will_invest;
  if (invest === true || invest === 'true') {
    const amt = answers.manager_investment_amount;
    const pct = answers.manager_investment_pct;
    const method = stringVal(answers.manager_investment_method).trim();
    const amtN = typeof amt === 'number' ? amt : parseFloat(String(amt ?? '').replace(/,/g, '').trim());
    const pctN = typeof pct === 'number' ? pct : parseFloat(String(pct ?? '').trim());
    if (!Number.isFinite(amtN) || amtN < 0) return false;
    if (!Number.isFinite(pctN) || pctN < 0 || pctN > 100) return false;
    if (!method) return false;
  }
  const ob = answers.other_business_activities_yes;
  if (ob === true || ob === 'true') {
    if (!stringVal(answers.other_activities).trim()) return false;
  }
  const oc = answers.outside_contracts_yes;
  if (oc === true || oc === 'true') {
    if (!stringVal(answers.outside_contracts).trim()) return false;
  }
  const hc = answers.has_conflicts_of_interest;
  if (hc === true || hc === 'true') {
    if (!stringVal(answers.conflicts_description).trim()) return false;
    if (!stringVal(answers.conflicts_resolution).trim()) return false;
  }
  const hr = answers.has_regulations;
  if (hr === true || hr === 'true') {
    if (!stringVal(answers.regulations_list).trim()) return false;
    const cs = stringVal(answers.compliance_status).trim();
    if (!['compliant', 'pending', 'non_compliant'].includes(cs)) return false;
    if (cs === 'non_compliant' && !stringVal(answers.compliance_details).trim()) return false;
  }
  const hl = answers.has_litigation;
  if (hl === true || hl === 'true') {
    const ls = stringVal(answers.litigation_status).trim();
    if (!['past', 'pending'].includes(ls)) return false;
    if (!stringVal(answers.litigation_description).trim()) return false;
  }
  return true;
}

function investmentStrategyExtra(answers: Record<string, unknown>): boolean {
  const cr = stringVal(answers.coinvestment_reliance).trim();
  if ((cr === 'required' || cr === 'opportunistic') && !stringVal(answers.coinvestment_steps).trim()) {
    return false;
  }
  const fees = answers.charges_portfolio_fees;
  if ((fees === true || fees === 'true') && !stringVal(answers.portfolio_fees_description).trim()) {
    return false;
  }
  return true;
}

function companySizeRequirementItem(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: QuestionDef,
): RequirementItem {
  const satisfied = specialQuestionSatisfied(sectionKey, answers, documents, q);
  if (satisfied) {
    return { label: 'Company size parameters', satisfied: true };
  }
  const raw = answers.company_size_params;
  const { minRev, maxRev, minInv, maxInv } = companySizeRevenueInvestmentFromRaw(raw);
  if (minRev === null || minRev <= 0) {
    return { label: 'Company size — minimum revenue required', satisfied: false };
  }
  if (maxRev === null || maxRev <= 0) {
    return { label: 'Company size — maximum revenue required', satisfied: false };
  }
  if (maxRev < minRev) {
    return { label: 'Company size — max revenue must exceed min revenue', satisfied: false };
  }
  if (minInv === null || minInv <= 0) {
    return { label: 'Company size — minimum investment required', satisfied: false };
  }
  if (maxInv === null || maxInv <= 0) {
    return { label: 'Company size — maximum investment required', satisfied: false };
  }
  if (maxInv < minInv) {
    return { label: 'Company size — max investment must exceed min investment', satisfied: false };
  }
  const nums = companySizeParamsNumbers(raw);
  if (
    nums &&
    (nums.revenue_min_usd < 0 ||
      nums.revenue_max_usd < 0 ||
      nums.investment_min_usd < 0 ||
      nums.investment_max_usd < 0)
  ) {
    return { label: 'Company size — enter valid non-negative amounts', satisfied: false };
  }
  return { label: 'Company size parameters', satisfied: false };
}

function stageAllocationRequirementItem(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: QuestionDef,
): RequirementItem {
  const satisfied = specialQuestionSatisfied(sectionKey, answers, documents, q);
  if (satisfied) {
    return { label: 'Stage allocation (must total 100%)', satisfied: true };
  }
  const raw = answers.stage_allocation;
  const parts = stageAllocationPercents(raw);
  if (!parts) {
    return { label: 'Stage allocation — fill all four stages', satisfied: false };
  }
  const sum = parts.ideas + parts.startups + parts.scaling + parts.mature;
  if (Math.abs(sum - 100) > 0.01) {
    const rounded = Math.round(sum * 100) / 100;
    const display = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return { label: `Stage allocation — total is ${display}%, must be 100%`, satisfied: false };
  }
  if ([parts.ideas, parts.startups, parts.scaling, parts.mature].some((n) => n < 0 || n > 100)) {
    return { label: 'Stage allocation — each stage must be 0–100%', satisfied: false };
  }
  return { label: 'Stage allocation (must total 100%)', satisfied: false };
}

function jamaicaMinAllocationRequirementItem(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: QuestionDef,
): RequirementItem {
  const satisfied = specialQuestionSatisfied(sectionKey, answers, documents, q);
  if (satisfied) {
    return { label: 'Jamaica minimum allocation (≥ 40%)', satisfied: true };
  }
  const raw = answers.jamaica_min_allocation_pct;
  const s = stringVal(raw).trim();
  if (!s) {
    return { label: 'Jamaica minimum allocation required', satisfied: false };
  }
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    return { label: 'Jamaica minimum allocation required', satisfied: false };
  }
  if (n < 40) {
    return { label: `Jamaica allocation — ${n}% entered, minimum is 40%`, satisfied: false };
  }
  return { label: 'Jamaica minimum allocation (≥ 40%)', satisfied: false };
}

function investmentThesisRequirementItem(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: QuestionDef,
): RequirementItem {
  const satisfied = specialQuestionSatisfied(sectionKey, answers, documents, q);
  if (satisfied) {
    return { label: 'Investment thesis (min 100 characters)', satisfied: true };
  }
  const len = stringVal(answers.investment_thesis).trim().length;
  return {
    label: `Investment thesis — ${len} characters entered, minimum is 100`,
    satisfied: false,
  };
}

function contactPersonsRequirementItem(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
  q: QuestionDef,
): RequirementItem {
  const satisfied = specialQuestionSatisfied(sectionKey, answers, documents, q);
  if (satisfied) {
    return { label: 'At least 2 contact persons with name and email', satisfied: true };
  }
  const rows = normalizeContactPersonsValue(answers.contact_persons);
  const withPair = countContactsWithNameAndEmail(rows);
  if (withPair < 2) {
    return { label: `At least 2 contact persons required (have ${withPair})`, satisfied: false };
  }
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.email.trim()) {
      return { label: `Contact person ${i + 1} — email required`, satisfied: false };
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.name.trim()) {
      return { label: `Contact person ${i + 1} — name required`, satisfied: false };
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.phone.trim()) {
      return { label: `Contact person ${i + 1} — phone required`, satisfied: false };
    }
  }
  const complete = rows.filter((r) => r.name.trim() && r.email.trim() && r.phone.trim());
  if (complete.length < 2) {
    return { label: `At least 2 contact persons required (have ${complete.length})`, satisfied: false };
  }
  return { label: 'At least 2 contact persons with name and email', satisfied: false };
}

function buildItemsForConfig(
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
  documents: DdDocumentRow[],
): RequirementItem[] {
  const config = getSectionConfig(sectionKey);
  if (!config) return [];

  const items: RequirementItem[] = [];

  if (sectionKey === 'basic_info') {
    const contactQ = config.questions.find((q) => q.type === 'contact_persons');
    items.push(
      { label: 'Fund name', satisfied: stringVal(answers.fund_name).trim().length > 0 },
      { label: 'Country of incorporation', satisfied: stringVal(answers.country_of_incorporation).trim().length > 0 },
      {
        label: 'Geographic area of activity (at least 1 country)',
        satisfied: multiSelectCountriesOk(answers.geographic_area_activity),
      },
      {
        label: 'Total capital commitment',
        satisfied: (() => {
          const raw = answers.total_capital_commitment_usd;
          const s = stringVal(raw).trim();
          if (!s) return false;
          const n = Number(String(raw).replace(/,/g, ''));
          return !Number.isNaN(n) && n >= 0;
        })(),
      },
      contactQ
        ? contactPersonsRequirementItem(sectionKey, answers, documents, contactQ)
        : {
            label: 'At least 2 contact persons with name and email',
            satisfied: contactPersonsSectionSatisfied(normalizeContactPersonsValue(answers.contact_persons)),
          },
    );
    return items;
  }

  if (sectionKey === 'sponsor') {
    const qMap = new Map(config.questions.map((q) => [q.key, q]));
    const sat = (key: string) => {
      const q = qMap.get(key);
      return q ? specialQuestionSatisfied(sectionKey, answers, documents, q) : true;
    };
    const officeOk = sat('office_locations');
    items.push(
      { label: 'Manager name', satisfied: stringVal(answers.manager_name).trim().length > 0 },
      { label: 'At least 1 shareholder', satisfied: sat('shareholders') },
      { label: 'At least 1 investment professional', satisfied: sat('investment_professionals') },
      {
        label: officeOk ? 'Office locations (primary address)' : 'Office locations — all rows must have an address',
        satisfied: officeOk,
      },
      { label: 'Compensation structure', satisfied: sat('compensation_structure') },
      { label: 'Will manager invest (answered)', satisfied: sat('manager_will_invest') },
      { label: 'Organisation chart uploaded', satisfied: sat('org_chart') },
      { label: 'Financial statements uploaded', satisfied: sat('financial_statements') },
      { label: 'Track record', satisfied: sat('track_record_vc_pe') },
      { label: 'Financial data', satisfied: sat('financial_strength_evidence') },
      { label: 'Support staff (complete any started rows)', satisfied: sat('support_staff') },
      { label: 'Outside advisors (complete any started rows)', satisfied: sat('outside_advisors') },
      { label: 'Outsourced services (complete any started rows)', satisfied: sat('outsourced_services') },
      {
        label:
          'Disclosures (other business, contracts, conflicts, regulations, litigation, manager investment if Yes)',
        satisfied: sponsorExtraRules(answers),
      },
    );
    return items;
  }

  if (sectionKey === 'deal_flow') {
    const keys = [
      ['Competitive advantage', 'competitive_advantage'],
      ['Business environment & networking', 'business_environment_dynamics'],
      ['Networking assets', 'networking_assets'],
      ['Sourcing strategy', 'sourcing_strategy'],
      ['Deal flow universe', 'deal_flow_universe'],
      ['ESG guidelines', 'esg_guidelines'],
      ['At least 1 pipeline company (all required columns)', 'pipeline_companies'],
    ] as const;
    const cfg = config.questions;
    const qMap = new Map(cfg.map((q) => [q.key, q]));
    for (const [label, key] of keys) {
      const q = qMap.get(key);
      items.push({
        label,
        satisfied: q ? specialQuestionSatisfied(sectionKey, answers, documents, q) : false,
      });
    }
    return items;
  }

  if (sectionKey === 'portfolio_monitoring') {
    const labels: [string, string][] = [
      ['Monitoring procedures', 'monitoring_procedures'],
      ['Confidential information policy', 'confidential_information_policy'],
      ['IT platforms', 'it_platforms'],
      ['Management recruiting approach', 'management_recruiting'],
      ['Valuation guidelines', 'valuation_guidelines'],
      ['Exit identification process', 'exit_identification'],
      ['Fund auditing policy', 'fund_auditing_policy'],
      ['Portfolio company auditing policy', 'portfolio_company_auditing_policy'],
    ];
    const qMap = new Map(config.questions.map((q) => [q.key, q]));
    for (const [label, key] of labels) {
      const q = qMap.get(key)!;
      items.push({ label, satisfied: plainQuestionSatisfied(answers, documents, q as PlainQuestion, sectionKey) });
    }
    return items;
  }

  if (sectionKey === 'investment_strategy') {
    const qMap = new Map(config.questions.map((q) => [q.key, q]));
    const sat = (key: string) => {
      const q = qMap.get(key);
      return q ? specialQuestionSatisfied(sectionKey, answers, documents, q) : false;
    };
    const stageQ = qMap.get('stage_allocation');
    const companySizeQ = qMap.get('company_size_params');
    const jamaicaQ = qMap.get('jamaica_min_allocation_pct');
    const thesisQ = qMap.get('investment_thesis');
    items.push(
      stageQ
        ? stageAllocationRequirementItem(sectionKey, answers, documents, stageQ)
        : { label: 'Stage allocation (must total 100%)', satisfied: sat('stage_allocation') },
      companySizeQ
        ? companySizeRequirementItem(sectionKey, answers, documents, companySizeQ)
        : { label: 'Company size parameters', satisfied: sat('company_size_params') },
      { label: 'At least 1 sector allocation', satisfied: sat('sector_allocations') },
      jamaicaQ
        ? jamaicaMinAllocationRequirementItem(sectionKey, answers, documents, jamaicaQ)
        : { label: 'Jamaica minimum allocation (≥ 40%)', satisfied: sat('jamaica_min_allocation_pct') },
      { label: 'Control policy', satisfied: sat('control_policy') },
      { label: 'Protection clauses', satisfied: sat('protection_clauses') },
      { label: 'Expected returns (gross and net IRR)', satisfied: sat('gross_irr_target_pct') && sat('net_irr_target_pct') },
      { label: 'Investment horizon (years)', satisfied: sat('investment_horizon_years') },
      { label: 'At least 1 investment instrument', satisfied: sat('investment_instruments') },
      { label: 'Investment fees (answered)', satisfied: sat('charges_portfolio_fees') },
      { label: 'Co-investment strategy', satisfied: sat('coinvestment_reliance') },
      {
        label: 'Co-investment steps & portfolio fee description (when applicable)',
        satisfied: investmentStrategyExtra(answers),
      },
      thesisQ
        ? investmentThesisRequirementItem(sectionKey, answers, documents, thesisQ)
        : { label: 'Investment thesis (min 100 characters)', satisfied: sat('investment_thesis') },
      { label: 'Portfolio projection file uploaded', satisfied: sat('portfolio_projection_excel') },
      { label: 'Geographic allocations (complete any started rows)', satisfied: sat('geographic_allocations') },
      { label: 'Investment rounds (complete any started rows)', satisfied: sat('investment_rounds') },
      { label: 'Co-investors list (complete any started rows)', satisfied: sat('coinvestors') },
    );
    return items;
  }

  if (sectionKey === 'governing_rules') {
    const qMap = new Map(config.questions.map((q) => [q.key, q]));
    const sat = (key: string) => {
      const q = qMap.get(key);
      return q ? plainQuestionSatisfied(answers, documents, q as PlainQuestion, sectionKey) : false;
    };
    items.push(
      { label: 'Management fee description', satisfied: sat('management_fee') },
      { label: 'Fund expenses', satisfied: sat('fund_expenses') },
      { label: 'Capital call mechanics', satisfied: sat('capital_call_mechanics') },
      { label: 'Distribution waterfall', satisfied: sat('distribution_waterfall') },
      { label: 'Tax liabilities', satisfied: sat('tax_liabilities') },
      { label: 'Investment period and fund life', satisfied: sat('investment_period_fund_life_extensions') },
      { label: 'Key persons', satisfied: sat('key_persons_obligations') },
      { label: 'Removal of manager clauses', satisfied: sat('removal_of_manager') },
      { label: 'Liquidation process', satisfied: sat('liquidation_process') },
      { label: 'Early liquidation triggers', satisfied: sat('early_liquidation_triggers') },
      { label: 'Shareholder meetings and voting', satisfied: sat('shareholder_meetings_voting') },
      { label: 'Investment Committee description', satisfied: sat('investment_committee') },
      { label: 'Commitment thresholds', satisfied: sat('commitment_thresholds') },
      { label: 'Leverage policy', satisfied: sat('leverage_policy') },
    );
    return items;
  }

  if (sectionKey === 'investors_fundraising') {
    const qMap = new Map(config.questions.map((q) => [q.key, q]));
    const sat = (key: string) => {
      const q = qMap.get(key);
      return q ? specialQuestionSatisfied(sectionKey, answers, documents, q) : false;
    };
    items.push(
      { label: 'Potential investors (at least one named)', satisfied: sat('potential_investors') },
      { label: 'First closing date', satisfied: stringVal(answers.first_closing_date).trim().length > 0 },
      { label: 'Final closing date', satisfied: stringVal(answers.final_closing_date).trim().length > 0 },
      {
        label: 'Number of closings',
        satisfied: (() => {
          const n = numFromUnknown(answers.number_of_closings);
          return n !== null && n >= 1 && n <= 10;
        })(),
      },
      { label: 'Late entrant terms', satisfied: stringVal(answers.late_entrant_terms).trim().length > 0 },
      { label: 'Secured investors (complete any started rows)', satisfied: sat('secured_investors') },
    );
    return items;
  }

  if (sectionKey === 'legal') {
    const qMap = new Map(config.questions.map((q) => [q.key, q]));
    const sat = (key: string) => {
      const q = qMap.get(key);
      return q ? specialQuestionSatisfied(sectionKey, answers, documents, q) : false;
    };
    items.push(
      { label: 'At least 1 legal document', satisfied: sat('legal_documents_register') },
      { label: 'Regulations and compliance status', satisfied: sat('legal_regulations_compliance') },
      { label: 'Legal status (litigation)', satisfied: sat('legal_litigation_summary') },
    );
    return items;
  }

  for (const q of config.questions) {
    if (!q.required) continue;
    items.push({
      label: q.label,
      satisfied: specialQuestionSatisfied(sectionKey, answers, documents, q),
    });
  }
  return items;
}

export function getRequirementItems(params: {
  sectionKey: DdSectionKey;
  answers: Record<string, unknown>;
  documents: DdDocumentRow[];
}): RequirementItemsResult {
  const config = getSectionConfig(params.sectionKey);
  if (!config) {
    return { items: [], allSatisfied: false, satisfiedCount: 0, totalCount: 0 };
  }
  const requiredQuestions = config.questions.filter((q) => q.required);
  if (requiredQuestions.length === 0) {
    return {
      items: [],
      allSatisfied: canMarkSectionComplete(params),
      satisfiedCount: 0,
      totalCount: 0,
    };
  }

  const items = buildItemsForConfig(params.sectionKey, params.answers, params.documents);
  const gate = canMarkSectionComplete(params);
  const satisfiedCount = items.filter((i) => i.satisfied).length;
  const totalCount = items.length;

  const derivedAll = items.length > 0 && items.every((i) => i.satisfied);
  if (derivedAll !== gate && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn('[getRequirementItems] Checklist vs canMarkSectionComplete mismatch', {
      sectionKey: params.sectionKey,
      derivedAll,
      gate,
      items,
    });
  }

  return {
    items,
    allSatisfied: gate,
    satisfiedCount,
    totalCount,
  };
}
