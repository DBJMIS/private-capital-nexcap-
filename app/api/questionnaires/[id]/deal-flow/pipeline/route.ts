import { NextResponse } from 'next/server';

import { getStructuredListApiContext } from '@/lib/questionnaire/structured-list-api-context';
import { assertDealFlowPipelineWritable } from '@/lib/questionnaire/pipeline-api-guard';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';
import { insertPipelineCompany, loadPipelineCompanies } from '@/lib/questionnaire/pipeline-companies-db';
import { pipelineDbRowToPipelineRow } from '@/lib/questionnaire/pipeline-companies-map';
import { pipelineRowFromPostBody } from '@/lib/questionnaire/pipeline-api-body';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  const { rows, error } = await loadPipelineCompanies(ctxRes.db, ctxRes.tenantId, questionnaireId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  const locked = await assertDealFlowPipelineWritable(
    ctxRes.db,
    ctxRes.tenantId,
    questionnaireId,
    ctxRes.profile.role,
  );
  if (locked) return locked;

  const ens = await ensureDdSections(ctxRes.db, ctxRes.tenantId, questionnaireId);
  if (ens.error) return NextResponse.json({ error: ens.error }, { status: 500 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = pipelineRowFromPostBody(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ins = await insertPipelineCompany(ctxRes.db, ctxRes.tenantId, questionnaireId, parsed.row!);
  if (ins.error) return NextResponse.json({ error: ins.error }, { status: 400 });
  if (!ins.row) return NextResponse.json({ error: 'Insert failed' }, { status: 500 });

  return NextResponse.json({ row: pipelineDbRowToPipelineRow(ins.row) });
}
