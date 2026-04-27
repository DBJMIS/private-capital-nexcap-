/**
 * Load / sync structured DD list rows (Supabase).
 * File path: lib/questionnaire/structured-list-db.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { StructuredListKind } from '@/lib/questionnaire/structured-list-registry';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  const i = Math.round(n);
  return Number.isFinite(i) ? i : null;
}

export function mapDbRowToUi(kind: StructuredListKind, row: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case 'shareholders':
      return {
        id: row.id,
        full_name: str(row.full_name),
        occupation: str(row.occupation),
      };
    case 'investment_professionals': {
      const ps = str(row.position_status).trim();
      const position_status =
        ps === 'part_time' || ps === 'vacant' || ps === 'full_time' ? ps : 'full_time';
      return {
        id: row.id,
        full_name: str(row.full_name),
        title: str(row.title),
        time_dedication_pct: row.time_dedication_pct,
        position_status,
        hire_timeline: row.hire_timeline == null ? '' : str(row.hire_timeline),
        bio_id: row.bio_id ?? null,
      };
    }
    case 'support_staff':
      return {
        id: row.id,
        full_name: str(row.full_name),
        position: str(row.position),
        time_dedication_pct: row.time_dedication_pct,
        bio_id: row.bio_id ?? null,
        department: str(row.department ?? ''),
      };
    case 'outside_advisors':
      return {
        id: row.id,
        full_name: str(row.full_name),
        role: str(row.role),
        remuneration: str(row.remuneration),
        paid_by: str(row.paid_by),
      };
    case 'office_locations':
      return {
        id: row.id,
        address: str(row.address),
        activities: str(row.activities),
        staff_count: row.staff_count,
      };
    case 'outsourced_services':
      return {
        id: row.id,
        company_name: str(row.company_name),
        activities: str(row.activities),
        annual_cost_usd: row.annual_cost_usd,
        paid_by: str(row.paid_by),
      };
    case 'contact_persons':
      return {
        id: row.id,
        name: str(row.full_name),
        email: str(row.email),
        phone: str(row.phone),
      };
    case 'investment_rounds':
      return {
        id: row.id,
        round_name: str(row.round_name),
        min_usd: row.min_usd,
        max_usd: row.max_usd,
      };
    case 'sector_allocations':
      return {
        id: row.id,
        sector_name: str(row.sector_name),
        max_pct: row.max_pct,
      };
    case 'geographic_allocations':
      return {
        id: row.id,
        region_country: str(row.region_country),
        max_pct: row.max_pct,
      };
    case 'investment_instruments':
      return {
        id: row.id,
        instrument_name: str(row.instrument_name),
        fund_pct: row.fund_pct,
        legal_notes: row.legal_notes == null ? '' : str(row.legal_notes),
      };
    case 'coinvestors':
      return {
        id: row.id,
        company_name: str(row.company_name),
        contact_name: str(row.contact_name ?? ''),
        phone: str(row.phone ?? ''),
        email: str(row.email ?? ''),
      };
    case 'secured_investors':
      return {
        id: row.id,
        investor_name: str(row.investor_name),
        amount_usd: row.amount_usd,
        description: str(row.description ?? ''),
      };
    case 'potential_investors':
      return {
        id: row.id,
        investor_name: str(row.investor_name),
        expected_amount_usd: row.expected_amount_usd,
        timeline: str(row.timeline ?? ''),
      };
    default:
      return row;
  }
}

function mapUiToDbInsert(
  kind: StructuredListKind,
  tenantId: string,
  questionnaireId: string,
  sortOrder: number,
  r: Record<string, unknown>,
): Record<string, unknown> {
  const base = { tenant_id: tenantId, questionnaire_id: questionnaireId, sort_order: sortOrder };
  switch (kind) {
    case 'shareholders':
      return {
        ...base,
        full_name: str(r.full_name).trim() || '',
        occupation: str(r.occupation).trim() || null,
      };
    case 'investment_professionals': {
      const psRaw = str(r.position_status).trim();
      const position_status =
        psRaw === 'part_time' || psRaw === 'vacant' || psRaw === 'full_time' ? psRaw : 'full_time';
      const hireRaw = str(r.hire_timeline).trim();
      const hire_timeline =
        position_status === 'vacant' &&
        (hireRaw === 'immediate' || hireRaw === 'within_6_months' || hireRaw === 'within_1_year')
          ? hireRaw
          : null;
      return {
        ...base,
        full_name: str(r.full_name).trim() || '',
        title: str(r.title).trim() || null,
        position_status,
        time_dedication_pct: position_status === 'vacant' ? null : numOrNull(r.time_dedication_pct),
        hire_timeline,
        bio_id:
          position_status === 'vacant'
            ? null
            : typeof r.bio_id === 'string' && r.bio_id
              ? r.bio_id
              : null,
      };
    }
    case 'support_staff': {
      const dept = str(r.department).trim();
      const department =
        dept === 'legal' || dept === 'accounting' || dept === 'it' || dept === 'admin' || dept === 'other'
          ? dept
          : null;
      return {
        ...base,
        full_name: str(r.full_name).trim() || '',
        position: str(r.position).trim() || null,
        time_dedication_pct: numOrNull(r.time_dedication_pct),
        bio_id: typeof r.bio_id === 'string' && r.bio_id ? r.bio_id : null,
        department,
      };
    }
    case 'outside_advisors':
      return {
        ...base,
        full_name: str(r.full_name).trim() || '',
        role: str(r.role).trim() || null,
        remuneration: str(r.remuneration).trim() || null,
        paid_by: str(r.paid_by).trim() || null,
      };
    case 'office_locations':
      return {
        ...base,
        address: str(r.address).trim() || '',
        activities: str(r.activities).trim() || null,
        staff_count: intOrNull(r.staff_count),
      };
    case 'outsourced_services':
      return {
        ...base,
        company_name: str(r.company_name).trim() || '',
        activities: str(r.activities).trim() || null,
        annual_cost_usd: numOrNull(r.annual_cost_usd),
        paid_by: str(r.paid_by).trim() || null,
      };
    case 'contact_persons':
      return {
        ...base,
        full_name: str(r.name ?? r.full_name).trim() || '',
        email: str(r.email).trim() || null,
        phone: str(r.phone).trim() || null,
      };
    case 'investment_rounds':
      return {
        ...base,
        round_name: str(r.round_name).trim() || '',
        min_usd: numOrNull(r.min_usd),
        max_usd: numOrNull(r.max_usd),
      };
    case 'sector_allocations':
      return {
        ...base,
        sector_name: str(r.sector_name).trim() || '',
        max_pct: numOrNull(r.max_pct),
      };
    case 'geographic_allocations':
      return {
        ...base,
        region_country: str(r.region_country).trim() || '',
        max_pct: numOrNull(r.max_pct),
      };
    case 'investment_instruments':
      return {
        ...base,
        instrument_name: str(r.instrument_name).trim() || '',
        fund_pct: numOrNull(r.fund_pct),
        legal_notes: str(r.legal_notes).trim() || null,
      };
    case 'coinvestors':
      return {
        ...base,
        company_name: str(r.company_name).trim() || '',
        contact_name: str(r.contact_name).trim() || null,
        phone: str(r.phone).trim() || null,
        email: str(r.email).trim() || null,
      };
    case 'secured_investors':
      return {
        ...base,
        investor_name: str(r.investor_name).trim() || '',
        amount_usd: numOrNull(r.amount_usd),
        description: str(r.description).trim() || null,
      };
    case 'potential_investors':
      return {
        ...base,
        investor_name: str(r.investor_name).trim() || '',
        expected_amount_usd: numOrNull(r.expected_amount_usd),
        timeline: str(r.timeline).trim() || null,
      };
    default:
      return base;
  }
}

export async function loadStructuredListRows(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  kind: StructuredListKind,
): Promise<Record<string, unknown>[]> {
  const { table } = STRUCTURED_LIST_REGISTRY[kind];
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapDbRowToUi(kind, row as Record<string, unknown>));
}

export async function countStructuredListRows(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  kind: StructuredListKind,
): Promise<number> {
  const { table } = STRUCTURED_LIST_REGISTRY[kind];
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Drop rows with no meaningful data before replace-insert (aligns DB with server validation). */
export function filterBlankStructuredListRowsForReplace(kind: StructuredListKind, rows: unknown[]): unknown[] {
  const list = Array.isArray(rows) ? rows : [];
  const asRow = (raw: unknown): Record<string, unknown> =>
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  switch (kind) {
    case 'office_locations':
      return list.filter((raw) => {
        const row = asRow(raw);
        const addr = String(row.address ?? '').trim();
        const act = String(row.activities ?? '').trim();
        const sc = row.staff_count;
        const scText = sc === null || sc === undefined ? '' : String(sc).trim();
        return addr.length > 0 || act.length > 0 || scText.length > 0;
      });
    case 'outside_advisors':
      return list.filter((raw) => {
        const row = asRow(raw);
        return String(row.full_name ?? '').trim().length > 0 || String(row.role ?? '').trim().length > 0;
      });
    case 'shareholders':
      return list.filter((raw) => String(asRow(raw).full_name ?? '').trim().length > 0);
    case 'investment_professionals':
      return list.filter((raw) => {
        const row = asRow(raw);
        return (
          String(row.full_name ?? '').trim().length > 0 || String(row.title ?? '').trim().length > 0
        );
      });
    case 'support_staff':
      return list.filter((raw) => String(asRow(raw).full_name ?? '').trim().length > 0);
    case 'secured_investors':
      return list.filter((raw) => String(asRow(raw).investor_name ?? '').trim().length > 0);
    case 'potential_investors':
      return list.filter((raw) => String(asRow(raw).investor_name ?? '').trim().length > 0);
    default:
      return list;
  }
}

