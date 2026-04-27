import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  S21_KEYS,
  S22_KEYS,
  emptyPrequalificationTemplate,
  isChecklistResponse,
  type PrequalificationRow,
} from '@/lib/prequalification/types';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

const EDITABLE_APP_STATUSES = new Set(['submitted', 'pre_screening']);

function parseBodyFields(raw: Record<string, unknown>): Partial<PrequalificationRow> {
  const patch: Partial<PrequalificationRow> = {};
  const assignResp = (key: keyof PrequalificationRow, v: unknown) => {
    if (v === undefined) return;
    if (isChecklistResponse(v)) (patch as Record<string, unknown>)[key as string] = v;
  };
  for (const k of S21_KEYS) assignResp(k, raw[k]);
  for (const k of S22_KEYS) assignResp(k, raw[k]);
  if (typeof raw.s21_comments === 'string' || raw.s21_comments === null) patch.s21_comments = raw.s21_comments as string | null;
  if (typeof raw.s22_comments === 'string' || raw.s22_comments === null) patch.s22_comments = raw.s22_comments as string | null;
  if (typeof raw.date_received === 'string' || raw.date_received === null) patch.date_received = raw.date_received as string | null;
  if (typeof raw.time_received === 'string' || raw.time_received === null) patch.time_received = raw.time_received as string | null;
  if (typeof raw.soft_copy_received === 'boolean') patch.soft_copy_received = raw.soft_copy_received;
  if (typeof raw.hard_copy_received === 'boolean') patch.hard_copy_received = raw.hard_copy_received;
  return patch;
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, manager_name, status, submitted_at, cfp_id')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const appRow = app as {
    id: string;
    fund_name: string;
    manager_name: string;
    status: string;
    submitted_at: string | null;
    cfp_id: string | null;
  };

  if (appRow.status === 'draft') {
    return NextResponse.json({ error: 'Application must be submitted before pre-qualification' }, { status: 400 });
  }

  let cfp: { id: string; title: string; status: string; closing_date: string } | null = null;
  if (appRow.cfp_id) {
    const { data: cfpRow } = await supabase
      .from('vc_cfps')
      .select('id, title, status, closing_date')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', appRow.cfp_id)
      .maybeSingle();
    if (cfpRow) {
      const r = cfpRow as { id: string; title: string; status: string; closing_date: string };
      cfp = { id: r.id, title: r.title, status: r.status, closing_date: r.closing_date };
    }
  }

  const { data: pq } = await supabase
    .from('vc_prequalification')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  const template = emptyPrequalificationTemplate(applicationId);

  return NextResponse.json({
    application: appRow,
    cfp,
    prequalification: pq ? (pq as PrequalificationRow) : null,
    proposal_document_path: (pq as PrequalificationRow | null)?.proposal_document_path ?? null,
    ai_analysed_at: (pq as PrequalificationRow | null)?.ai_analysed_at ?? null,
    template,
  });
}

export async function PUT(req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const status = (app as { status: string }).status;
  if (!EDITABLE_APP_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Pre-qualification checklist is locked for this application status' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = parseBodyFields(body);

  const { data: existing } = await supabase
    .from('vc_prequalification')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  const existingRow = existing as PrequalificationRow | null;
  if (existingRow && existingRow.overall_status !== 'pending') {
    return NextResponse.json({ error: 'Decision already recorded; checklist is read-only' }, { status: 400 });
  }

  const base: Record<string, unknown> = existingRow
    ? { ...existingRow, ...patch }
    : {
        tenant_id: profile.tenant_id,
        ...emptyPrequalificationTemplate(applicationId),
        ...patch,
      };

  for (const k of [...S21_KEYS, ...S22_KEYS]) {
    const v = base[k as string];
    if (!isChecklistResponse(v)) base[k as string] = 'not_reviewed';
  }

  const upsertPayload = { ...base } as Record<string, unknown>;

  const { data: saved, error: saveErr } = await supabase
    .from('vc_prequalification')
    .upsert(upsertPayload, { onConflict: 'tenant_id,application_id' })
    .select('*')
    .single();

  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({ prequalification: saved as PrequalificationRow });
}
