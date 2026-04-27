/**
 * Shared server logic for uploading a reporting obligation document to `portfolio-reports`.
 * Used by POST /api/portfolio/obligations/[id]/upload and POST /api/portfolio/funds/[id]/documents.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logComplianceAction } from '@/lib/portfolio/compliance-action-log';
import { FINANCIAL_SNAPSHOT_REPORT_TYPES } from '@/lib/portfolio/snapshot-extraction';
import { portfolioReportObjectPath } from '@/lib/portfolio/storage-path';
import type { Profile } from '@/types/auth';

/** Matches `createServerClient()` (no Database generic) so `.update()` accepts row patches. */
type AppSupabase = SupabaseClient;

const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'] as const;

function extForStoredFile(file: File): '.pdf' | '.docx' {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.docx')) return '.docx';
  if (fileName.endsWith('.pdf')) return '.pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  return '.pdf';
}

function contentTypeForStorage(file: File): string {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/pdf';
}

export type UploadReportingObligationDocumentSuccess = {
  ok: true;
  document_path: string;
  document_name: string;
  obligation: unknown;
  suggest_extraction: boolean;
};

export type UploadReportingObligationDocumentFailure = {
  ok: false;
  status: number;
  error: string;
};

export type UploadReportingObligationDocumentResult =
  | UploadReportingObligationDocumentSuccess
  | UploadReportingObligationDocumentFailure;

/**
 * @param expectedFundId — When set, obligation must belong to this fund (fund-scoped upload route).
 */
export async function uploadReportingObligationDocument(
  supabase: AppSupabase,
  profile: Profile,
  obligationId: string,
  file: File,
  submittedDateOpt: FormDataEntryValue | null,
  expectedFundId?: string,
): Promise<UploadReportingObligationDocumentResult> {
  const fileNameLower = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => fileNameLower.endsWith(ext));
  if (!ALLOWED_MIME_TYPES.has(file.type) && !hasAllowedExt) {
    return { ok: false, status: 400, error: 'Only PDF and Word documents (.docx) are supported' };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, status: 400, error: 'File must be 20MB or smaller' };
  }

  const { data: ob, error: oErr } = await supabase
    .from('vc_reporting_obligations')
    .select('id, fund_id, period_label, report_type, tenant_id, status, submitted_date, snapshot_extracted')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', obligationId)
    .maybeSingle();

  if (oErr || !ob) {
    return { ok: false, status: 404, error: 'Obligation not found' };
  }

  const row = ob as {
    fund_id: string;
    period_label: string;
    report_type: string;
    status: string;
    submitted_date: string | null;
    snapshot_extracted: boolean | null;
  };

  if (expectedFundId !== undefined && row.fund_id !== expectedFundId) {
    return { ok: false, status: 404, error: 'Obligation not found for this fund' };
  }

  const ext = extForStoredFile(file);
  const buf = Buffer.from(await file.arrayBuffer());
  const objectPath = portfolioReportObjectPath(profile.tenant_id, row.fund_id, row.period_label, row.report_type, ext);

  const { error: upErr } = await supabase.storage.from('portfolio-reports').upload(objectPath, buf, {
    contentType: contentTypeForStorage(file),
    upsert: true,
  });

  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  const submittedDate =
    typeof submittedDateOpt === 'string' && submittedDateOpt.trim()
      ? submittedDateOpt.trim()
      : new Date().toISOString().split('T')[0]!;

  const patch: Record<string, unknown> = {
    document_path: objectPath,
    document_name: file.name,
    document_size_bytes: file.size,
  };

  const terminal = ['submitted', 'under_review', 'accepted'].includes(row.status);
  if (!terminal) {
    patch.status = 'submitted';
    patch.submitted_date = submittedDate;
  }

  const { data: updated, error: uErr } = await supabase
    .from('vc_reporting_obligations')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', obligationId)
    .select('*')
    .single();

  if (uErr || !updated) {
    return { ok: false, status: 500, error: uErr?.message ?? 'Failed to update obligation' };
  }

  const actorName = profile.full_name?.trim() || profile.name?.trim() || profile.email || 'User';
  await logComplianceAction(supabase, {
    tenantId: profile.tenant_id,
    obligationId,
    fundId: row.fund_id,
    actionType: 'document_uploaded',
    actorId: profile.profile_id,
    actorName,
    fromStatus: row.status,
    toStatus: (updated as { status: string }).status,
    notes: file.name,
    recipient: null,
  });

  const financialType = FINANCIAL_SNAPSHOT_REPORT_TYPES.includes(
    row.report_type as (typeof FINANCIAL_SNAPSHOT_REPORT_TYPES)[number],
  );
  const isPdf = fileNameLower.endsWith('.pdf') || file.type === 'application/pdf';
  const isDocx =
    fileNameLower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const { data: existingNarrative } = await supabase
    .from('vc_fund_narrative_extracts')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', row.fund_id)
    .eq('source_obligation_id', obligationId)
    .maybeSingle();
  const suggest_extraction =
    financialType && (isPdf || isDocx) && (!(row.snapshot_extracted ?? false) || !existingNarrative);

  return {
    ok: true,
    document_path: objectPath,
    document_name: file.name,
    obligation: updated,
    suggest_extraction,
  };
}
