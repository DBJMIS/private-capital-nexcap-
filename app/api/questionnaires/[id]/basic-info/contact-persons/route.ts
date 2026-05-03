import { NextResponse } from 'next/server';

import { logAndReturn } from '@/lib/api/errors';
import { getStructuredListApiContext } from '@/lib/questionnaire/structured-list-api-context';
import { insertStructuredListRow, loadStructuredListRows } from '@/lib/questionnaire/structured-list-db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  try {
    const rows = await loadStructuredListRows(ctxRes.db, ctxRes.tenantId, questionnaireId, 'contact_persons');
    return NextResponse.json({ rows });
  } catch (e) {
    return logAndReturn(e, 'questionnaires/contact-persons/load', 'INTERNAL_ERROR', 'Failed to load contact persons', 500);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;
  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ins = await insertStructuredListRow(ctxRes.db, ctxRes.tenantId, questionnaireId, 'contact_persons', body);
  if (ins.error) return NextResponse.json({ error: ins.error }, { status: 400 });
  return NextResponse.json({ row: ins.data });
}