export async function replaceStructuredListRows(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  kind: StructuredListKind,
  rows: unknown[],
): Promise<{ error?: string }> {
  const { table, minRows } = STRUCTURED_LIST_REGISTRY[kind];
  const list = filterBlankStructuredListRowsForReplace(kind, Array.isArray(rows) ? rows : []);
  if (list.length < minRows) {
    return { error: `At least ${minRows} row(s) required for ${kind}.` };
  }

  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (delErr) return { error: delErr.message };

  if (!list.length) return {};

  const inserts = list.map((raw, i) => mapUiToDbInsert(kind, tenantId, questionnaireId, i, raw as Record<string, unknown>));
  const { error: insErr } = await supabase.from(table).insert(inserts);
  if (insErr) return { error: insErr.message };
  return {};
}

export async function insertStructuredListRow(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  kind: StructuredListKind,
  body: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; error?: string }> {
  const { table } = STRUCTURED_LIST_REGISTRY[kind];
  const { count, error: cErr } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (cErr) return { error: cErr.message };
  const sortOrder = count ?? 0;
  const row = mapUiToDbInsert(kind, tenantId, questionnaireId, sortOrder, body);
  const { data, error } = await supabase.from(table).insert(row).select('*').single();
  if (error) return { error: error.message };
  return { data: mapDbRowToUi(kind, data as Record<string, unknown>) };
}

