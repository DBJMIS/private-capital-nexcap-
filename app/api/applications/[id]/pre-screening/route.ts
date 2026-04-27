import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { ensurePreScreeningChecklist } from '@/lib/pre-screening/ensure-checklist';
import type { PreScreeningItemRow } from '@/lib/pre-screening/evaluate';
import {
  categoryProgress,
  evaluatePreScreening,
} from '@/lib/pre-screening/evaluate';
import { syncChecklistCategoryFlags } from '@/lib/pre-screening/sync-checklist';
import { PRE_SCREENING_ITEM_CATALOG } from '@/lib/pre-screening/catalog';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function mapItems(rows: { id: string; category: string; item_key: string; label: string; status: string; notes: string | null }[]): PreScreeningItemRow[] {
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    item_key: r.item_key,
    label: r.label,
    status: r.status as PreScreeningItemRow['status'],
    notes: r.notes,
  }));
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, tenant_id, status, fund_name, submitted_at, cfp_id')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (app.status === 'draft') {
    return NextResponse.json(
      { error: 'Application must be submitted before pre-screening' },
      { status: 400 },
    );
  }

  if (app.status === 'submitted') {
    await supabase
      .from('vc_fund_applications')
      .update({ status: 'pre_screening' })
      .eq('id', applicationId)
      .eq('tenant_id', profile.tenant_id);
    app.status = 'pre_screening';
  }

  const ensured = await ensurePreScreeningChecklist(supabase, profile.tenant_id, applicationId);
  if ('error' in ensured) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  const itemRows = mapItems(ensured.items);
  await syncChecklistCategoryFlags(supabase, profile.tenant_id, ensured.checklist.id, itemRows);

  const { data: checklistFresh } = await supabase
    .from('vc_pre_screening_checklists')
    .select('*')
    .eq('id', ensured.checklist.id)
    .single();

  const evaluation = evaluatePreScreening(itemRows);
  const progress = categoryProgress(itemRows);

  const appRow = app as { cfp_id: string | null };
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

  return NextResponse.json({
    application: {
      id: app.id,
      status: app.status,
      fund_name: app.fund_name,
      submitted_at: app.submitted_at,
      cfp,
    },
    checklist: checklistFresh ?? ensured.checklist,
    items: ensured.items,
    progress,
    evaluation,
  });
}

type PutBody = {
  item_key: string;
  status: 'yes' | 'no' | 'pending';
  notes?: string | null;
};

export async function PUT(req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.item_key || !['yes', 'no', 'pending'].includes(body.status)) {
    return NextResponse.json({ error: 'item_key and valid status required' }, { status: 400 });
  }

  const catalogKeys = new Set(PRE_SCREENING_ITEM_CATALOG.map((d) => d.item_key));
  if (!catalogKeys.has(body.item_key)) {
    return NextResponse.json({ error: 'Unknown item_key' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  if (app.status === 'draft') {
    return NextResponse.json({ error: 'Application not in pre-screening flow' }, { status: 400 });
  }
  if (['due_diligence', 'approved', 'rejected'].includes(app.status)) {
    return NextResponse.json({ error: 'Pre-screening is read-only for this application status' }, { status: 400 });
  }

  const ensured = await ensurePreScreeningChecklist(supabase, profile.tenant_id, applicationId);
  if ('error' in ensured) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from('vc_pre_screening_items')
    .update({
      status: body.status,
      notes: body.notes === undefined ? undefined : body.notes,
      updated_by: user.id,
    })
    .eq('tenant_id', profile.tenant_id)
    .eq('checklist_id', ensured.checklist.id)
    .eq('item_key', body.item_key);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { data: refreshed } = await supabase
    .from('vc_pre_screening_items')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('checklist_id', ensured.checklist.id);

  const itemRows = mapItems(refreshed ?? []);
  await syncChecklistCategoryFlags(supabase, profile.tenant_id, ensured.checklist.id, itemRows);

  const { data: checklistRow } = await supabase
    .from('vc_pre_screening_checklists')
    .select('*')
    .eq('id', ensured.checklist.id)
    .single();

  return NextResponse.json({
    checklist: checklistRow,
    items: refreshed,
    progress: categoryProgress(itemRows),
    evaluation: evaluatePreScreening(itemRows),
  });
}
