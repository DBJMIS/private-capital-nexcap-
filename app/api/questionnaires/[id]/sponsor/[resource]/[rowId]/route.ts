import { NextResponse } from 'next/server';

import { getStructuredListApiContext } from '@/lib/questionnaire/structured-list-api-context';
import { structuredListKindFromResourceSlug, STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import { deleteStructuredListRow, updateStructuredListRow } from '@/lib/questionnaire/structured-list-db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; resource: string; rowId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: questionnaireId, resource, rowId } = await ctx.params;
  const kind = structuredListKindFromResourceSlug(resource);
  if (!kind || STRUCTURED_LIST_REGISTRY[kind].sectionKey !== 'sponsor') {
    return NextResponse.json({ error: 'Unknown resource' }, { status: 400 });
  }

  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const up = await updateStructuredListRow(ctxRes.db, ctxRes.tenantId, questionnaireId, kind, rowId, body);
  if (up.error) return NextResponse.json({ error: up.error }, { status: up.error === 'Row not found' ? 404 : 400 });
  return NextResponse.json({ row: up.data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, resource, rowId } = await ctx.params;
  const kind = structuredListKindFromResourceSlug(resource);
  if (!kind || STRUCTURED_LIST_REGISTRY[kind].sectionKey !== 'sponsor') {
    return NextResponse.json({ error: 'Unknown resource' }, { status: 400 });
  }

  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  const del = await deleteStructuredListRow(ctxRes.db, ctxRes.tenantId, questionnaireId, kind, rowId);
  if (del.error) {
    return NextResponse.json({ error: del.error }, { status: del.error.includes('at least') ? 400 : 500 });
  }
  return NextResponse.json({ ok: true });
}
