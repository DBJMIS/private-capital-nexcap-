/**
 * Human-readable labels and value formatting for DD questionnaire evidence.
 * Used by EvidencePanel only (UI).
 */

export const EVIDENCE_LABEL_MAP: Record<string, string> = {
  fund_name: 'Fund Name',
  manager_name: 'Fund Manager',
  country_of_incorporation: 'Country',
  geographic_area: 'Investment Geography',
  geographic_area_activity: 'Investment Geography',
  total_capital_commitment_usd: 'Total Commitment',
  track_record_vc_pe: 'Track Record',
  track_record: 'Track Record',
  financial_strength_evidence: 'Financial Strength',
  financial_data: 'Financial Data',
  manager_will_invest: 'Manager Co-invests',
  manager_investment_amount: 'Manager Investment',
  manager_investment_pct: 'Manager Investment %',
  manager_investment_method: 'Investment Method',
  compensation_structure: 'Compensation',
  has_conflicts_of_interest: 'Conflicts of Interest',
  has_regulations: 'Regulatory Status',
  has_litigation: 'Legal Status',
  competitive_advantage: 'Competitive Advantage',
  sourcing_strategy: 'Deal Sourcing',
  networking: 'Network',
  esg_guidelines: 'ESG Policy',
  investment_thesis: 'Investment Thesis',
  monitoring_procedures: 'Monitoring',
  valuation_guidelines: 'Valuation',
  exit_identification: 'Exit Strategy',
  investment_committee: 'Investment Committee',
  key_persons: 'Key Persons',
  distributions: 'Distribution Policy',
};

const COUNTRY_CODE_MAP: Record<string, string> = {
  JM: 'Jamaica',
  BB: 'Barbados',
  TT: 'Trinidad & Tobago',
  GY: 'Guyana',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AL: 'Albania',
};

const SECTION_GROUP_TITLE: Record<string, string> = {
  basic_info: 'BASIC INFORMATION',
  sponsor: 'FUND MANAGER',
  deal_flow: 'DEAL FLOW',
  investment_strategy: 'STRATEGY',
  portfolio_monitoring: 'PORTFOLIO MONITORING',
  investors_fundraising: 'FUNDRAISING',
  governing_rules: 'GOVERNING RULES',
  legal: 'LEGAL',
  structured: 'STRUCTURED DATA',
};

export function evidenceSectionGroup(label: string): string {
  if (label.startsWith('STRUCTURED')) return SECTION_GROUP_TITLE.structured;
  const dot = label.indexOf(' · ');
  const sec = dot === -1 ? label.trim() : label.slice(0, dot).trim();
  return SECTION_GROUP_TITLE[sec] ?? sec.replace(/_/g, ' ').toUpperCase();
}

export function shouldHideEvidenceKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k === 'id') return true;
  if (k.includes('tenant_id')) return true;
  if (k.includes('questionnaire_id')) return true;
  if (k === 'created_at' || k === 'updated_at') return true;
  if (k === 'sort_order') return true;
  if (k.endsWith('_id')) return true;
  return false;
}

export function humanizeFieldKey(key: string): string {
  if (EVIDENCE_LABEL_MAP[key]) return EVIDENCE_LABEL_MAP[key];
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function mapCountryCode(code: string): string {
  const u = code.trim().toUpperCase();
  return COUNTRY_CODE_MAP[u] ?? code;
}

export function formatCurrencyUsd(n: number): string {
  return `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatMaybeCurrency(key: string, n: number): string {
  const lk = key.toLowerCase();
  if (lk.includes('jmd') || lk.includes('jamaica') && lk.includes('amount')) {
    return `JMD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return formatCurrencyUsd(n);
}

export function formatPrimitiveField(key: string, val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  if (typeof val === 'number') {
    const lk = key.toLowerCase();
    if (lk.endsWith('_pct') || lk.endsWith('_percent') || lk === 'equity_pct' || lk.includes('allocation_pct')) {
      return `${val}%`;
    }
    if (
      lk.includes('total_capital') ||
      lk.includes('commitment') ||
      lk.includes('amount_usd') ||
      lk.includes('investment_amount') ||
      lk.includes('_usd') ||
      lk.includes('sales_usd')
    ) {
      return formatMaybeCurrency(key, val);
    }
    return String(val);
  }
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.length === 2 && t === t.toUpperCase() && /^[A-Z]{2}$/.test(t)) {
      return mapCountryCode(t);
    }
    return t;
  }
  return String(val);
}

export type ObjectCard = { title: string; lines: string[] };

function pickTitle(obj: Record<string, unknown>): string {
  const o = obj;
  const name =
    (o.company_name as string) ||
    (o.investor_name as string) ||
    (o.name as string) ||
    (o.full_name as string) ||
    (o.title as string) ||
    'Entry';
  return String(name);
}

function linesFromObject(obj: Record<string, unknown>, maxFields = 6): string[] {
  const lines: string[] = [];
  const keys = Object.keys(obj).filter((k) => !shouldHideEvidenceKey(k));
  let n = 0;
  for (const k of keys) {
    if (n >= maxFields) break;
    const v = obj[k];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'object') continue;
    const formatted = formatPrimitiveField(k, v);
    if (formatted === null || formatted === 'No') continue;
    if (typeof v === 'boolean' && v === false) continue;
    lines.push(`${humanizeFieldKey(k)}: ${formatted}`);
    n += 1;
  }
  return lines;
}

