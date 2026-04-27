import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) {
    return NextResponse.json({ data: null, error: 'Application not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('vc_dd_questionnaires')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (existing) {
    const id = (existing as { id: string }).id;
    const sec = await ensureDdSections(supabase, profile.tenant_id, id);
    if (sec.error) {
      return NextResponse.json({ data: null, error: sec.error }, { status: 500 });
    }
    return NextResponse.json({ data: { id }, error: null });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('vc_dd_questionnaires')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: applicationId,
      status: 'draft',
      assigned_to: null,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ data: null, error: insErr?.message ?? 'Failed to create questionnaire' }, { status: 500 });
  }

  const questionnaireId = (inserted as { id: string }).id;
  const sec = await ensureDdSections(supabase, profile.tenant_id, questionnaireId);
  if (sec.error) {
    return NextResponse.json({ data: null, error: sec.error }, { status: 500 });
  }

  return NextResponse.json({ data: { id: questionnaireId }, error: null });
}
