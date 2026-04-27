import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 50 * 1024 * 1024;
const BUCKET = 'application-documents';

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

  const { data: contract } = await supabase
    .from('vc_contracts')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (!contract) return NextResponse.json({ error: 'Contract record not found' }, { status: 404 });

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
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 });
  }

  const mime = file.type || 'application/octet-stream';
  if (mime !== 'application/pdf') {
    return NextResponse.json({ error: 'Signed contract must be PDF' }, { status: 400 });
  }

  const objectName = `${randomUUID()}_${sanitizeFilename(file.name)}`;
  const storagePath = `${profile.tenant_id}/applications/${applicationId}/contract/${objectName}`;
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