export function formatPipelineCard(obj: Record<string, unknown>): ObjectCard {
  const title = String(obj.company_name ?? 'Company');
  const lines: string[] = [];
  if (obj.sector) lines.push(`Sector: ${obj.sector}`);
  if (obj.investment_amount_usd != null && obj.investment_amount_usd !== '') {
    lines.push(`Planned investment: ${formatCurrencyUsd(Number(obj.investment_amount_usd))}`);
  }
  if (obj.equity_pct != null && obj.equity_pct !== '') {
    lines.push(`Equity: ${obj.equity_pct}%`);
  }
  if (obj.negotiation_status) {
    const st = String(obj.negotiation_status).replace(/_/g, ' ');
    lines.push(`Status: ${st.charAt(0).toUpperCase()}${st.slice(1)}`);
  }
  if (obj.investment_thesis) {
    const t = String(obj.investment_thesis);
    lines.push(t.length > 160 ? `${t.slice(0, 160)}…` : t);
  }
  return { title, lines };
}

export function formatProfessionalCard(obj: Record<string, unknown>): ObjectCard {
  const title = String(obj.full_name ?? obj.name ?? 'Professional');
  const lines: string[] = [];
  if (obj.title) lines.push(String(obj.title));
  if (obj.role) lines.push(String(obj.role));
  const ded = obj.dedication_pct ?? obj.time_commitment_pct ?? obj.pct_time_to_fund;
  if (ded != null && ded !== '') lines.push(`Dedication: ${ded}%`);
  lines.push(...linesFromObject(obj, 4));
  return { title, lines: lines.slice(0, 5) };
}

export function formatInvestorCard(obj: Record<string, unknown>): ObjectCard {
  const title = String(obj.investor_name ?? obj.name ?? obj.organization_name ?? 'Investor');
  return { title, lines: linesFromObject(obj, 5) };
}

export function formatCoinvestorCard(obj: Record<string, unknown>): ObjectCard {
  const title = String(obj.company_name ?? 'Co-investor');
  const lines: string[] = [];
  if (obj.contact_name) lines.push(String(obj.contact_name));
  if (obj.email) lines.push(String(obj.email));
  if (obj.phone) lines.push(String(obj.phone));
  return { title, lines };
}

export function formatGenericObjectCard(obj: Record<string, unknown>): ObjectCard {
  return { title: pickTitle(obj), lines: linesFromObject(obj, 5) };
}

export function parseJsonArrayOfObjects(raw: string): Record<string, unknown>[] | null {
  const t = raw.trim();
  if (!t.startsWith('[')) return null;
  try {
    const p = JSON.parse(t) as unknown;
    if (!Array.isArray(p) || p.length === 0) return null;
    if (typeof p[0] !== 'object' || p[0] === null) return null;
    return p as Record<string, unknown>[];
  } catch {
    return null;
  }
}

export function parseJsonArrayOfStrings(raw: string): string[] | null {
  const t = raw.trim();
  if (!t.startsWith('[')) return null;
  try {
    const p = JSON.parse(t) as unknown;
    if (!Array.isArray(p)) return null;
    if (p.every((x) => typeof x === 'string')) return p as string[];
    return null;
  } catch {
    return null;
  }
}

export type StructuredCardKind = 'pipeline' | 'professional' | 'investor' | 'coinvestor' | 'generic';

export function inferStructuredKind(label: string): StructuredCardKind {
  const l = label.toLowerCase();
  if (l.includes('pipeline')) return 'pipeline';
  if (l.includes('professional')) return 'professional';
  if (l.includes('coinvestor')) return 'coinvestor';
  if (l.includes('secured') || l.includes('potential')) return 'investor';
  if (l.includes('investor') && !l.includes('instrument')) return 'investor';
  return 'generic';
}

export function buildCardsFromLabel(label: string, raw: string, maxVisible = 3): ObjectCard[] {
  const rows = parseJsonArrayOfObjects(raw);
  if (!rows) return [];
  const kind = inferStructuredKind(label);
  const cards: ObjectCard[] = [];
  for (let i = 0; i < Math.min(rows.length, maxVisible); i++) {
    const o = rows[i];
    if (kind === 'pipeline') cards.push(formatPipelineCard(o));
    else if (kind === 'professional') cards.push(formatProfessionalCard(o));
    else if (kind === 'investor') cards.push(formatInvestorCard(o));
    else if (kind === 'coinvestor') cards.push(formatCoinvestorCard(o));
    else cards.push(formatGenericObjectCard(o));
  }
  return cards;
}

export function formatCountryCodeList(raw: string): string | null {
  const arr = parseJsonArrayOfStrings(raw);
  if (!arr) return null;
  return arr.map((c) => mapCountryCode(c)).join(', ');
}

export function parseEvidenceRowLabel(label: string): { sectionKey: string; questionKey: string; isStructured: boolean } {
  if (label.startsWith('STRUCTURED')) {
    return { sectionKey: 'structured', questionKey: label.replace(/^STRUCTURED ·\s*/i, '').trim(), isStructured: true };
  }
  const dot = label.indexOf(' · ');
  if (dot === -1) return { sectionKey: label, questionKey: label, isStructured: false };
  return {
    sectionKey: label.slice(0, dot).trim(),
    questionKey: label.slice(dot + 3).trim(),
    isStructured: false,
  };
}
