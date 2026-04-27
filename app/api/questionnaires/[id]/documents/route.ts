import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { jsonError, sanitizeDbError } from '@/lib/http/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createQuestionnaireDbClient(profile);
  const access = await assertQuestionnaireAccess(db, profile, user.id, questionnaireId);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const loaded = await loadQuestionnaireForTenant(db, profile.tenant_id, questionnaireId);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: rows } = await db
    .from('vc_dd_documents')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .order('uploaded_at', { ascending: false });

  const withUrls = await Promise.all(
    (rows ?? []).map(async (row: { file_path: string }) => {
      const { data: signed } = await db.storage
        .from('dd-documents')
        .createSignedUrl(row.file_path, 3600);
      return { ...row, signed_url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ documents: withUrls });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createQuestionnaireDbClient(profile);
  const access = await assertQuestionnaireAccess(db, profile, user.id, questionnaireId);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const loaded = await loadQuestionnaireForTenant(db, profile.tenant_id, questionnaireId);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

  const sectionKeyRaw = String(form.get('section_key') ?? '');
  const tag = String(form.get('tag') ?? '');
  const questionKey = form.get('question_key') ? String(form.get('question_key')) : null;
  const staffBioId = form.get('staff_bio_id') ? String(form.get('staff_bio_id')) : null;

  if (!tag) return NextResponse.json({ error: 'tag required' }, { status: 400 });

  const sectionKey = sectionKeyRaw as DdSectionKey;
  if (!sectionKeyRaw || !allSectionKeys().includes(sectionKey)) {
    return NextResponse.json({ error: 'Valid section_key required' }, { status: 400 });
  }

  if (tag === 'staff_cv' && !staffBioId) {
    return NextResponse.json({ error: 'staff_bio_id required for staff_cv uploads' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 20MB limit' }, { status: 400 });
  }

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: 'File type not allowed (PDF, DOCX, XLSX, JPG, PNG)' }, { status: 400 });
  }

  const { data: section } = await db
    .from('vc_dd_sections')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

  const { data: secRow } = await db
    .from('vc_dd_sections')
    .select('status')
    .eq('id', section.id)
    .single();

  if (secRow?.status === 'completed') {
    return NextResponse.json({ error: 'Section locked' }, { status: 400 });
  }

  const objectName = `${randomUUID()}_${sanitizeFilename(file.name)}`;
  const storagePath = `${profile.tenant_id}/${questionnaireId}/${objectName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage.from('dd-documents').upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: doc, error: insErr } = await db
    .from('vc_dd_documents')
    .insert({
      tenant_id: profile.tenant_id,
      questionnaire_id: questionnaireId,
      section_id: section.id,
      file_name: file.name,
      file_path: storagePath,
      file_size_bytes: file.size,
      mime_type: mime,
      uploaded_by: user.id,
      tag,
      question_key: questionKey,
      staff_bio_id: staffBioId,
    })
    .select('*')
    .single();

  if (insErr || !doc) {
    await db.storage.from('dd-documents').remove([storagePath]);
    return jsonError(sanitizeDbError(insErr), 500);
  }

  return NextResponse.json({ document: doc });
}
