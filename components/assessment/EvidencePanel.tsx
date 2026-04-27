'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { evidenceForCriteria } from '@/lib/assessment/dd-ai-assess-prompt';
import type { QuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';
import type { CriteriaKey } from '@/lib/scoring/config';
import { ASSESSMENT_CRITERIA } from '@/lib/scoring/config';
import { cn } from '@/lib/utils';

// —— Section 2A — keys / values to skip ——
const SKIP_KEYS = new Set([
  'id',
  'tenant_id',
  'questionnaire_id',
  'created_at',
  'updated_at',
  'sort_order',
  'application_id',
  'section_id',
]);

function shouldSkipKey(key: string): boolean {
  return SKIP_KEYS.has(key) || key.endsWith('_id') || key.startsWith('_');
}

function shouldSkipValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

// —— Section 2B — label map ——
const LABEL_MAP: Record<string, string> = {
  fund_name: 'Fund Name',
  manager_name: 'Fund Manager',
  country_of_incorporation: 'Country',
  geographic_area_activity: 'Investment Geography',
  geographic_area: 'Investment Geography',
  total_capital_commitment_usd: 'Total Commitment',
  track_record_vc_pe: 'Track Record',
  financial_strength_evidence: 'Financial Strength',
  manager_will_invest: 'Manager Co-invests',
  manager_investment_amount: 'Manager Investment',
  manager_investment_pct: 'Manager Investment %',
  manager_investment_method: 'Investment Method',
  compensation_structure: 'Compensation Structure',
  has_conflicts_of_interest: 'Conflicts of Interest',
  has_regulations: 'Regulatory Status',
  has_litigation: 'Legal Status',
  competitive_advantage: 'Competitive Advantage',
  sourcing_strategy: 'Deal Sourcing Strategy',
  networking: 'Network & Relationships',
  esg_guidelines: 'ESG Policy',
  investment_thesis: 'Investment Thesis',
  monitoring_procedures: 'Monitoring Procedures',
  valuation_guidelines: 'Valuation Approach',
  exit_identification: 'Exit Strategy',
  investment_committee: 'Investment Committee',
  key_persons: 'Key Persons',
  distributions: 'Distribution Policy',
  management_fee: 'Management Fee',
  contact_persons: 'Contact Persons',
  fund_life_years: 'Fund Life',
  investment_period_years: 'Investment Period',
  gross_irr_target_pct: 'Target Gross IRR',
  net_irr_target_pct: 'Target Net IRR',
  jamaica_min_allocation_pct: 'Jamaica Min. Allocation',
  legal_structure: 'Legal Structure',
  other_committees: 'Other Committees',
  conflicts_description: 'Conflict Details',
  conflicts_resolution: 'Conflict Resolution',
  compliance_status: 'Compliance Status',
  regulations_list: 'Applicable Regulations',
};

function getLabel(key: string): string {
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// —— Section 2C — country codes ——
const COUNTRY_CODES: Record<string, string> = {
  JM: 'Jamaica',
  BB: 'Barbados',
  TT: 'Trinidad & Tobago',
  GY: 'Guyana',
  BS: 'Bahamas',
  LC: 'St. Lucia',
  VC: 'St. Vincent',
  GD: 'Grenada',
  AG: 'Antigua',
  DM: 'Dominica',
  KN: 'St. Kitts',
  BZ: 'Belize',
  HT: 'Haiti',
  DO: 'Dominican Republic',
  CU: 'Cuba',
  PR: 'Puerto Rico',
  TC: 'Turks & Caicos',
  KY: 'Cayman Islands',
  VG: 'British Virgin Islands',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  MX: 'Mexico',
  BR: 'Brazil',
  CO: 'Colombia',
  PA: 'Panama',
  CR: 'Costa Rica',
  AL: 'Albania',
};

function resolveCountryCode(code: string): string {
  return COUNTRY_CODES[code.toUpperCase()] ?? code;
}

// —— Section 2D — format value ——
type FormattedEvidence =
  | { type: 'boolean'; formatted: boolean }
  | { type: 'currency'; formatted: { currency: string; amount: number; display: string } }
  | { type: 'percentage'; formatted: string }
  | { type: 'text'; formatted: unknown }
  | { type: 'geography_chips'; formatted: string[] }
  | { type: 'contact_persons'; formatted: Array<{ name?: string; email?: string; phone?: string }> }
  | { type: 'coinvestors'; formatted: Array<Record<string, unknown>> }
  | { type: 'pipeline'; formatted: Array<Record<string, unknown>> }
  | { type: 'people'; formatted: Array<Record<string, unknown>> }
  | { type: 'long_text'; formatted: string }
  | { type: 'object_list'; formatted: Array<Record<string, unknown>> };

function formatValue(key: string, value: unknown): FormattedEvidence {
  const keyNorm = key.toLowerCase();

  if (typeof value === 'boolean') {
    return { type: 'boolean', formatted: value };
  }

  if (value === 'Yes' || value === 'No' || value === 'true' || value === 'false') {
    return {
      type: 'boolean',
      formatted: value === 'Yes' || value === 'true',
    };
  }

  if (typeof value === 'number') {
    if (
      keyNorm.includes('amount') ||
      keyNorm.includes('commitment') ||
      keyNorm.includes('capital') ||
      keyNorm.includes('usd') ||
      keyNorm.includes('jmd')
    ) {
      const currency = keyNorm.includes('jmd') ? 'JMD' : 'USD';
      return {
        type: 'currency',
        formatted: {
          currency,
          amount: value,
          display: `${currency} ${value.toLocaleString()}`,
        },
      };
    }
    if (
      keyNorm.endsWith('_pct') ||
      keyNorm.endsWith('_percent') ||
      keyNorm.includes('_pct_') ||
      key === 'dbj_pro_rata'
    ) {
      return { type: 'percentage', formatted: `${value}%` };
    }
    if (keyNorm.includes('_years')) {
      return { type: 'text', formatted: `${value} years` };
    }
    return { type: 'text', formatted: value };
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return { type: 'text', formatted: JSON.stringify(value) };
  }

  if (typeof value === 'string') {
    const tr = value.trim();
    if (tr && /^-?\d+(\.\d+)?$/.test(tr)) {
      return formatValue(key, Number(tr));
    }
    if (tr.length === 2 && keyNorm.includes('country')) {
      return { type: 'text', formatted: resolveCountryCode(tr) };
    }
    try {
      const parsed: unknown = JSON.parse(value);
      return formatValue(key, parsed);
    } catch {
      // not JSON
    }
    if (value.length > 250) {
      return { type: 'long_text', formatted: value };
    }
    return { type: 'text', formatted: value };
  }

  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string' && String(v).length <= 3) &&
    keyNorm.includes('geograph')
  ) {
    return {
      type: 'geography_chips',
      formatted: value.map((v) => resolveCountryCode(String(v))),
    };
  }

  if (Array.isArray(value) && keyNorm === 'contact_persons') {
    return {
      type: 'contact_persons',
      formatted: value.filter((p): p is { name?: string; email?: string; phone?: string } => {
        if (!p || typeof p !== 'object') return false;
        const o = p as Record<string, unknown>;
        return Boolean(o.name || o.email || o.phone);
      }) as Array<{ name?: string; email?: string; phone?: string }>,
    };
  }

  if (
    Array.isArray(value) &&
    (keyNorm.includes('coinvestor') || keyNorm.includes('co_investor') || keyNorm === 'network')
  ) {
    return { type: 'coinvestors', formatted: value as Array<Record<string, unknown>> };
  }

  if (Array.isArray(value) && keyNorm.includes('pipeline')) {
    return { type: 'pipeline', formatted: value as Array<Record<string, unknown>> };
  }

  if (
    Array.isArray(value) &&
    (keyNorm.includes('professional') || keyNorm.includes('staff') || keyNorm.includes('advisor'))
  ) {
    return { type: 'people', formatted: value as Array<Record<string, unknown>> };
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    const cleaned = (value as Array<Record<string, unknown>>).map((item) => {
      const clean: Record<string, unknown> = {};
      Object.entries(item).forEach(([k, v]) => {
        if (!shouldSkipKey(k) && !shouldSkipValue(v)) {
          clean[k] = v;
        }
      });
      return clean;
    });
    return { type: 'object_list', formatted: cleaned };
  }

  return { type: 'text', formatted: value };
}

// —— Section 2E — section grouping ——
const SECTION_LABELS: Record<string, string> = {
  basic_info: 'Basic Information',
  sponsor: 'Fund Manager',
  deal_flow: 'Deal Flow & Pipeline',
  portfolio_monitoring: 'Portfolio Monitoring',
  investment_strategy: 'Investment Strategy',
  governing_rules: 'Governing Rules',
  investors_fundraising: 'Investors & Fundraising',
  legal: 'Legal',
  additional: 'Additional Information',
  STRUCTURED: 'Structured Data',
};

function groupAnswersBySection(answers: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const groups: Record<string, Record<string, unknown>> = {};
  Object.entries(answers).forEach(([rawKey, val]) => {
    const parts = rawKey.split(' · ');
    const section = parts[0]?.trim() ?? 'other';
    const fieldKey = parts[1]?.trim() ?? rawKey;
    if (!groups[section]) groups[section] = {};
    groups[section][fieldKey] = val;
  });
  return groups;
}

function parseRowValue(raw: string): unknown {
  const t = raw.trim();
  if (!t) return '';
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function rowsToGroupedWithOrder(rows: Array<{ label: string; value: string }>): {
  sectionOrder: string[];
  grouped: Record<string, Record<string, unknown>>;
} {
  const answers: Record<string, unknown> = {};
  const sectionOrder: string[] = [];
  const seenSec = new Set<string>();
  for (const r of rows) {
    answers[r.label] = parseRowValue(r.value);
    const parts = r.label.split(' · ');
    const section = parts[0]?.trim() ?? 'other';
    if (!seenSec.has(section)) {
      seenSec.add(section);
      sectionOrder.push(section);
    }
  }
  return { sectionOrder, grouped: groupAnswersBySection(answers) };
}

// —— Section 3 — value renderers ——
function BooleanValue({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-teal-600">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      Yes
    </span>
  ) : (
    <span className="text-[13px] text-gray-400">No</span>
  );
}

function CurrencyValue({ currency, amount }: { currency: string; amount: number }) {
  return (
    <div>
      <span className="text-[20px] font-semibold tracking-tight text-[#0B1F45]">
        {currency} {amount.toLocaleString()}
      </span>
      <div className="mt-0.5 text-[11px] text-gray-400">Total committed capital</div>
    </div>
  );
}

function GeographyChips({ countries }: { countries: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {countries.map((country) => (
        <span
          key={country}
          className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
        >
          {country}
        </span>
      ))}
    </div>
  );
}

function ContactPersons({ persons }: { persons: Array<{ name?: string; email?: string; phone?: string }> }) {
  const valid = persons.filter((p) => p.name || p.email);
  if (valid.length === 0) {
    return <span className="text-[12px] italic text-gray-300">No contacts recorded</span>;
  }
  return (
    <div className="space-y-2">
      {valid.map((p, i) => {
        const initials = (p.name ?? '?')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        return (
          <div key={i} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-gray-800">{p.name || 'Unnamed'}</div>
              {p.email ? <div className="truncate text-[11px] text-gray-400">{p.email}</div> : null}
              {p.phone ? <div className="text-[11px] text-gray-400">{p.phone}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CoinvestorList({ items }: { items: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
          <div className="text-[13px] font-medium text-gray-800">{String(item.company_name ?? '')}</div>
          {item.contact_name ? <div className="mt-0.5 text-[11px] text-gray-500">{String(item.contact_name)}</div> : null}
          {item.email ? <div className="mt-0.5 text-[11px] text-gray-400">{String(item.email)}</div> : null}
          {item.phone ? <div className="text-[11px] text-gray-400">{String(item.phone)}</div> : null}
        </div>
      ))}
    </div>
  );
}

function PipelineList({ items }: { items: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-[13px] font-medium text-gray-800">{String(item.company_name ?? '')}</div>
            {item.sector ? (
              <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                {String(item.sector)}
              </span>
            ) : null}
          </div>
          {item.investment_amount_usd || item.equity_pct ? (
            <div className="mt-1 text-[11px] text-gray-500">
              {item.investment_amount_usd ? `USD ${Number(item.investment_amount_usd).toLocaleString()}` : ''}
              {item.equity_pct ? ` · ${item.equity_pct}% equity` : ''}
            </div>
          ) : null}
          {item.negotiation_status ? (
            <div className="mt-0.5 text-[11px] capitalize text-gray-400">{String(item.negotiation_status).replace(/_/g, ' ')}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 280);
  const needsTruncation = text.length > 280;
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-gray-700">{expanded ? text : needsTruncation ? `${preview}...` : text}</p>
      {needsTruncation ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[11px] text-blue-500 underline underline-offset-2 hover:text-blue-700"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  );
}

function ObjectList({ items }: { items: Array<Record<string, unknown>> }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 3);
  return (
    <div className="space-y-1.5">
      {visible.map((item, i) => {
        const primaryField =
          item.name ?? item.company_name ?? item.fund_name ?? item.title ?? Object.values(item)[0];
        const secondaryFields = Object.entries(item)
          .filter(([k]) => k !== 'name' && k !== 'company_name' && k !== 'fund_name' && k !== 'title')
          .slice(0, 2);
        return (
          <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
            <div className="text-[13px] font-medium text-gray-800">{String(primaryField ?? '—')}</div>
            {secondaryFields.map(([k, v]) => (
              <div key={k} className="mt-0.5 text-[11px] text-gray-500">
                {getLabel(k)}: {String(v)}
              </div>
            ))}
          </div>
        );
      })}
      {items.length > 3 && !showAll ? (
        <button type="button" onClick={() => setShowAll(true)} className="text-[11px] text-blue-500 underline hover:text-blue-700">
          +{items.length - 3} more
        </button>
      ) : null}
    </div>
  );
}

function renderFormattedValue(formatted: FormattedEvidence) {
  switch (formatted.type) {
    case 'boolean':
      return <BooleanValue value={formatted.formatted} />;
    case 'currency': {
      const c = formatted.formatted;
      return <CurrencyValue currency={c.currency} amount={c.amount} />;
    }
    case 'percentage':
      return <p className="text-[13px] font-medium text-gray-800">{formatted.formatted}</p>;
    case 'geography_chips':
      return <GeographyChips countries={formatted.formatted} />;
    case 'contact_persons':
      return <ContactPersons persons={formatted.formatted} />;
    case 'coinvestors':
      return <CoinvestorList items={formatted.formatted} />;
    case 'pipeline':
      return <PipelineList items={formatted.formatted} />;
    case 'people':
      return <ObjectList items={formatted.formatted} />;
    case 'long_text':
      return <LongText text={formatted.formatted} />;
    case 'object_list':
      return <ObjectList items={formatted.formatted} />;
    case 'text':
      return <p className="text-[13px] font-medium text-gray-700">{String(formatted.formatted ?? '—')}</p>;
    default: {
      const _exhaustive: never = formatted;
      return _exhaustive;
    }
  }
}

function EvidenceBody({
  questionnaireId,
  rows,
  sectionStickyTopClass = 'top-[52px]',
}: {
  questionnaireId: string | null;
  rows: Array<{ label: string; value: string }>;
  /** Offset for in-panel section headers (no outer header when embedded in drawer). */
  sectionStickyTopClass?: string;
}) {
  const { sectionOrder, grouped } = useMemo(() => rowsToGroupedWithOrder(rows), [rows]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-gray-500">
        No snippets for this criterion.{' '}
        {questionnaireId ? (
          <Link href={`/questionnaires/${questionnaireId}`} className="text-[#0F8A6E] underline">
            Open questionnaire
          </Link>
        ) : null}
      </p>
    );
  }

  return (
    <>
      {sectionOrder.map((section) => {
        const fields = grouped[section];
        if (!fields) return null;
        const sectionTitle = SECTION_LABELS[section] ?? section;
        return (
          <div key={section}>
            <div
              className={cn(
                'sticky z-[9] border-b border-gray-100 bg-gray-50 px-4 pb-1.5 pt-3',
                sectionStickyTopClass,
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">{sectionTitle}</span>
            </div>
            {Object.entries(fields).map(([fieldKey, value], idx) => {
              if (shouldSkipKey(fieldKey) || shouldSkipValue(value)) return null;
              const formatted = formatValue(fieldKey, value);
              return (
                <div key={`${section}-${fieldKey}-${idx}`} className="border-b border-gray-100 px-4 py-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400">{getLabel(fieldKey)}</div>
                  {renderFormattedValue(formatted)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export function EvidencePanel({
  criteriaKey,
  bundle,
  questionnaireId,
  hideHeader = false,
}: {
  criteriaKey: CriteriaKey;
  bundle: QuestionnaireBundle;
  questionnaireId: string | null;
  /** When true, omit the sticky in-panel title (e.g. drawer supplies its own header). */
  hideHeader?: boolean;
}) {
  const rows = useMemo(() => evidenceForCriteria(criteriaKey, bundle), [criteriaKey, bundle]);
  const criteriaTitle = ASSESSMENT_CRITERIA.find((c) => c.key === criteriaKey)?.title ?? criteriaKey;

  if (!bundle.id) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-white font-sans">
        {hideHeader ? null : (
          <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Questionnaire Evidence</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">Relevant answers for {criteriaTitle}</p>
          </div>
        )}
        <p className="px-4 py-3 text-sm text-gray-500">
          Questionnaire data not available.{' '}
          {questionnaireId ? (
            <Link href={`/questionnaires/${questionnaireId}`} className="text-[#0F8A6E] underline">
              Open questionnaire
            </Link>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-white font-sans">
      {hideHeader ? null : (
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Questionnaire Evidence</h3>
          <p className="mt-0.5 text-[11px] text-gray-400">Relevant answers for {criteriaTitle}</p>
        </div>
      )}
      <EvidenceBody
        questionnaireId={questionnaireId}
        rows={rows}
        sectionStickyTopClass={hideHeader ? 'top-0' : 'top-[52px]'}
      />
    </div>
  );
}
