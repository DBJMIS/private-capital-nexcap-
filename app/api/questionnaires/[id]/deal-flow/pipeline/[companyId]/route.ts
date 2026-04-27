import { NextResponse } from 'next/server';

import { getStructuredListApiContext } from '@/lib/questionnaire/structured-list-api-context';
import { assertDealFlowPipelineWritable } from '@/lib/questionnaire/pipeline-api-guard';
import { deletePipelineCompany, updatePipelineCompany } from '@/lib/questionnaire/pipeline-companies-db';
import { pipelineDbRowToPipelineRow } from '@/lib/questionnaire/pipeline-companies-map';
import { partialPipelineRowFromPatchBody } from '@/lib/questionnaire/pipeline-api-body';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; companyId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: questionnaireId, companyId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  const locked = await assertDealFlowPipelineWritable(
    ctxRes.db,
    ctxRes.tenantId,
    questionnaireId,
    ctxRes.profile.role,
  );
  if (locked) return locked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = partialPipelineRowFromPatchBody(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!parsed.patch || Object.keys(parsed.patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const up = await updatePipelineCompany(ctxRes.db, ctxRes.tenantId, companyId, parsed.patch);
  if (up.error) {
    return NextResponse.json({ error: up.error }, { status: up.error.includes('not found') ? 404 : 400 });
  }
  if (!up.row) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({ row: pipelineDbRowToPipelineRow(up.row) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, companyId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  const locked = await assertDealFlowPipelineWritable(
    ctxRes.db,
    ctxRes.tenantId,
    questionnaireId,
    ctxRes.profile.role,
  );
  if (locked) return locked;

  const del = await deletePipelineCompany(ctxRes.db, ctxRes.tenantId, questionnaireId, companyId);
  if (del.error) return NextResponse.json({ error: del.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
