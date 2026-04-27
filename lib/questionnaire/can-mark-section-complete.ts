/**
 * Client-side gate for enabling "Mark section complete" (mirrors server validation
 * except DB-only checks are approximated with the loaded documents list).
 *
 * Keep in sync with getRequirementItems in lib/questionnaire/get-requirement-items.ts
 */

import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import type { DdSectionKey, PlainQuestion, QuestionDef } from '@/lib/questionnaire/types';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import { contactPersonsSectionSatisfied, normalizeContactPersonsValue } from '@/lib/questionnaire/contact-persons';
import { countWords } from '@/lib/questionnaire/word-count';
import {
  pipelineCompanyRowsMeetRequirements,
  type LegalDocRow,
  type PipelineRow,
} from '@/lib/questionnaire/validate';
import { filterBlankStructuredListRowsForReplace } from '@/lib/questionnaire/structured-list-db';

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

function warnBlockedQ(sectionKey: DdSectionKey, q: QuestionDef, answers: Record<string, unknown>): false {
  // TODO: REMOVE AFTER AUTO-COMPLETE TESTING
  console.warn(
    '[CanComplete]',
    sectionKey,
    'blocked by question:',
    q.key,
    'type:',
    q.type,
    'value:',
    answers[q.key],
  );
  return false;
}

