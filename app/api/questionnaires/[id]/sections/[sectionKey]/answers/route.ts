import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { getSectionConfig, allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { persistSectionAnswers, upsertStaffBiosPartial } from '@/lib/questionnaire/persist-answers';
import type { AnswerMap, StaffBioInput } from '@/lib/questionnaire/validate';
import { scheduleAuditLog } from '@/lib/audit/log';
import { filterPersistableAnswers } from '@/lib/questionnaire/section-persist-split';
import { replaceStructuredListRows, syncAllSponsorStructuredLists } from '@/lib/questionnaire/structured-list-db';
import { replacePipelineCompaniesFromRows } from '@/lib/questionnaire/pipeline-companies-db';
import {
  replaceCoinvestors,
  replaceGeographicAllocations,
  replaceInvestmentInstruments,
  replaceInvestmentRounds,
  replaceSectorAllocations,
} from '@/lib/questionnaire/persist-section5';
import {
  replaceLegalDocumentsRegister,
  replacePotentialInvestors,
  replaceSecuredInvestors,
} from '@/lib/questionnaire/persist-investors-legal';
import type { PipelineRow } from '@/lib/questionnaire/validate';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; sectionKey: string }> };

type PutBody = {
  answers?: AnswerMap;
  /** Sponsor: merge staff bios from personnel modal (no deletes). */
  staff_bios_upserts?: StaffBioInput[];
  /** Normalized DD rows (sponsor, basic_info, investors, deal_flow pipeline, investment_strategy lists, legal register). */
  structured_lists?: Record<string, unknown>;
};

