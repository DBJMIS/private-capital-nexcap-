import { NextResponse } from 'next/server';

import { getStructuredListApiContext } from '@/lib/questionnaire/structured-list-api-context';
import { deleteStructuredListRow, updateStructuredListRow } from '@/lib/questionnaire/structured-list-db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; rowId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: questionnaireId, rowId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const up = await updateStructuredListRow(
    ctxRes.db,
    ctxRes.tenantId,
    questionnaireId,
    'contact_persons',
    rowId,
    body,
  );
  if (up.error) return NextResponse.json({ error: up.error }, { status: up.error === 'Row not found' ? 404 : 400 });
  return NextResponse.json({ row: up.data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, rowId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  const del = await deleteStructuredListRow(ctxRes.db, ctxRes.tenantId, questionnaireId, 'contact_persons', rowId);
  if (del.error) {
    return NextResponse.json({ error: del.error }, { status: del.error.includes('at least') ? 400 : 500 });
  }
  return NextResponse.json({ ok: true });
}