function warnBlockedRule(sectionKey: DdSectionKey, ruleKey: string, ruleType: string, value: unknown): false {
  // TODO: REMOVE AFTER AUTO-COMPLETE TESTING
  console.warn(
    '[CanComplete]',
    sectionKey,
    'blocked by question:',
    ruleKey,
    'type:',
    ruleType,
    'value:',
    value,
  );
  return false;
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

export function canMarkSectionComplete(params: {
  sectionKey: DdSectionKey;
  answers: Record<string, unknown>;
  documents: DdDocumentRow[];
}): boolean {
  const config = getSectionConfig(params.sectionKey);
  if (!config) return warnBlockedRule(params.sectionKey, '_config', 'missing', null);

  const requiredQuestions = config.questions.filter((q) => q.required);
  if (requiredQuestions.length === 0) return true;

  for (const q of config.questions) {
    if (!isPlainQuestion(q)) {
      if (q.type === 'pipeline_companies') {
        const rows = parseJsonArray<PipelineRow>(params.answers[q.key]);
        if (q.required && rows.length < 1) return warnBlockedQ(params.sectionKey, q, params.answers);
        if (!pipelineCompanyRowsMeetRequirements(rows)) return warnBlockedQ(params.sectionKey, q, params.answers);
      }
      if (q.type === 'legal_documents_table') {
        const rows = parseJsonArray<LegalDocRow>(params.answers[q.key]);
        if (q.required && rows.length < 1) return warnBlockedQ(params.sectionKey, q, params.answers);
        for (const r of rows) {
          if (!r.name?.trim() || !r.purpose?.trim() || !r.status?.trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
      }
      if (q.type === 'legal_documents_list') {
        const rows = parseJsonArray<{
          document_name?: string;
          purpose?: string;
          status?: string;
        }>(params.answers[q.key]).filter((r) => {
          const nm = String(r.document_name ?? (r as { name?: string }).name ?? '').trim();
          return nm.length > 0;
        });
        if (q.required && rows.length < 1) return warnBlockedQ(params.sectionKey, q, params.answers);
        for (const r of rows) {
          const nm = String(r.document_name ?? (r as { name?: string }).name ?? '').trim();
          if (!nm) return warnBlockedQ(params.sectionKey, q, params.answers);
          if (!String(r.purpose ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
          if (!String(r.status ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
      }
      if (q.type === 'contact_persons') {
        const rows = normalizeContactPersonsValue(params.answers[q.key]);
        if (q.required && !contactPersonsSectionSatisfied(rows)) return warnBlockedQ(params.sectionKey, q, params.answers);
      }
      if (q.type === 'stage_allocation') {
        const parts = stageAllocationPercents(params.answers[q.key]);
        if (q.required && !parts) return warnBlockedQ(params.sectionKey, q, params.answers);
        if (parts) {
          if ([parts.ideas, parts.startups, parts.scaling, parts.mature].some((n) => n < 0 || n > 100)) return warnBlockedQ(params.sectionKey, q, params.answers);
          const sum = parts.ideas + parts.startups + parts.scaling + parts.mature;
          if (Math.abs(sum - 100) > 0.01) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
      }
      if (q.type === 'company_size_params') {
        const nums = companySizeParamsNumbers(params.answers[q.key]);
        if (q.required && !nums) return warnBlockedQ(params.sectionKey, q, params.answers);
        if (nums) {
          if (
            nums.revenue_min_usd < 0 ||
            nums.revenue_max_usd < 0 ||
            nums.investment_min_usd < 0 ||
            nums.investment_max_usd < 0
          ) {
            return warnBlockedQ(params.sectionKey, q, params.answers);
          }
          if (nums.revenue_min_usd > nums.revenue_max_usd) return warnBlockedQ(params.sectionKey, q, params.answers);
          if (nums.investment_min_usd > nums.investment_max_usd) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
      }
      if (q.type === 'structured_list') {
        const rowsRaw = parseJsonArray<Record<string, unknown>>(params.answers[q.key]);
        const rows = filterBlankStructuredListRowsForReplace(q.listKind, rowsRaw) as Record<string, unknown>[];
        const min = STRUCTURED_LIST_REGISTRY[q.listKind].minRows;
        if (rows.length < min) return warnBlockedQ(params.sectionKey, q, params.answers);
        if (q.required && q.listKind === 'investment_professionals' && rows.length < 1) return warnBlockedQ(params.sectionKey, q, params.answers);
        if (
          q.required &&
          (q.listKind === 'sector_allocations' || q.listKind === 'investment_instruments') &&
          rows.length < 1
        ) {
          return warnBlockedQ(params.sectionKey, q, params.answers);
        }
        if (q.required && q.listKind === 'office_locations') {
          if (rows.length < 1) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
        if (q.required && q.listKind === 'potential_investors') {
          if (!rows.some((row) => String(row.investor_name ?? '').trim())) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
        const req = q.required;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          switch (q.listKind) {
            case 'shareholders':
              if (req && !String(r.full_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              break;
            case 'investment_professionals': {
              if (!req) break;
              const ps = String(r.position_status ?? 'full_time').trim();
              if (ps !== 'full_time' && ps !== 'part_time' && ps !== 'vacant') return warnBlockedQ(params.sectionKey, q, params.answers);
              if (ps === 'vacant') {
                if (!String(r.title ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const ht = String(r.hire_timeline ?? '').trim();
                if (ht !== 'immediate' && ht !== 'within_6_months' && ht !== 'within_1_year') return warnBlockedQ(params.sectionKey, q, params.answers);
              } else {
                if (!String(r.full_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                if (!String(r.title ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const rawPct = r.time_dedication_pct;
                const pctStr =
                  rawPct === null || rawPct === undefined ? '' : String(rawPct).replace(/,/g, '').trim();
                if (!pctStr) return warnBlockedQ(params.sectionKey, q, params.answers);
                const n = Number(pctStr);
                if (!Number.isFinite(n) || n < 0 || n > 100) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            }
            case 'office_locations': {
              if (req && !String(r.address ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              break;
            }
            case 'support_staff':
              if (
                String(r.full_name ?? '').trim() ||
                String(r.position ?? '').trim() ||
                String(r.department ?? '').trim()
              ) {
                if (!String(r.full_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const d = String(r.department ?? '').trim();
                if (!['legal', 'accounting', 'it', 'admin', 'other'].includes(d)) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            case 'outside_advisors':
              if (String(r.full_name ?? '').trim() || String(r.role ?? '').trim()) {
                if (!String(r.full_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            case 'outsourced_services':
              if (String(r.company_name ?? '').trim() || String(r.activities ?? '').trim()) {
                if (!String(r.company_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            case 'investment_rounds': {
              const hasAny =
                String(r.round_name ?? '').trim() ||
                (r.min_usd !== null && r.min_usd !== undefined && String(r.min_usd).trim() !== '') ||
                (r.max_usd !== null && r.max_usd !== undefined && String(r.max_usd).trim() !== '');
              if (hasAny) {
                if (!String(r.round_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const lo = numFromUnknown(r.min_usd);
                const hi = numFromUnknown(r.max_usd);
                if (lo !== null && hi !== null && lo > hi) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            }
            case 'sector_allocations': {
              const hasSector =
                String(r.sector_name ?? '').trim() ||
                (r.max_pct !== null && r.max_pct !== undefined && String(r.max_pct).trim() !== '');
              if (req) {
                if (!String(r.sector_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const mx = numFromUnknown(r.max_pct);
                if (mx === null || mx < 0 || mx > 100) return warnBlockedQ(params.sectionKey, q, params.answers);
              } else if (hasSector) {
                if (!String(r.sector_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const mx = numFromUnknown(r.max_pct);
                if (mx !== null && (mx < 0 || mx > 100)) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            }
            case 'geographic_allocations': {
              const hasGeo =
                String(r.region_country ?? '').trim() ||
                (r.max_pct !== null && r.max_pct !== undefined && String(r.max_pct).trim() !== '');
              if (hasGeo) {
                if (!String(r.region_country ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const mx = numFromUnknown(r.max_pct);
                if (mx !== null && (mx < 0 || mx > 100)) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            }
            case 'investment_instruments': {
              const hasInst =
                String(r.instrument_name ?? '').trim() ||
                (r.fund_pct !== null && r.fund_pct !== undefined && String(r.fund_pct).trim() !== '') ||
                String(r.legal_notes ?? '').trim();
              if (req) {
                if (!String(r.instrument_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const pct = numFromUnknown(r.fund_pct);
                if (pct === null || pct < 0 || pct > 100) return warnBlockedQ(params.sectionKey, q, params.answers);
              } else if (hasInst) {
                if (!String(r.instrument_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
                const pct = numFromUnknown(r.fund_pct);
                if (pct !== null && (pct < 0 || pct > 100)) return warnBlockedQ(params.sectionKey, q, params.answers);
              }
              break;
            }
            case 'coinvestors': {
              const hasCo =
                String(r.company_name ?? '').trim() ||
                String(r.contact_name ?? '').trim() ||
                String(r.phone ?? '').trim() ||
                String(r.email ?? '').trim();
              if (hasCo && !String(r.company_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              break;
            }
            case 'secured_investors': {
              const hasRow =
                String(r.investor_name ?? '').trim() ||
                (r.amount_usd !== null && r.amount_usd !== undefined && String(r.amount_usd).trim() !== '') ||
                String(r.description ?? '').trim();
              if (hasRow && !String(r.investor_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              break;
            }
            case 'potential_investors': {
              const hasRow =
                String(r.investor_name ?? '').trim() ||
                (r.expected_amount_usd !== null &&
                  r.expected_amount_usd !== undefined &&
                  String(r.expected_amount_usd).trim() !== '') ||
                String(r.timeline ?? '').trim();
              if (hasRow && !String(r.investor_name ?? '').trim()) return warnBlockedQ(params.sectionKey, q, params.answers);
              break;
            }
            default:
              break;
          }
        }
      }
      if (q.type === 'multi_select') {
        const rows = parseJsonArray<string>(params.answers[q.key]);
        if (q.required && rows.length < 1) return warnBlockedQ(params.sectionKey, q, params.answers);
      }
      continue;
    }

    const raw = params.answers[q.key];
    if (q.required) {
      if (q.type === 'boolean') {
        if (raw !== true && raw !== false && raw !== 'true' && raw !== 'false') return warnBlockedQ(params.sectionKey, q, params.answers);
      } else if (q.type === 'file') {
        const tag = q.uploadTag ?? q.key;
        const has = params.documents.some((d) => d.tag === tag);
        if (!has) return warnBlockedQ(params.sectionKey, q, params.answers);
      } else {
        const s = stringVal(raw).trim();
        if (!s) return warnBlockedQ(params.sectionKey, q, params.answers);
        if (q.type === 'currency' || q.type === 'number') {
          const n = Number(String(raw).replace(/,/g, ''));
          if (Number.isNaN(n) || n < 0) return warnBlockedQ(params.sectionKey, q, params.answers);
          if (q.key === 'jamaica_min_allocation_pct' && q.required && n < 40) return warnBlockedQ(params.sectionKey, q, params.answers);
        }
      }
    }

    if (q.maxWords) {
      const s = stringVal(raw);
      if (countWords(s) > q.maxWords) return warnBlockedQ(params.sectionKey, q, params.answers);
    }

    if (q.key === 'investment_thesis' && params.sectionKey === 'investment_strategy') {
      if (stringVal(raw).trim().length < 100) return warnBlockedQ(params.sectionKey, q, params.answers);
    }
  }

  if (params.sectionKey === 'sponsor') {
    const invest = params.answers.manager_will_invest;
    if (invest === true || invest === 'true') {
      const amt = params.answers.manager_investment_amount;
      const pct = params.answers.manager_investment_pct;
      const method = stringVal(params.answers.manager_investment_method).trim();
      const amtN = typeof amt === 'number' ? amt : parseFloat(String(amt ?? '').replace(/,/g, '').trim());
      const pctN = typeof pct === 'number' ? pct : parseFloat(String(pct ?? '').trim());
      if (!Number.isFinite(amtN) || amtN < 0) return warnBlockedRule(params.sectionKey, 'manager_investment_amount', 'currency', amt);
      if (!Number.isFinite(pctN) || pctN < 0 || pctN > 100) return warnBlockedRule(params.sectionKey, 'manager_investment_pct', 'percent', pct);
      if (!method) return warnBlockedRule(params.sectionKey, 'manager_investment_method', 'select', method);
    }
    const ob = params.answers.other_business_activities_yes;
    if (ob === true || ob === 'true') {
      if (!stringVal(params.answers.other_activities).trim()) return warnBlockedRule(params.sectionKey, 'other_activities', 'text', params.answers.other_activities);
    }
    const oc = params.answers.outside_contracts_yes;
    if (oc === true || oc === 'true') {
      if (!stringVal(params.answers.outside_contracts).trim()) return warnBlockedRule(params.sectionKey, 'outside_contracts', 'text', params.answers.outside_contracts);
    }
    const hc = params.answers.has_conflicts_of_interest;
    if (hc === true || hc === 'true') {
      if (!stringVal(params.answers.conflicts_description).trim()) return warnBlockedRule(params.sectionKey, 'conflicts_description', 'text', params.answers.conflicts_description);
      if (!stringVal(params.answers.conflicts_resolution).trim()) return warnBlockedRule(params.sectionKey, 'conflicts_resolution', 'text', params.answers.conflicts_resolution);
    }
    const hr = params.answers.has_regulations;
    if (hr === true || hr === 'true') {
      if (!stringVal(params.answers.regulations_list).trim()) return warnBlockedRule(params.sectionKey, 'regulations_list', 'text', params.answers.regulations_list);
      const cs = stringVal(params.answers.compliance_status).trim();
      if (!['compliant', 'pending', 'non_compliant'].includes(cs)) return warnBlockedRule(params.sectionKey, 'compliance_status', 'select', cs);
      if (cs === 'non_compliant' && !stringVal(params.answers.compliance_details).trim()) return warnBlockedRule(params.sectionKey, 'compliance_details', 'text', params.answers.compliance_details);
    }
    const hl = params.answers.has_litigation;
    if (hl === true || hl === 'true') {
      const ls = stringVal(params.answers.litigation_status).trim();
      if (!['past', 'pending'].includes(ls)) return warnBlockedRule(params.sectionKey, 'litigation_status', 'select', ls);
      if (!stringVal(params.answers.litigation_description).trim()) return warnBlockedRule(params.sectionKey, 'litigation_description', 'text', params.answers.litigation_description);
    }
  }

  if (params.sectionKey === 'investment_strategy') {
    const cr = stringVal(params.answers.coinvestment_reliance).trim();
    if ((cr === 'required' || cr === 'opportunistic') && !stringVal(params.answers.coinvestment_steps).trim()) {
      return warnBlockedRule(params.sectionKey, 'coinvestment_steps', 'text', params.answers.coinvestment_steps);
    }
    const fees = params.answers.charges_portfolio_fees;
    if ((fees === true || fees === 'true') && !stringVal(params.answers.portfolio_fees_description).trim()) {
      return warnBlockedRule(params.sectionKey, 'portfolio_fees_description', 'textarea', params.answers.portfolio_fees_description);
    }
  }

  if (params.sectionKey === 'investors_fundraising') {
    if (!stringVal(params.answers.first_closing_date).trim()) return warnBlockedRule(params.sectionKey, 'first_closing_date', 'date', params.answers.first_closing_date);
    if (!stringVal(params.answers.final_closing_date).trim()) return warnBlockedRule(params.sectionKey, 'final_closing_date', 'date', params.answers.final_closing_date);
    const nclos = numFromUnknown(params.answers.number_of_closings);
    if (nclos === null || nclos < 1 || nclos > 10) return warnBlockedRule(params.sectionKey, 'number_of_closings', 'number', params.answers.number_of_closings);
    if (!stringVal(params.answers.late_entrant_terms).trim()) return warnBlockedRule(params.sectionKey, 'late_entrant_terms', 'text', params.answers.late_entrant_terms);
  }

  return true;
}
