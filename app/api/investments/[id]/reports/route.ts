import { randomUUID } from 'crypto';

import { NextResponse } from 'next/server';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 26 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'document';
}

const REPORT_TYPES = new Set(['quarterly', 'annual', 'ad_hoc']);

export async function GET(_req: Request, ctx: Ctx) {
  const { id: investmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: inv } = await supabase
    .from('vc_investments')
    .select('id')
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_monitoring_reports')
    .select('*')
    .eq('investment_id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return jsonError(sanitizeDbError(error), 500);

  return NextResponse.json({ reports: rows ?? [] });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: investmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:investments')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }

  const reporting_period = String(form.get('reporting_period') ?? '').trim();
  const report_type = String(form.get('report_type') ?? '').trim();

  if (!reporting_period) {
    return NextResponse.json({ error: 'reporting_period required' }, { status: 400 });
  }
  if (!REPORT_TYPES.has(report_type)) {
    return NextResponse.json({ error: 'report_type must be quarterly, annual, or ad_hoc' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 400 });
  }

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: 'Only PDF or DOCX files are allowed' }, { status: 400 });
  }

  const { data: inv, error: invErr } = await supabase
    .from('vc_investments')
    .select('id, status')
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
  if (inv.status !== 'active') {
    return NextResponse.json({ error: 'Only active investments accept reports' }, { status: 400 });
  }

  const objectName = `${randomUUID()}_${sanitizeFilename(file.name)}`;
  const storagePath = `${profile.tenant_id}/${investmentId}/${objectName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from('portfolio-monitoring').upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: row, error: insErr } = await supabase
    .from('vc_monitoring_reports')
    .insert({
      tenant_id: profile.tenant_id,
      investment_id: investmentId,
      reporting_period,
      report_type,
      submitted_by: user.id,
      document_path: storagePath,
    })
    .select('*')
    .single();

  if (insErr || !row) {
    await supabase.storage.from('portfolio-monitoring').remove([storagePath]);
    return jsonError(sanitizeDbError(insErr), 500);
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investment',
    entityId: investmentId,
    action: 'monitoring_report_uploaded',
    afterState: { report_id: row.id, reporting_period },
    metadata: { report_table_id: row.id },
  });

  return NextResponse.json({ report: row });
}
