import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { getSectionConfig, allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { rowToAnswerValue } from '@/lib/questionnaire/serialize-answers';
import {
  mergeDealFlowPipelineIntoSectionAnswers,
  mergeInvestorsFundraisingStructuredIntoSectionAnswers,
  mergeInvestmentStrategyStructuredIntoSectionAnswers,
  mergeLegalDocumentsRegisterIntoSectionAnswers,
  mergeStructuredListsIntoSectionAnswers,
} from '@/lib/questionnaire/merge-section-structured-load';
import { coerceSponsorLegacyAnswers } from '@/lib/questionnaire/sponsor-legacy-answers';
import { mapStaffBiosFromApi, type StaffBioApiRow } from '@/lib/questionnaire/staff-bio-form-map';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; sectionKey: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, sectionKey: rawKey } = await ctx.params;
  const sectionKey = rawKey as DdSectionKey;
  // Reads are never gated on section/questionnaire completion or lock — clients rely on this for read-only views.

  if (!allSectionKeys().includes(sectionKey)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
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

  const ens = await ensureDdSections(db, profile.tenant_id, questionnaireId);
  if (ens.error) return NextResponse.json({ error: ens.error }, { status: 500 });

  const { data: section, error: secErr } = await db
    .from('vc_dd_sections')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (secErr || !section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const config = getSectionConfig(sectionKey)!;

  const { data: answerRows } = await db
    .from('vc_dd_answers')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('section_id', section.id);

  let answers: Record<string, unknown> = {};
  for (const q of config.questions) {
    const row = (answerRows ?? []).find((r: { question_key: string }) => r.question_key === q.key);
    if (row) {
      answers[q.key] = rowToAnswerValue(q, row);
    }
  }

  if (sectionKey === 'sponsor' || sectionKey === 'basic_info') {
    answers = await mergeStructuredListsIntoSectionAnswers(
      db,
      profile.tenant_id,
      questionnaireId,
      sectionKey,
      answers,
    );
  }
  if (sectionKey === 'sponsor') {
    answers = coerceSponsorLegacyAnswers(answers);
  }
  if (sectionKey === 'deal_flow') {
    answers = await mergeDealFlowPipelineIntoSectionAnswers(db, profile.tenant_id, questionnaireId, answers);
  }
  if (sectionKey === 'investment_strategy') {
    answers = await mergeInvestmentStrategyStructuredIntoSectionAnswers(
      db,
      profile.tenant_id,
      questionnaireId,
      answers,
    );
  }
  if (sectionKey === 'investors_fundraising') {
    answers = await mergeInvestorsFundraisingStructuredIntoSectionAnswers(
      db,
      profile.tenant_id,
      questionnaireId,
      answers,
    );
  }
  // Legal register rows live in `vc_dd_legal_documents` (not vc_dd_answers JSON); merge overwrites any legacy answer_json.
  if (sectionKey === 'legal') {
    answers = await mergeLegalDocumentsRegisterIntoSectionAnswers(
      db,
      profile.tenant_id,
      questionnaireId,
      answers,
    );
  }

  const { data: docs } = await db
    .from('vc_dd_documents')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_id', section.id);

  let staff_bio_link_options: { id: string; full_name: string }[] = [];
  let staff_bios_snapshot = [] as ReturnType<typeof mapStaffBiosFromApi>;
  if (sectionKey === 'sponsor') {
    const { data: bioOpts } = await db
      .from('vc_dd_staff_bios')
      .select('id, full_name')
      .eq('tenant_id', profile.tenant_id)
      .eq('questionnaire_id', questionnaireId)
      .order('created_at', { ascending: true });
    staff_bio_link_options = (bioOpts ?? []) as { id: string; full_name: string }[];

    const { data: bioFull } = await db
      .from('vc_dd_staff_bios')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('questionnaire_id', questionnaireId)
      .order('created_at', { ascending: true });
    staff_bios_snapshot = mapStaffBiosFromApi((bioFull ?? []) as StaffBioApiRow[]);
  }

  return NextResponse.json({
    section,
    config,
    answers,
    documents: docs ?? [],
    staff_bio_link_options,
    staff_bios_snapshot,
  });
}
