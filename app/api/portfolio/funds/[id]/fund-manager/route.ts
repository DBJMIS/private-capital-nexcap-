import { NextResponse } from 'next/server';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type ProfileJson = {
  summary?: string;
  strengths?: string[];
  concerns?: string[];
  interaction_timeline?: Array<{ date?: string; event?: string; outcome?: string }>;
  dd_history?: {
    submissions?: number;
    avg_score?: number;
    highest_score?: number;
    sections_consistently_weak?: string[];
  };
  relationship_health?: string;
  recommended_next_steps?: string[];
  data_gaps?: string[];
  last_updated?: string;
};

function parseProfile(json: Json | null): ProfileJson | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return json as ProfileJson;
}

function maxTimelineDate(profile: ProfileJson | null): string | null {
  const rows = profile?.interaction_timeline ?? [];
  const dates = rows.map((x) => x.date).filter((d): d is string => typeof d === 'string' && d.length > 0);
  if (dates.length === 0) return null;
  return dates.sort((a, b) => b.localeCompare(a))[0];
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const viewer = await getProfile();
  if (!viewer || !can(viewer, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId } = await ctx.params;
  const supabase = createServerClient();

  const { data: fundRow, error: fundErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, fund_manager_id')
    .eq('tenant_id', viewer.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fundErr) return NextResponse.json({ error: fundErr.message }, { status: 500 });
  if (!fundRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fundManagerId = fundRow.fund_manager_id as string | null;
  if (!fundManagerId) {
    return NextResponse.json({
      linked: false as const,
      fund_manager_id: null,
      manager: null,
      profile_record: null,
      notes: [] as unknown[],
      last_contact: null as string | null,
    });
  }

  const [{ data: manager, error: mErr }, { data: profileRecord, error: pErr }] = await Promise.all([
    supabase
      .from('fund_managers')
      .select('id, name, firm_name, email, phone, linkedin_url, first_contact_date, created_at')
      .eq('tenant_id', viewer.tenant_id)
      .eq('id', fundManagerId)
      .maybeSingle(),
    supabase
      .from('ai_relationship_profiles')
      .select('id, fund_manager_id, profile, generated_at, version')
      .eq('tenant_id', viewer.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!manager) {
    return NextResponse.json({
      linked: false as const,
      fund_manager_id: null,
      manager: null,
      profile_record: null,
      notes: [] as unknown[],
      last_contact: null as string | null,
    });
  }

  const { data: notes, error: nErr } = await supabase
    .from('fund_manager_notes')
    .select('id, note, added_by, created_at')
    .eq('tenant_id', viewer.tenant_id)
    .eq('fund_manager_id', fundManagerId)
    .order('created_at', { ascending: true });

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  const addedByIds = [...new Set((notes ?? []).map((n) => n.added_by).filter((x): x is string => !!x))];
  let nameByUserId = new Map<string, string>();
  if (addedByIds.length > 0) {
    const { data: profs } = await supabase
      .from('vc_profiles')
      .select('user_id, full_name')
      .eq('tenant_id', viewer.tenant_id)
      .in('user_id', addedByIds);
    nameByUserId = new Map((profs ?? []).map((row) => [row.user_id as string, (row.full_name as string) ?? 'Staff']));
  }

  const profileParsed = parseProfile(profileRecord?.profile ?? null);

  const lastTimeline = maxTimelineDate(profileParsed);
  const last_contact =
    lastTimeline ??
    profileParsed?.last_updated ??
    manager.first_contact_date ??
    (notes?.length ? (notes[notes.length - 1]?.created_at ?? null) : null);

  const notesOut = (notes ?? []).map((n) => ({
    id: n.id as string,
    note: n.note as string,
    added_by: n.added_by as string | null,
    author_name: n.added_by ? nameByUserId.get(n.added_by as string) ?? 'Staff' : 'Staff',
    created_at: n.created_at as string,
  }));

  return NextResponse.json({
    linked: true as const,
    fund_manager_id: fundManagerId,
    manager,
    profile_record: profileRecord
      ? {
          generated_at: profileRecord.generated_at,
          version: profileRecord.version,
          profile: profileParsed,
          raw_profile: profileRecord.profile,
        }
      : null,
    notes: notesOut,
    last_contact: last_contact ?? null,
  });
}
