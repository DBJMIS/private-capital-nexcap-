import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; sectionKey: string }> };

type PatchBody = { status?: string };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: questionnaireId, sectionKey: rawKey } = await ctx.params;
  const sectionKey = rawKey as DdSectionKey;

  if (!allSectionKeys().includes(sectionKey)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const nextStatus = body.status;
  if (nextStatus !== 'in_progress' && nextStatus !== 'not_started') {
    return NextResponse.json(
      { error: 'Only in_progress or not_started are allowed (cannot set completed via this route).' },
      { status: 400 },
    );
  }

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

  const { data: section, error: secErr } = await db
    .from('vc_dd_sections')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (secErr || !section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const current = String(section.status ?? '');

  if (current === 'completed') {
    if (nextStatus !== 'in_progress' && nextStatus !== 'not_started') {
      return NextResponse.json({ error: 'Invalid target status from completed.' }, { status: 400 });
    }
  } else if (current === 'in_progress') {
    if (nextStatus !== 'not_started') {
      return NextResponse.json(
        { error: 'From in_progress only not_started is allowed (downgrade).' },
        { status: 400 },
      );
    }
  } else if (current === 'not_started') {
    return NextResponse.json(
      { error: 'Cannot PATCH section status from not_started (use saving answers to start).' },
      { status: 400 },
    );
  } else {
    return NextResponse.json({ error: 'Unexpected section status.' }, { status: 400 });
  }

  const { error } = await db
    .from('vc_dd_sections')
    .update({ status: nextStatus })
    .eq('id', section.id)
    .eq('tenant_id', profile.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: nextStatus });
}
