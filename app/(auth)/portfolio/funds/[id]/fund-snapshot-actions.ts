'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';

const confidenceJsonSchema = z.record(z.string(), z.unknown());

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  period_year: z.number().int().min(2000).max(2100),
  period_quarter: z.number().int().min(1).max(4),
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nav: z.number().nonnegative(),
  committed_capital: z.number().nonnegative().nullable().optional(),
  distributions_in_period: z.number().nullable().optional(),
  /** Annual IRR as percentage in 0–100 range (e.g. 15.5), or null. Stored as decimal rate. */
  reported_irr_pct: z.number().min(-100).max(100).nullable().optional(),
  investor_remark: z.string().max(8000).nullable().optional(),
  /** When saving a snapshot created from a reporting obligation PDF extraction flow. */
  source_obligation_id: z.string().uuid().optional(),
  extraction_confidence: confidenceJsonSchema.optional(),
});

export type FundSnapshotActionResult = { ok: true } | { ok: false; error: string };

function revalidateFundPaths(fundId: string) {
  revalidatePath('/portfolio/funds');
  revalidatePath(`/portfolio/funds/${fundId}`);
  revalidatePath('/portfolio/executive');
}

export async function upsertFundSnapshotAction(fundId: string, raw: unknown): Promise<FundSnapshotActionResult> {
  await requireAuth();
  const profile = await getProfile();
  if (!fundId || !profile || !can(profile, 'write:applications')) {
    return { ok: false, error: 'Forbidden' };
  }

  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const body = parsed.data;
  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fErr || !fund) {
    return { ok: false, error: 'Fund not found' };
  }

  const reported_irr =
    body.reported_irr_pct == null || Number.isNaN(body.reported_irr_pct)
      ? null
      : body.reported_irr_pct / 100;

  if (body.source_obligation_id) {
    const { data: srcOb, error: srcErr } = await supabase
      .from('vc_reporting_obligations')
      .select('id, fund_id, report_type')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', body.source_obligation_id)
      .eq('fund_id', fundId)
      .maybeSingle();

    if (srcErr || !srcOb) {
      return { ok: false, error: 'Source obligation not found for this fund.' };
    }
    const rt = (srcOb as { report_type: string }).report_type;
    if (rt !== 'quarterly_financial' && rt !== 'audited_annual') {
      return { ok: false, error: 'Source obligation type does not support snapshot linking.' };
    }
  }

  const row = {
    tenant_id: profile.tenant_id,
    fund_id: fundId,
    period_year: body.period_year,
    period_quarter: body.period_quarter,
    snapshot_date: body.snapshot_date,
    nav: body.nav,
    committed_capital: body.committed_capital ?? null,
    distributions_in_period: body.distributions_in_period ?? null,
    reported_irr,
    investor_remark: body.investor_remark?.trim() ? body.investor_remark.trim() : null,
    created_by: profile.profile_id,
    source_obligation_id: body.source_obligation_id ?? null,
    extraction_confidence: body.extraction_confidence ?? null,
  };

  if (body.id) {
    const { data: existing, error: exErr } = await supabase
      .from('vc_fund_snapshots')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .eq('id', body.id)
      .maybeSingle();

    if (exErr || !existing) {
      return { ok: false, error: 'Snapshot not found' };
    }

    const patch: Record<string, unknown> = {
      period_year: row.period_year,
      period_quarter: row.period_quarter,
      snapshot_date: row.snapshot_date,
      nav: row.nav,
      committed_capital: row.committed_capital,
      distributions_in_period: row.distributions_in_period,
      reported_irr: row.reported_irr,
      investor_remark: row.investor_remark,
    };
    if (body.extraction_confidence !== undefined) {
      patch.extraction_confidence = body.extraction_confidence;
    }

    const { error } = await supabase
      .from('vc_fund_snapshots')
      .update(patch)
      .eq('id', body.id)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId);

    if (error) {
      return { ok: false, error: error.message };
    }
    revalidateFundPaths(fundId);
    return { ok: true };
  }

  const { data: inserted, error } = await supabase.from('vc_fund_snapshots').insert(row).select('id').single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A snapshot for this quarter already exists. Edit the existing row instead.' };
    }
    return { ok: false, error: error.message };
  }

  if (body.source_obligation_id && inserted?.id) {
    const { error: linkErr } = await supabase
      .from('vc_reporting_obligations')
      .update({ snapshot_extracted: true, snapshot_id: inserted.id })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', body.source_obligation_id)
      .eq('fund_id', fundId);

    if (linkErr) {
      await supabase.from('vc_fund_snapshots').delete().eq('id', inserted.id).eq('tenant_id', profile.tenant_id).eq('fund_id', fundId);
      return { ok: false, error: linkErr.message };
    }
  }

  revalidateFundPaths(fundId);
  return { ok: true };
}

export async function deleteFundSnapshotAction(fundId: string, snapshotId: string): Promise<FundSnapshotActionResult> {
  await requireAuth();
  const profile = await getProfile();
  if (!fundId || !snapshotId || !profile || !can(profile, 'delete:records')) {
    return { ok: false, error: 'Forbidden' };
  }

  const supabase = createServerClient();

  await supabase
    .from('vc_reporting_obligations')
    .update({ snapshot_extracted: false, snapshot_id: null })
    .eq('tenant_id', profile.tenant_id)
    .eq('snapshot_id', snapshotId);

  const { error } = await supabase
    .from('vc_fund_snapshots')
    .delete()
    .eq('id', snapshotId)
    .eq('fund_id', fundId)
    .eq('tenant_id', profile.tenant_id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateFundPaths(fundId);
  return { ok: true };
}
