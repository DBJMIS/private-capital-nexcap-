/**
 * CRUD for vc_dd_pipeline_companies (Section III).
 * File path: lib/questionnaire/pipeline-companies-db.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { PipelineRow } from '@/lib/questionnaire/validate';
import {
  pipelineDbRowToPipelineRow,
  pipelineRowToDbInsert,
  pipelineRowToDbPatch,
  type PipelineCompanyDbRow,
} from '@/lib/questionnaire/pipeline-companies-map';

export async function loadPipelineCompanies(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<{ rows: PipelineRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('vc_dd_pipeline_companies')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []) as PipelineCompanyDbRow[];
  return { rows: rows.map(pipelineDbRowToPipelineRow) };
}

/** Full replace from section PUT / autosave (matches client list order). */
export async function replacePipelineCompaniesFromRows(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: PipelineRow[],
): Promise<{ error?: string }> {
  const { error: delErr } = await supabase
    .from('vc_dd_pipeline_companies')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);
  if (delErr) return { error: delErr.message };

  if (rows.length === 0) return {};

  const inserts = rows.map((r, i) => pipelineRowToDbInsert({ tenantId, questionnaireId, sortOrder: i, row: r }));
  const { error: insErr } = await supabase.from('vc_dd_pipeline_companies').insert(inserts);
  if (insErr) return { error: insErr.message };
  return {};
}

export async function insertPipelineCompany(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  row: PipelineRow,
): Promise<{ row?: PipelineCompanyDbRow; error?: string }> {
  const { data: maxRows } = await supabase
    .from('vc_dd_pipeline_companies')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (maxRows?.[0]?.sort_order ?? -1) + 1;
  const insert = pipelineRowToDbInsert({
    tenantId,
    questionnaireId,
    sortOrder: nextOrder,
    row,
  });

  const { data, error } = await supabase.from('vc_dd_pipeline_companies').insert(insert).select('*').single();
  if (error) return { error: error.message };
  return { row: data as PipelineCompanyDbRow };
}

export async function updatePipelineCompany(
  supabase: SupabaseClient,
  tenantId: string,
  companyId: string,
  patch: Partial<PipelineRow>,
): Promise<{ row?: PipelineCompanyDbRow; error?: string }> {
  const body = pipelineRowToDbPatch(patch);
  const { data, error } = await supabase
    .from('vc_dd_pipeline_companies')
    .update(body)
    .eq('tenant_id', tenantId)
    .eq('id', companyId)
    .select('*')
    .single();
  if (error) return { error: error.message };
  return { row: data as PipelineCompanyDbRow };
}

export async function deletePipelineCompany(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  companyId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('vc_dd_pipeline_companies')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .eq('id', companyId);
  if (error) return { error: error.message };
  return {};
}
