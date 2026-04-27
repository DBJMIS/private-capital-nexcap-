/**
 * Per-section validation before "Mark Section Complete".
 * File path: lib/questionnaire/validate.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey, PlainQuestion, QuestionDef } from '@/lib/questionnaire/types';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import { filterBlankStructuredListRowsForReplace } from '@/lib/questionnaire/structured-list-db';
import { contactPersonsSectionSatisfied, normalizeContactPersonsValue } from '@/lib/questionnaire/contact-persons';
import { countWords } from '@/lib/questionnaire/word-count';
import { PIPELINE_SECTOR_OPTIONS } from '@/lib/questionnaire/pipeline-sectors';

export type AnswerMap = Record<string, unknown>;

export type StaffBioInput = {
  id?: string;
  full_name: string;
  work_phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  education?: unknown;
  work_experience?: string | null;
  fund_responsibilities?: string | null;
};

export type PipelineRow = {
  id: string;
  company_name?: string;
  amount_usd?: string;
  sector?: string;
  sales_usd?: string;
  leverage?: string;
  equity_pct?: string;
  /** Legacy free-text exit line (maps to DB exit_notes when exit_notes unset). */
  exit_strategy?: string;
  negotiation_status?: string;
  exit_type?: string;
  exit_notes?: string;
  investment_thesis?: string;
  deal_structure_notes?: string;
};

const PIPELINE_NEGOTIATION = new Set([
  'initial_contact',
  'in_discussion',
  'term_sheet',
  'due_diligence',
  'agreed',
]);

const PIPELINE_EXIT = new Set(['ipo', 'trade_sale', 'strategic_acquirer', 'mbo_mbi', 'other']);

const PIPELINE_SECTOR_VALUES = new Set<string>(PIPELINE_SECTOR_OPTIONS.map((o) => o.value));