export async function updateStructuredListRow(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  kind: StructuredListKind,
  rowId: string,
  patch: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; error?: string }> {
  const { table } = STRUCTURED_LIST_REGISTRY[kind];
  const prev = await supabase
    .from(table)
    .select('*')
    .eq('id', rowId)
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .maybeSingle();
  if (prev.error) return { error: prev.error.message };
  if (!prev.data) return { error: 'Row not found' };

  const uiPrev = mapDbRowToUi(kind, prev.data as Record<string, unknown>);
  const merged = { ...uiPrev, ...patch };
  const sortOrder = Number((prev.data as { sort_order?: number }).sort_order ?? 0);
  const full = mapUiToDbInsert(kind, tenantId, questionnaireId, sortOrder, merged);
  const { id: _i, tenant_id: _t, questionnaire_id: _q, sort_order: _s, created_at: _c, ...updates } = full;

  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', rowId)
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .select('*')
    .single();
  if (error) return { error: error.message };
  return { data: mapDbRowToUi(kind, data as Record<string, unknown>) };
}

export async function deleteStructuredListRow(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  kind: StructuredListKind,
  rowId: string,
): Promise<{ error?: string }> {
  const { table, minRows } = STRUCTURED_LIST_REGISTRY[kind];
  const n = await countStructuredListRows(supabase, tenantId, questionnaireId, kind);
  if (n <= minRows) {
    return { error: `Cannot delete: at least ${minRows} row(s) must remain.` };
  }
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', rowId)
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (error) return { error: error.message };
  return {};
}

export async function loadAllSponsorStructuredLists(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<Record<string, unknown[]>> {
  const kinds: StructuredListKind[] = [
    'shareholders',
    'investment_professionals',
    'support_staff',
    'outside_advisors',
    'office_locations',
    'outsourced_services',
  ];
  const out: Record<string, unknown[]> = {};
  for (const k of kinds) {
    out[STRUCTURED_LIST_REGISTRY[k].questionKey] = await loadStructuredListRows(supabase, tenantId, questionnaireId, k);
  }
  return out;
}

export async function syncAllSponsorStructuredLists(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  payload: Record<string, unknown>,
): Promise<{ error?: string }> {
  const keys: StructuredListKind[] = [
    'shareholders',
    'investment_professionals',
    'support_staff',
    'outside_advisors',
    'office_locations',
    'outsourced_services',
  ];
  for (const k of keys) {
    const qk = STRUCTURED_LIST_REGISTRY[k].questionKey;
    if (!(qk in payload)) continue;
    const raw = payload[qk];
    const list = Array.isArray(raw) ? raw : [];
    const err = await replaceStructuredListRows(supabase, tenantId, questionnaireId, k, list);
    if (err.error) return err;
  }
  return {};
}
