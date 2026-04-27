import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { getSectionConfig, allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { rowToAnswerValue } from '@/lib/questionnaire/serialize-answers';
import { validateSectionAnswers, type AnswerMap } from '@/lib/questionnaire/validate';
import { scheduleAuditLog } from '@/lib/audit/log';
import {
  mergeDealFlowPipelineIntoSectionAnswers,
  mergeInvestorsFundraisingStructuredIntoSectionAnswers,
  mergeInvestmentStrategyStructuredIntoSectionAnswers,
  mergeLegalDocumentsRegisterIntoSectionAnswers,
  mergeStructuredListsIntoSectionAnswers,
} from '@/lib/questionnaire/merge-section-structured-load';
import { coerceSponsorLegacyAnswers } from '@/lib/questionnaire/sponsor-legacy-answers';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; sectionKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, sectionKey: rawKey } = await ctx.params;
  const sectionKey = rawKey as DdSectionKey;

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

  const { data: section } = await db
    .from('vc_dd_sections')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

  if (section.status === 'completed') {
    const allowedSectionKeys = new Set(allSectionKeys());
    const { data: sectionsAfter } = await db
      .from('vc_dd_sections')
      .select('section_key, status')
      .eq('tenant_id', profile.tenant_id)
      .eq('questionnaire_id', questionnaireId);
    const countedSections = (sectionsAfter ?? []).filter((s: { section_key: string }) =>
      allowedSectionKeys.has(s.section_key as DdSectionKey),
    );
    const completedSectionCount = countedSections.filter(
      (s: { status: string }) => s.status === 'completed',
    ).length;
    const totalExpectedSections = allSectionKeys().length;
    let questionnaireStatus: string = String(loaded.questionnaire.status ?? 'draft');
    const { data: qFresh } = await db
      .from('vc_dd_questionnaires')
      .select('status')
      .eq('id', questionnaireId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();
    if (qFresh?.status) questionnaireStatus = String(qFresh.status);
    revalidatePath('/questionnaires');
    revalidatePath(`/questionnaires/${questionnaireId}`);
    revalidatePath(`/questionnaires/${questionnaireId}/complete`);
    return NextResponse.json({
      ok: true,
      status: 'completed',
      questionnaire_status: questionnaireStatus,
      all_sections_complete: completedSectionCount === totalExpectedSections,
    });
  }

  const config = getSectionConfig(sectionKey)!;

  const { data: answerRows } = await db
    .from('vc_dd_answers')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('section_id', section.id);

  let answers: AnswerMap = {};
  for (const q of config.questions) {
    const row = (answerRows ?? []).find((r: { question_key: string }) => r.question_key === q.key);
    if (row) answers[q.key] = rowToAnswerValue(q, row);
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
  // Same as GET: register rows from `vc_dd_legal_documents` for validateSectionAnswers / canMarkSectionComplete parity.
  if (sectionKey === 'legal') {
    answers = await mergeLegalDocumentsRegisterIntoSectionAnswers(
      db,
      profile.tenant_id,
      questionnaireId,
      answers,
    );
  }

  const v = await validateSectionAnswers({
    supabase: db,
    tenantId: profile.tenant_id,
    questionnaireId,
    sectionId: section.id,
    sectionKey,
    answers,
  });

  if (!v.ok) {
    return NextResponse.json({ error: 'Validation failed', details: v.errors }, { status: 400 });
  }

  const { error } = await db
    .from('vc_dd_sections')
    .update({ status: 'completed' })
    .eq('id', section.id)
    .eq('tenant_id', profile.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allowedSectionKeys = new Set(allSectionKeys());
  const { data: sectionsAfter } = await db
    .from('vc_dd_sections')
    .select('section_key, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId);

  const countedSections = (sectionsAfter ?? []).filter((s: { section_key: string }) =>
    allowedSectionKeys.has(s.section_key as DdSectionKey),
  );
  const completedSectionCount = countedSections.filter(
    (s: { status: string }) => s.status === 'completed',
  ).length;
  const totalExpectedSections = allSectionKeys().length;

  let questionnaireStatus: string = String(loaded.questionnaire.status ?? 'draft');

  if (completedSectionCount === totalExpectedSections) {
    const completedAt = new Date().toISOString();
    const { error: qnErr } = await db
      .from('vc_dd_questionnaires')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', questionnaireId)
      .eq('tenant_id', profile.tenant_id);
    if (qnErr) return NextResponse.json({ error: qnErr.message }, { status: 500 });
    questionnaireStatus = 'completed';

    const applicationId = loaded.questionnaire.application_id as string;
    const { error: appDdErr } = await db
      .from('vc_fund_applications')
      .update({ status: 'due_diligence' })
      .eq('id', applicationId)
      .eq('tenant_id', profile.tenant_id);
    if (appDdErr) return NextResponse.json({ error: appDdErr.message }, { status: 500 });
  } else {
    const { data: qFresh } = await db
      .from('vc_dd_questionnaires')
      .select('status')
      .eq('id', questionnaireId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();
    if (qFresh?.status) questionnaireStatus = String(qFresh.status);
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'dd_questionnaire',
    entityId: questionnaireId,
    action: 'section_completed',
    beforeState: { section_key: sectionKey, section_status: section.status },
    afterState: { section_key: sectionKey, section_status: 'completed' },
  });

  revalidatePath('/questionnaires');
  revalidatePath(`/questionnaires/${questionnaireId}`);
  revalidatePath(`/questionnaires/${questionnaireId}/complete`);

  return NextResponse.json({
    ok: true,
    status: 'completed',
    questionnaire_status: questionnaireStatus,
    all_sections_complete: completedSectionCount === totalExpectedSections,
  });
}
