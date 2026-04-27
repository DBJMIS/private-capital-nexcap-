import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;
const BUCKET = 'application-documents';
const ALLOWED = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();

  const { data: visit } = await supabase
    .from('vc_site_visits')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (!visit) return NextResponse.json({ error: 'Site visit not found' }, { status: 404 });

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

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 20MB limit' }, { status: 400 });
  }

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: 'Only PDF or DOCX allowed' }, { status: 400 });
  }

  const objectName = `${randomUUID()}_${sanitizeFilename(file.name)}`;
  const storagePath = `${profile.tenant_id}/applications/${applicationId}/site-visit/${objectName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    file_path: storagePath,
    file_name: file.name,
    mime_type: mime,
    size_bytes: file.size,
  });
}
