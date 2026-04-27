/**
 * Replace-on-PUT for Section VII investor lists and Section VIII legal document register.
 * File path: lib/questionnaire/persist-investors-legal.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const LEGAL_STATUSES = new Set([
  'draft',
  'in_preparation',
  'final',
  'executed',
  'not_yet_drafted',
]);

function filterBlankSecuredInvestorRows(rows: unknown[]): unknown[] {
  return (Array.isArray(rows) ? rows : []).filter((raw) => {
    const r = raw as Record<string, unknown>;
    return String(r.investor_name ?? '').trim().length > 0;
  });
}

function filterBlankPotentialInvestorRows(rows: unknown[]): unknown[] {
  return (Array.isArray(rows) ? rows : []).filter((raw) => {
    const r = raw as Record<string, unknown>;
    return String(r.investor_name ?? '').trim().length > 0;
  });
}

function filterBlankLegalDocumentRegisterRows(rows: unknown[]): unknown[] {
  return (Array.isArray(rows) ? rows : []).filter((raw) => {
    const r = raw as Record<string, unknown>;
    const name = String(r.document_name ?? r.name ?? '').trim();
    return name.length > 0;
  });
}

export async function replaceSecuredInvestors(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  const list = filterBlankSecuredInvestorRows(rows);
  const { error: delErr } = await supabase
    .from('vc_dd_secured_investors')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (delErr) return { error: delErr.message };
  if (!list.length) return {};
  const inserts = list.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    return {
      tenant_id: tenantId,
      questionnaire_id: questionnaireId,
      sort_order: i,
      investor_name: str(r.investor_name).trim(),
      amount_usd: numOrNull(r.amount_usd),
      description: str(r.description).trim() || null,
    };
  });
  const { error } = await supabase.from('vc_dd_secured_investors').insert(inserts);
  if (error) return { error: error.message };
  return {};
}

export async function replacePotentialInvestors(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  const list = filterBlankPotentialInvestorRows(rows);
  const { error: delErr } = await supabase
    .from('vc_dd_potential_investors')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (delErr) return { error: delErr.message };
  if (!list.length) return {};
  const inserts = list.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    return {
      tenant_id: tenantId,
      questionnaire_id: questionnaireId,
      sort_order: i,
      investor_name: str(r.investor_name).trim(),
      expected_amount_usd: numOrNull(r.expected_amount_usd),
      timeline: str(r.timeline).trim() || null,
    };
  });
  const { error } = await supabase.from('vc_dd_potential_investors').insert(inserts);
  if (error) return { error: error.message };
  return {};
}

export type LegalRegisterRow = {
  id?: string;
  document_name: string;
  purpose?: string;
  status: string;
  document_id?: string | null;
};

export async function replaceLegalDocumentsRegister(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  const list = filterBlankLegalDocumentRegisterRows(rows);
  const { error: delErr } = await supabase
    .from('vc_dd_legal_documents')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (delErr) return { error: delErr.message };
  if (!list.length) return {};
  const inserts = list.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    const st = str(r.status).trim() || 'draft';
    const status = LEGAL_STATUSES.has(st) ? st : 'draft';
    const docId = typeof r.document_id === 'string' && r.document_id ? r.document_id : null;
    return {
      tenant_id: tenantId,
      questionnaire_id: questionnaireId,
      sort_order: i,
      document_name: str(r.document_name ?? r.name).trim(),
      purpose: str(r.purpose).trim() || null,
      status,
      document_id: docId,
    };
  });
  const { error } = await supabase.from('vc_dd_legal_documents').insert(inserts);
  if (error) return { error: error.message };
  return {};
}

export async function loadSecuredInvestorsForQuestionnaire(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('vc_dd_secured_investors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    investor_name: row.investor_name,
    amount_usd: row.amount_usd,
    description: row.description ?? '',
  }));
}

export async function loadPotentialInvestorsForQuestionnaire(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('vc_dd_potential_investors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    investor_name: row.investor_name,
    expected_amount_usd: row.expected_amount_usd,
    timeline: row.timeline ?? '',
  }));
}

export async function loadLegalDocumentsRegisterForQuestionnaire(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('vc_dd_legal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    document_name: row.document_name,
    purpose: row.purpose ?? '',
    status: row.status,
    document_id: row.document_id ?? null,
  }));
}
