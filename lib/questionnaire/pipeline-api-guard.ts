/**
 * Deal flow section lock check for pipeline company mutations.
 * File path: lib/questionnaire/pipeline-api-guard.ts
 */

import { NextResponse } from 'next/server';

import type { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';

type Db = ReturnType<typeof createQuestionnaireDbClient>;

export async function assertDealFlowPipelineWritable(
  db: Db,
  tenantId: string,
  questionnaireId: string,
  profileRole: string,
): Promise<NextResponse | null> {
  const { data: section, error } = await db
    .from('vc_dd_sections')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId)
    .eq('section_key', 'deal_flow')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!section) return NextResponse.json({ error: 'Deal flow section not found' }, { status: 404 });
  if (section.status === 'completed' && profileRole !== 'admin') {
    return NextResponse.json({ error: 'Section is locked. Ask an admin to unlock before editing.' }, { status: 400 });
  }
  return null;
}