export async function PUT(req: Request, ctx: Ctx) {
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

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const loaded = await loadQuestionnaireForTenant(db, profile.tenant_id, questionnaireId);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ens = await ensureDdSections(db, profile.tenant_id, questionnaireId);
  if (ens.error) return NextResponse.json({ error: ens.error }, { status: 500 });

  const { data: sectionRow } = await db
    .from('vc_dd_sections')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (!sectionRow) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

  let section = sectionRow;

  if (section.status === 'completed') {
    const { error: unlockErr } = await db
      .from('vc_dd_sections')
      .update({ status: 'in_progress' })
      .eq('id', section.id)
      .eq('tenant_id', profile.tenant_id);
    if (unlockErr) {
      console.error('[PUT answers] auto-unlock failed', sectionKey, unlockErr.message);
      return NextResponse.json({ error: unlockErr.message }, { status: 500 });
    }
    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'dd_questionnaire',
      entityId: questionnaireId,
      action: 'section_auto_unlocked',
      beforeState: { section_key: sectionKey, section_id: section.id, status: 'completed' },
      afterState: { section_key: sectionKey, section_id: section.id, status: 'in_progress' },
      metadata: { reason: 'edit_while_completed', source: 'answers_put' },
    });
    section = { ...section, status: 'in_progress' };
  }

  const config = getSectionConfig(sectionKey)!;
  let staffBioUpsertIds: string[] | undefined;

  const rawAnswers = body.answers ?? {};
  const allowed = new Set(config.questions.map((q) => q.key));
  const answers = filterPersistableAnswers(sectionKey, rawAnswers);
  const unknownKeys = Object.keys(answers).filter((k) => !allowed.has(k));
  if (unknownKeys.length > 0) {
    console.warn('[PUT answers] unknown answer keys', { sectionKey, unknownKeys });
    return NextResponse.json(
      {
        error: `Unknown answer key(s): ${unknownKeys.join(', ')}`,
        unknownKeys,
        sectionKey,
      },
      { status: 400 },
    );
  }
  const err = await persistSectionAnswers(
    db,
    profile.tenant_id,
    section.id,
    sectionKey,
    answers,
  );
  if (err.error) return NextResponse.json({ error: err.error }, { status: 500 });

  if (sectionKey === 'deal_flow') {
    const lists = (body.structured_lists ?? {}) as Record<string, unknown>;
    const flat = (body.answers ?? {}) as Record<string, unknown>;
    const merged = { ...flat, ...lists };
    if ('pipeline_companies' in merged) {
      const rawPc = merged.pipeline_companies;
      const rows = Array.isArray(rawPc) ? (rawPc as PipelineRow[]) : [];
      const pErr = await replacePipelineCompaniesFromRows(db, profile.tenant_id, questionnaireId, rows);
      if (pErr.error) return NextResponse.json({ error: pErr.error }, { status: 500 });
    }
  }

  if (sectionKey === 'investment_strategy') {
    const lists = (body.structured_lists ?? {}) as Record<string, unknown>;
    const flat = (body.answers ?? {}) as Record<string, unknown>;
    const merged = { ...flat, ...lists };
    if ('investment_rounds' in merged) {
      const rows = Array.isArray(merged.investment_rounds) ? merged.investment_rounds : [];
      const e = await replaceInvestmentRounds(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
    if ('sector_allocations' in merged) {
      const rows = Array.isArray(merged.sector_allocations) ? merged.sector_allocations : [];
      const e = await replaceSectorAllocations(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
    if ('geographic_allocations' in merged) {
      const rows = Array.isArray(merged.geographic_allocations) ? merged.geographic_allocations : [];
      const e = await replaceGeographicAllocations(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
    if ('investment_instruments' in merged) {
      const rows = Array.isArray(merged.investment_instruments) ? merged.investment_instruments : [];
      const e = await replaceInvestmentInstruments(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
    if ('coinvestors' in merged) {
      const rows = Array.isArray(merged.coinvestors) ? merged.coinvestors : [];
      const e = await replaceCoinvestors(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
  }

  if (sectionKey === 'investors_fundraising') {
    const lists = (body.structured_lists ?? {}) as Record<string, unknown>;
    const flat = (body.answers ?? {}) as Record<string, unknown>;
    const merged = { ...flat, ...lists };
    if ('secured_investors' in merged) {
      const rows = Array.isArray(merged.secured_investors) ? merged.secured_investors : [];
      const e = await replaceSecuredInvestors(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
    if ('potential_investors' in merged) {
      const rows = Array.isArray(merged.potential_investors) ? merged.potential_investors : [];
      const e = await replacePotentialInvestors(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
  }

  if (sectionKey === 'legal') {
    const lists = (body.structured_lists ?? {}) as Record<string, unknown>;
    const flat = (body.answers ?? {}) as Record<string, unknown>;
    const merged = { ...flat, ...lists };
    if ('legal_documents_register' in merged) {
      const rows = Array.isArray(merged.legal_documents_register) ? merged.legal_documents_register : [];
      const e = await replaceLegalDocumentsRegister(db, profile.tenant_id, questionnaireId, rows);
      if (e.error) return NextResponse.json({ error: e.error }, { status: 500 });
    }
  }

  if (sectionKey === 'sponsor' && Array.isArray(body.staff_bios_upserts) && body.staff_bios_upserts.length > 0) {
    const uErr = await upsertStaffBiosPartial(
      db,
      profile.tenant_id,
      questionnaireId,
      body.staff_bios_upserts,
    );
    if (uErr.error) return NextResponse.json({ error: uErr.error }, { status: 500 });
    staffBioUpsertIds = uErr.ids;
  }

  const structuredPayload = body.structured_lists;
  if (structuredPayload && sectionKey === 'sponsor') {
    const sErr = await syncAllSponsorStructuredLists(
      db,
      profile.tenant_id,
      questionnaireId,
      structuredPayload,
    );
    if (sErr.error) return NextResponse.json({ error: sErr.error }, { status: 500 });
  } else if (structuredPayload && sectionKey === 'basic_info' && structuredPayload.contact_persons != null) {
    const cErr = await replaceStructuredListRows(
      db,
      profile.tenant_id,
      questionnaireId,
      'contact_persons',
      structuredPayload.contact_persons as unknown[],
    );
    if (cErr.error) return NextResponse.json({ error: cErr.error }, { status: 500 });
  }

  if (section.status === 'not_started') {
    await db
      .from('vc_dd_sections')
      .update({ status: 'in_progress' })
      .eq('id', section.id)
      .eq('tenant_id', profile.tenant_id);
  }

  if (loaded.questionnaire.status === 'draft') {
    await db
      .from('vc_dd_questionnaires')
      .update({ status: 'in_progress' })
      .eq('id', questionnaireId)
      .eq('tenant_id', profile.tenant_id);

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'dd_questionnaire',
      entityId: questionnaireId,
      action: 'started',
      beforeState: { status: 'draft' },
      afterState: { status: 'in_progress' },
      metadata: { section_key: sectionKey, source: 'first_answers_save' },
    });
  }

  return NextResponse.json({
    ok: true,
    ...(staffBioUpsertIds !== undefined ? { staff_bio_upsert_ids: staffBioUpsertIds } : {}),
  });
}
