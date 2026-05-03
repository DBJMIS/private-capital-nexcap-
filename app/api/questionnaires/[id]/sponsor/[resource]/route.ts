import { NextResponse } from 'next/server';

import { logAndReturn } from '@/lib/api/errors';
import { getStructuredListApiContext } from '@/lib/questionnaire/structured-list-api-context';
import { structuredListKindFromResourceSlug, STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';
import { insertStructuredListRow, loadStructuredListRows } from '@/lib/questionnaire/structured-list-db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; resource: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: questionnaireId, resource } = await ctx.params;
  const kind = structuredListKindFromResourceSlug(resource);
  if (!kind || STRUCTURED_LIST_REGISTRY[kind].sectionKey !== 'sponsor') {
    return NextResponse.json({ error: 'Unknown resource' }, { status: 400 });
  }

  const ctxRes = await getStructuredListApiContext(questionnaireId);
  if (ctxRes instanceof NextResponse) return ctxRes;

  try {
    const rows = await loadStructuredListRows(ctxRes.db, ctxRes.tenantId, questionnaireId, kind);
    return NextResponse.json({ rows });
  } catch (e) {
    return logAndReturn(e, 'questionnaires/sponsor/load', 'INTERNAL_ERROR', 'Failed to load resource', 500);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: questionnaireId, resource } = await ctx.params;
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

  const ins = await insertStructuredListRow(ctxRes.db, ctxRes.tenantId, questionnaireId, kind, body);
  if (ins.error) return NextResponse.json({ error: ins.error }, { status: 400 });
  return NextResponse.json({ row: ins.data });
}
