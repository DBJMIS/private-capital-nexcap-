/**
 * Section V (Investment strategy): normalized list replace + load.
 * Mirrors delete-all + insert pattern used for pipeline companies.
 * File path: lib/questionnaire/persist-section5.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { replaceStructuredListRows } from '@/lib/questionnaire/structured-list-db';

export async function replaceInvestmentRounds(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  return replaceStructuredListRows(supabase, tenantId, questionnaireId, 'investment_rounds', rows);
}

export async function replaceSectorAllocations(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  return replaceStructuredListRows(supabase, tenantId, questionnaireId, 'sector_allocations', rows);
}

export async function replaceGeographicAllocations(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  return replaceStructuredListRows(supabase, tenantId, questionnaireId, 'geographic_allocations', rows);
}

export async function replaceInvestmentInstruments(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  return replaceStructuredListRows(supabase, tenantId, questionnaireId, 'investment_instruments', rows);
}

export async function replaceCoinvestors(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  rows: unknown[],
): Promise<{ error?: string }> {
  return replaceStructuredListRows(supabase, tenantId, questionnaireId, 'coinvestors', rows);
}