function parseUsdAmount(s: string | undefined): number | null {
  const t = (s ?? '').replace(/,/g, '').trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Every row satisfies required pipeline fields (client “mark complete” gate). */
export function pipelineCompanyRowsMeetRequirements(rows: PipelineRow[]): boolean {
  for (const r of rows) {
    if (!r.company_name?.trim()) return false;
    const sector = (r.sector ?? '').trim();
    if (!sector || !PIPELINE_SECTOR_VALUES.has(sector)) return false;
    const inv = parseUsdAmount(r.amount_usd);
    if (inv === null || inv <= 0) return false;
    const ns = (r.negotiation_status ?? '').trim();
    if (!ns || !PIPELINE_NEGOTIATION.has(ns)) return false;
    const et = (r.exit_type ?? '').trim();
    if (!et || !PIPELINE_EXIT.has(et)) return false;
  }
  return true;
}

export type LegalDocRow = {
  id: string;
  name?: string;
  purpose?: string;
  status?: string;
  document_id?: string | null;
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

export async function validateSectionAnswers(params: {
  supabase: SupabaseClient;
  tenantId: string;
  questionnaireId: string;
  sectionId: string;
  sectionKey: DdSectionKey;
  answers: AnswerMap;
}): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const config = getSectionConfig(params.sectionKey);
  if (!config) return { ok: false, errors: ['Unknown section'] };

  const errors: string[] = [];

  for (const q of config.questions) {
    if (!isPlainQuestion(q)) {
      if (q.type === 'pipeline_companies') {
        const rows = parseJsonArray<PipelineRow>(params.answers[q.key]);
        if (q.required && rows.length < 1) {
          errors.push(`${q.label}: add at least one pipeline company.`);
          continue;
        }
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const label = `Pipeline company ${i + 1}`;
          if (!r.company_name?.trim()) {
            errors.push(`${label}: company name is required.`);
          }
          const sector = (r.sector ?? '').trim();
          if (!sector) {
            errors.push(`${label}: sector is required.`);
          } else if (!PIPELINE_SECTOR_VALUES.has(sector)) {
            errors.push(`${label}: select a valid sector.`);
          }
          const inv = parseUsdAmount(r.amount_usd);
          if (inv === null || inv <= 0) {
            errors.push(`${label}: expected investment amount (USD) is required.`);
          }
          const ns = (r.negotiation_status ?? '').trim();
          if (!ns || !PIPELINE_NEGOTIATION.has(ns)) {
            errors.push(`${label}: negotiation status is required.`);
          }
          const et = (r.exit_type ?? '').trim();
          if (!et || !PIPELINE_EXIT.has(et)) {
            errors.push(`${label}: exit type is required.`);
          }
        }
      }
      if (q.type === 'legal_documents_table') {
        const rows = parseJsonArray<LegalDocRow>(params.answers[q.key]);
        if (q.required && rows.length < 1) {
          errors.push(`${q.label}: at least one document required`);
          continue;
        }
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (!r.name?.trim()) {
            errors.push(`${q.label}: document name required`);
          }
          if (!r.purpose?.trim()) {
            errors.push(`${q.label}: document purpose required`);
          }
          if (!r.status?.trim()) {
            errors.push(`${q.label}: document status required`);
          }
        }
        continue;
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
        if (q.required && rows.length < 1) {
          errors.push(`${q.label}: at least one document required`);
          continue;
        }
        for (const r of rows) {
          const nm = String(r.document_name ?? (r as { name?: string }).name ?? '').trim();
          if (!nm) {
            errors.push(`${q.label}: document name required`);
          }
          if (!String(r.purpose ?? '').trim()) {
            errors.push(`${q.label}: document purpose required`);
          }
          if (!String(r.status ?? '').trim()) {
            errors.push(`${q.label}: document status required`);
          }
        }
        continue;
      }
      if (q.type === 'contact_persons') {
        const rows = normalizeContactPersonsValue(params.answers[q.key]);
        if (q.required && !contactPersonsSectionSatisfied(rows)) {
          errors.push('Add at least two contact persons with name, email, and phone for each.');
        }
      }
      if (q.type === 'stage_allocation') {
        const parts = stageAllocationPercents(params.answers[q.key]);
        if (q.required && !parts) {
          errors.push(`${q.label}: enter a percentage for each stage.`);
        }
        if (parts) {
          const checks: [string, number][] = [
            ['ideas', parts.ideas],
            ['startups', parts.startups],
            ['scaling', parts.scaling],
            ['mature', parts.mature],
          ];
          for (const [label, n] of checks) {
            if (n < 0 || n > 100) {
              errors.push(`${q.label}: ${label} % must be between 0 and 100.`);
            }
          }
          const sum = parts.ideas + parts.startups + parts.scaling + parts.mature;
          if (Math.abs(sum - 100) > 0.01) {
            errors.push(`${q.label}: stage percentages must total 100% (currently ${sum.toFixed(2)}%).`);
          }
        }
      }
      if (q.type === 'company_size_params') {
        const nums = companySizeParamsNumbers(params.answers[q.key]);
        if (q.required && !nums) {
          errors.push(`${q.label}: enter min/max revenue and min/max investment per company (USD).`);
        }
        if (nums) {
          if (
            nums.revenue_min_usd < 0 ||
            nums.revenue_max_usd < 0 ||
            nums.investment_min_usd < 0 ||
            nums.investment_max_usd < 0
          ) {
            errors.push(`${q.label}: amounts must be zero or positive.`);
          }
          if (nums.revenue_min_usd > nums.revenue_max_usd) {
            errors.push(`${q.label}: minimum revenue must be less than or equal to maximum revenue.`);
          }
          if (nums.investment_min_usd > nums.investment_max_usd) {
            errors.push(`${q.label}: minimum investment per company must be less than or equal to maximum.`);
          }
        }
      }
      if (q.type === 'structured_list') {
        let rows = parseJsonArray<Record<string, unknown>>(params.answers[q.key]);
        rows = filterBlankStructuredListRowsForReplace(q.listKind, rows) as Record<string, unknown>[];
        const min = STRUCTURED_LIST_REGISTRY[q.listKind].minRows;
        if (rows.length < min) {
          errors.push(`${q.label}: add at least ${min} row(s).`);
        }
        if (
          q.required &&
          (q.listKind === 'sector_allocations' || q.listKind === 'investment_instruments') &&
          rows.length < 1
        ) {
          errors.push(`${q.label}: add at least one row.`);
        }
        if (q.required && q.listKind === 'investment_professionals' && rows.length < 1) {
          errors.push(`${q.label}: add at least one row.`);
        }
        if (q.required && q.listKind === 'office_locations') {
          const hasOffice = rows.some((r) => String(r.address ?? '').trim());
          if (!hasOffice) {
            errors.push(`${q.label}: add at least one office location with an address.`);
          }
        }
        if (q.required && q.listKind === 'potential_investors') {
          if (!rows.some((r) => String(r.investor_name ?? '').trim())) {
            errors.push(`${q.label}: add at least one potential investor.`);
          }
        }
        const req = q.required;
        const rowLabel = (i: number) => `${q.label} row ${i + 1}`;
        const need = (i: number, msg: string) => errors.push(`${rowLabel(i)}: ${msg}`);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          switch (q.listKind) {
            case 'shareholders':
              if (req && !String(r.full_name ?? '').trim()) need(i, 'name is required.');
              break;
            case 'investment_professionals': {
              if (!req) break;
              const ps = String(r.position_status ?? 'full_time').trim();
              if (ps !== 'full_time' && ps !== 'part_time' && ps !== 'vacant') {
                need(i, 'choose a position status.');
                break;
              }
              if (ps === 'vacant') {
                if (!String(r.title ?? '').trim()) need(i, 'position title is required for vacant positions.');
                const ht = String(r.hire_timeline ?? '').trim();
                if (ht !== 'immediate' && ht !== 'within_6_months' && ht !== 'within_1_year') {
                  need(i, 'intended hire timeline is required for vacant positions.');
                }
              } else {
                if (!String(r.full_name ?? '').trim()) need(i, 'full name is required.');
                if (!String(r.title ?? '').trim()) need(i, 'title / position is required.');
                const rawPct = r.time_dedication_pct;
                const pctStr =
                  rawPct === null || rawPct === undefined ? '' : String(rawPct).replace(/,/g, '').trim();
                if (!pctStr) {
                  need(i, '% time dedicated is required.');
                } else {
                  const n = Number(pctStr);
                  if (!Number.isFinite(n) || n < 0 || n > 100) {
                    need(i, '% time dedicated must be a number from 0 to 100.');
                  }
                }
              }
              break;
            }
            case 'office_locations':
              if (req && !String(r.address ?? '').trim()) need(i, 'address is required.');
              break;
            case 'support_staff':
              if (
                String(r.full_name ?? '').trim() ||
                String(r.position ?? '').trim() ||
                String(r.department ?? '').trim()
              ) {
                if (!String(r.full_name ?? '').trim()) need(i, 'name is required when entering support staff.');
                const d = String(r.department ?? '').trim();
                if (!['legal', 'accounting', 'it', 'admin', 'other'].includes(d)) {
                  need(i, 'select a department for each support staff row.');
                }
              }
              break;
            case 'outside_advisors':
              if (String(r.full_name ?? '').trim() || String(r.role ?? '').trim()) {
                if (!String(r.full_name ?? '').trim()) need(i, 'name is required when entering an advisor.');
              }
              break;
            case 'outsourced_services':
              if (String(r.company_name ?? '').trim() || String(r.activities ?? '').trim()) {
                if (!String(r.company_name ?? '').trim()) need(i, 'company / name is required when entering a service.');
              }
              break;
            case 'investment_rounds': {
              const hasAny =
                String(r.round_name ?? '').trim() ||
                (r.min_usd !== null && r.min_usd !== undefined && String(r.min_usd).trim() !== '') ||
                (r.max_usd !== null && r.max_usd !== undefined && String(r.max_usd).trim() !== '');
              if (hasAny) {
                if (!String(r.round_name ?? '').trim()) need(i, 'round name is required.');
                const lo = numFromUnknown(r.min_usd);
                const hi = numFromUnknown(r.max_usd);
                if (lo !== null && hi !== null && lo > hi) {
                  need(i, 'minimum USD must be less than or equal to maximum USD.');
                }
              }
              break;
            }
            case 'sector_allocations': {
              const hasSector =
                String(r.sector_name ?? '').trim() ||
                (r.max_pct !== null && r.max_pct !== undefined && String(r.max_pct).trim() !== '');
              if (req) {
                if (!String(r.sector_name ?? '').trim()) need(i, 'sector name is required.');
                const mx = numFromUnknown(r.max_pct);
                if (mx === null) need(i, 'maximum % is required.');
                else if (mx < 0 || mx > 100) need(i, 'maximum % must be between 0 and 100.');
              } else if (hasSector) {
                if (!String(r.sector_name ?? '').trim()) need(i, 'sector name is required.');
                const mx = numFromUnknown(r.max_pct);
                if (mx !== null && (mx < 0 || mx > 100)) need(i, 'maximum % must be between 0 and 100.');
              }
              break;
            }
            case 'geographic_allocations': {
              const hasGeo =
                String(r.region_country ?? '').trim() ||
                (r.max_pct !== null && r.max_pct !== undefined && String(r.max_pct).trim() !== '');
              if (hasGeo) {
                if (!String(r.region_country ?? '').trim()) need(i, 'region / country is required.');
                const mx = numFromUnknown(r.max_pct);
                if (mx !== null && (mx < 0 || mx > 100)) need(i, 'maximum % must be between 0 and 100.');
              }
              break;
            }
            case 'investment_instruments': {
              const hasInst =
                String(r.instrument_name ?? '').trim() ||
                (r.fund_pct !== null && r.fund_pct !== undefined && String(r.fund_pct).trim() !== '') ||
                String(r.legal_notes ?? '').trim();
              if (req) {
                if (!String(r.instrument_name ?? '').trim()) need(i, 'instrument name is required.');
                const pct = numFromUnknown(r.fund_pct);
                if (pct === null) need(i, 'fund % is required.');
                else if (pct < 0 || pct > 100) need(i, 'fund % must be between 0 and 100.');
              } else if (hasInst) {
                if (!String(r.instrument_name ?? '').trim()) need(i, 'instrument name is required.');
                const pct = numFromUnknown(r.fund_pct);
                if (pct !== null && (pct < 0 || pct > 100)) need(i, 'fund % must be between 0 and 100.');
              }
              break;
            }
            case 'coinvestors': {
              const hasCo =
                String(r.company_name ?? '').trim() ||
                String(r.contact_name ?? '').trim() ||
                String(r.phone ?? '').trim() ||
                String(r.email ?? '').trim();
              if (hasCo && !String(r.company_name ?? '').trim()) need(i, 'company name is required.');
              break;
            }
            case 'secured_investors': {
              const hasRow =
                String(r.investor_name ?? '').trim() ||
                (r.amount_usd !== null && r.amount_usd !== undefined && String(r.amount_usd).trim() !== '') ||
                String(r.description ?? '').trim();
              if (hasRow && !String(r.investor_name ?? '').trim()) need(i, 'investor name is required.');
              break;
            }
            case 'potential_investors': {
              const hasRow =
                String(r.investor_name ?? '').trim() ||
                (r.expected_amount_usd !== null &&
                  r.expected_amount_usd !== undefined &&
                  String(r.expected_amount_usd).trim() !== '') ||
                String(r.timeline ?? '').trim();
              if (hasRow && !String(r.investor_name ?? '').trim()) need(i, 'investor name is required.');
              break;
            }
            default:
              break;
          }
        }
      }
      if (q.type === 'multi_select') {
        const rows = parseJsonArray<string>(params.answers[q.key]);
        if (q.required && rows.length < 1) {
          errors.push(`${q.label}: select at least one option.`);
        }
      }
      continue;
    }

    const raw = params.answers[q.key];
    if (q.required) {
      if (q.type === 'boolean') {
        if (raw !== true && raw !== false && raw !== 'true' && raw !== 'false') {
          errors.push(`${q.label} is required.`);
        }
      } else if (q.type === 'file') {
        const { data: doc } = await params.supabase
          .from('vc_dd_documents')
          .select('id')
          .eq('tenant_id', params.tenantId)
          .eq('questionnaire_id', params.questionnaireId)
          .eq('section_id', params.sectionId)
          .eq('tag', q.uploadTag ?? q.key)
          .maybeSingle();
        if (!doc) {
          errors.push(`${q.label}: file upload is required.`);
        }
      } else {
        const s = stringVal(raw).trim();
        if (!s) errors.push(`${q.label} is required.`);
        if (q.type === 'currency' || q.type === 'number') {
          const n = Number(String(raw).replace(/,/g, ''));
          if (q.required && (Number.isNaN(n) || n < 0)) {
            errors.push(`${q.label}: enter a valid number.`);
          }
          if (q.key === 'jamaica_min_allocation_pct' && q.required && !Number.isNaN(n) && n < 40) {
            errors.push(`${q.label}: DBJ requires at least 40% allocated to Jamaica.`);
          }
        }
      }
    }

    if (isPlainQuestion(q) && q.maxWords) {
      const s = stringVal(raw);
      const w = countWords(s);
      if (w > q.maxWords) {
        errors.push(`${q.label}: exceeds ${q.maxWords} words (currently ${w}).`);
      }
    }

    if (params.sectionKey === 'investment_strategy' && q.key === 'investment_thesis') {
      const s = stringVal(raw).trim();
      if (q.required && s.length < 100) {
        errors.push(`${q.label}: enter at least 100 characters (currently ${s.length}).`);
      }
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
      if (!Number.isFinite(amtN) || amtN < 0) {
        errors.push('When the manager will invest: enter a valid investment amount (USD).');
      }
      if (!Number.isFinite(pctN) || pctN < 0 || pctN > 100) {
        errors.push('When the manager will invest: enter a valid percentage of the fund (0–100).');
      }
      if (!method) {
        errors.push('When the manager will invest: describe how the investment will be made.');
      }
    }
    const ob = params.answers.other_business_activities_yes;
    if (ob === true || ob === 'true') {
      if (!stringVal(params.answers.other_activities).trim()) {
        errors.push('Describe other business activities.');
      }
    }
    const oc = params.answers.outside_contracts_yes;
    if (oc === true || oc === 'true') {
      if (!stringVal(params.answers.outside_contracts).trim()) {
        errors.push('Describe outside contracts and liabilities.');
      }
    }
    const hc = params.answers.has_conflicts_of_interest;
    if (hc === true || hc === 'true') {
      if (!stringVal(params.answers.conflicts_description).trim()) {
        errors.push('Describe the conflicts of interest.');
      }
      if (!stringVal(params.answers.conflicts_resolution).trim()) {
        errors.push('Describe resolution procedures for conflicts of interest.');
      }
    }
    const hr = params.answers.has_regulations;
    if (hr === true || hr === 'true') {
      if (!stringVal(params.answers.regulations_list).trim()) {
        errors.push('List all applicable regulations.');
      }
      const cs = stringVal(params.answers.compliance_status).trim();
      if (!['compliant', 'pending', 'non_compliant'].includes(cs)) {
        errors.push('Select a compliance status.');
      }
      if (cs === 'non_compliant' && !stringVal(params.answers.compliance_details).trim()) {
        errors.push('Provide compliance details when status is non-compliant.');
      }
    }
    const hl = params.answers.has_litigation;
    if (hl === true || hl === 'true') {
      const ls = stringVal(params.answers.litigation_status).trim();
      if (!['past', 'pending'].includes(ls)) {
        errors.push('Select litigation status (past or pending).');
      }
      if (!stringVal(params.answers.litigation_description).trim()) {
        errors.push('Describe the litigation or regulatory matter.');
      }
    }
  }

  if (params.sectionKey === 'investment_strategy') {
    const cr = stringVal(params.answers.coinvestment_reliance).trim();
    if (cr === 'required' || cr === 'opportunistic') {
      if (!stringVal(params.answers.coinvestment_steps).trim()) {
        errors.push('Describe co-investment steps when co-investment is required or opportunistic.');
      }
    }
    const fees = params.answers.charges_portfolio_fees;
    if (fees === true || fees === 'true') {
      if (!stringVal(params.answers.portfolio_fees_description).trim()) {
        errors.push('Describe portfolio-level fees when the fund charges them.');
      }
    }
  }

  if (params.sectionKey === 'investors_fundraising') {
    if (!stringVal(params.answers.first_closing_date).trim()) {
      errors.push('First closing date is required.');
    }
    if (!stringVal(params.answers.final_closing_date).trim()) {
      errors.push('Final closing date is required.');
    }
    const nclos = numFromUnknown(params.answers.number_of_closings);
    if (nclos === null || nclos < 1 || nclos > 10) {
      errors.push('Number of closings must be between 1 and 10.');
    }
    if (!stringVal(params.answers.late_entrant_terms).trim()) {
      errors.push('Late entrant terms are required.');
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
