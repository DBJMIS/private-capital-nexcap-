import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { logAndReturn } from '@/lib/api/errors';
import { authOptions } from '@/lib/auth-options';
import { resolvePortalReportingContext } from '@/lib/portal/portal-reporting-access';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Portal cannot overwrite staff-reviewed submissions; accepted/waived are terminal. */
const BLOCKED_UPLOAD_STATUSES = new Set(['accepted', 'waived', 'submitted', 'under_review']);

type Ctx = { params: Promise<{ id: string }> };

function sanitizeFileName(raw: string): string {
  return raw.replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 140) || 'document';
}

function contentTypeForFile(fileNameLower: string, declaredType: string): string | null {
  if (ALLOWED_MIME_TYPES.has(declaredType)) return declaredType;
  if (fileNameLower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (fileNameLower.endsWith('.pdf')) {
    return 'application/pdf';
  }
  return null;
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Not signed in.' }, { status: 401 });
    }

    const { id: applicationId } = await ctx.params;
    const adminClient = createServiceRoleClient();
    const access = await resolvePortalReportingContext(adminClient, session, applicationId);
    if (!access.ok) return access.response;

    const { tenantId, userId: actorUserId, portalSubmitterLabel, portfolioFund } = access.ctx;
    if (!portfolioFund) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Portfolio fund not found for reporting.' }, { status: 404 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid form data.' }, { status: 400 });
    }

    const obligationIdRaw = formData.get('obligation_id');
    const obligationId = typeof obligationIdRaw === 'string' ? obligationIdRaw.trim() : '';
    const fileCandidate = formData.get('file');

    if (!obligationId) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Missing obligation_id.' }, { status: 400 });
    }
    if (!(fileCandidate instanceof File) || fileCandidate.size === 0 || typeof fileCandidate.name !== 'string') {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Missing file.' }, { status: 400 });
    }
    const fileObj = fileCandidate;

    const fileNameLower = fileObj.name.toLowerCase();
    if (!(fileNameLower.endsWith('.pdf') || fileNameLower.endsWith('.docx'))) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Only PDF and Word (.docx) documents are allowed.' },
        { status: 400 },
      );
    }

    if (fileObj.size > MAX_BYTES) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'File must be 20MB or smaller.' }, { status: 400 });
    }

    const declaredType = typeof fileObj.type === 'string' ? fileObj.type : '';
    const contentType = contentTypeForFile(fileNameLower, declaredType.trim());
    if (!contentType) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Only PDF or Word documents are supported.' }, { status: 400 });
    }

    const { data: ob, error: oErr } = await adminClient
      .from('vc_reporting_obligations')
      .select(
        'id, fund_id, tenant_id, period_label, report_type, status, submitted_date',
      )
      .eq('tenant_id', tenantId)
      .eq('fund_id', portfolioFund.id)
      .eq('id', obligationId)
      .maybeSingle();

    if (oErr || !ob) {
      return logAndReturn(oErr ?? new Error('obligation lookup'), 'portal/funds/reports/upload:obligation', 'NOT_FOUND', 'Obligation not found.', 404);
    }

    const row = ob as { status: string; report_type: string; period_label: string };
    if (BLOCKED_UPLOAD_STATUSES.has(row.status)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'This obligation cannot receive a new upload in its current state.' },
        { status: 400 },
      );
    }

    const ts = Date.now();
    const safeName = sanitizeFileName(fileObj.name);
    const objectPath = `${tenantId}/${portfolioFund.id}/${obligationId}/${ts}-${safeName}`;
    const buffer = Buffer.from(await fileObj.arrayBuffer());

    const { error: upErr } = await adminClient.storage.from('portfolio-reports').upload(objectPath, buffer, {
      contentType,
      upsert: false,
    });

    if (upErr) {
      return logAndReturn(upErr, 'portal/funds/reports/upload:storage', 'INTERNAL_ERROR', 'Could not upload file.', 502);
    }

    const submittedDate = new Date().toISOString().slice(0, 10)!;

    const { data: updated, error: uErr } = await adminClient
      .from('vc_reporting_obligations')
      .update({
        document_path: objectPath,
        document_name: fileObj.name,
        document_size_bytes: fileObj.size,
        submitted_date: submittedDate,
        submitted_by: portalSubmitterLabel,
        status: 'submitted',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', obligationId)
      .eq('fund_id', portfolioFund.id)
      .select('id')
      .single();

    if (uErr || !updated) {
      await adminClient.storage.from('portfolio-reports').remove([objectPath]).catch(() => undefined);
      return logAndReturn(uErr ?? new Error('update obligation'), 'portal/funds/reports/upload:patch', 'INTERNAL_ERROR', 'Could not save submission.', 500);
    }

    const metadata: Record<string, unknown> = {
      fund_name: portfolioFund.fund_name,
      report_type: row.report_type,
      period_label: row.period_label,
      submitted_via: 'portal',
      document_path: objectPath,
    };

    const { error: auditErr } = await adminClient.from('vc_audit_logs').insert({
      tenant_id: tenantId,
      entity_type: 'reporting_obligation',
      entity_id: obligationId,
      action: 'report_submitted_portal',
      actor_id: actorUserId,
      metadata: metadata as Json,
    });

    if (auditErr) {
      return logAndReturn(auditErr, 'portal/funds/reports/upload:audit', 'INTERNAL_ERROR', 'Report saved but audit log failed.', 500);
    }

    const { data: signed } = await adminClient.storage.from('portfolio-reports').createSignedUrl(objectPath, 3600);

    return NextResponse.json({ success: true as const, document_url: signed?.signedUrl ?? null });
  } catch (error) {
    return logAndReturn(error, 'portal/funds/reports/upload', 'INTERNAL_ERROR', 'Upload failed.', 500);
  }
}
