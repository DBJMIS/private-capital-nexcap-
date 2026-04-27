import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; sectionKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, sectionKey: rawKey } = await ctx.params;
  const sectionKey = rawKey as DdSectionKey;

  if (!allSectionKeys().includes(sectionKey)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const loaded = await loadQuestionnaireForTenant(supabase, profile.tenant_id, questionnaireId);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('vc_dd_sections')
    .update({ status: 'in_progress' })
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', sectionKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: 'in_progress' });
}
