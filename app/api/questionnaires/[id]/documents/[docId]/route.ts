import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, docId } = await ctx.params;
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

  const { data: doc } = await db
    .from('vc_dd_documents')
    .select('*')
    .eq('id', docId)
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  if (doc.section_id) {
    const { data: sec } = await db
      .from('vc_dd_sections')
      .select('status')
      .eq('id', doc.section_id)
      .single();
    if (sec?.status === 'completed') {
      return NextResponse.json({ error: 'Section locked' }, { status: 400 });
    }
  }

  const { error: rmErr } = await db.storage.from('dd-documents').remove([doc.file_path]);
  if (rmErr) {
    return NextResponse.json({ error: rmErr.message }, { status: 500 });
  }

  const { error: delErr } = await db.from('vc_dd_documents').delete().eq('id', docId).eq('tenant_id', profile.tenant_id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
