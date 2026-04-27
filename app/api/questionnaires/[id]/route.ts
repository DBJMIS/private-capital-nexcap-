import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { allSectionKeys } from '@/lib/questionnaire/questions-config';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createQuestionnaireDbClient(profile);
  const access = await assertQuestionnaireAccess(db, profile, user.id, id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const loaded = await loadQuestionnaireForTenant(db, profile.tenant_id, id);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: loaded.error ?? 'Not found' }, { status: 404 });
  }

  const ens = await ensureDdSections(db, profile.tenant_id, id);
  if (ens.error) return NextResponse.json({ error: ens.error }, { status: 500 });

  const { data: sectionsRaw } = await db
    .from('vc_dd_sections')
    .select('id, section_key, section_order, status, updated_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', id)
    .order('section_order', { ascending: true });

  const allowed = new Set<string>(allSectionKeys());
  const sections = (sectionsRaw ?? []).filter((s: { section_key: string }) => allowed.has(s.section_key));

  const completed = sections.filter((s: { status: string }) => s.status === 'completed').length ?? 0;

  return NextResponse.json({
    questionnaire: loaded.questionnaire,
    application: loaded.application,
    sections,
    actor_role: profile.role,
    progress: {
      completed_sections: completed,
      total_sections: allowed.size,
    },
    all_sections_complete: completed === allowed.size,
  });
}
