import { NextResponse } from 'next/server';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type TimelineRow = { date?: string };
type ProfilePayload = { relationship_health?: string; interaction_timeline?: TimelineRow[]; last_updated?: string; data_points?: number };

function latestInteractionDate(profile: ProfilePayload | null, firstContactDate: string | null): string | null {
  const dates = (profile?.interaction_timeline ?? [])
    .map((x) => x?.date)
    .filter((x): x is string => typeof x === 'string');
  const maxTimeline = dates.length ? dates.sort((a, b) => b.localeCompare(a))[0] : null;
  return maxTimeline ?? profile?.last_updated ?? firstContactDate ?? null;
}

export async function GET(req: Request) {
  await requireAuth();
  const viewer = await getProfile();
  if (!viewer || !can(viewer, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const selectedId = url.searchParams.get('fund_manager_id');
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';

  const supabase = createServerClient();
  const { data: managers, error: mErr } = await supabase
    .from('fund_managers')
    .select('id, tenant_id, name, firm_name, email, phone, linkedin_url, first_contact_date, created_at')
    .eq('tenant_id', viewer.tenant_id)
    .order('name', { ascending: true });
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const managerRows = (managers ?? []).filter((m) => {
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.firm_name.toLowerCase().includes(q);
  });
  const ids = managerRows.map((m) => m.id);
  const activeSelectedId = selectedId && ids.includes(selectedId) ? selectedId : ids[0] ?? null;

  const [{ data: profiles }, { data: notes }] = await Promise.all([
    ids.length
      ? supabase
          .from('ai_relationship_profiles')
          .select('fund_manager_id, profile, generated_at, version')
          .eq('tenant_id', viewer.tenant_id)
          .in('fund_manager_id', ids)
          .order('generated_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ fund_manager_id: string; profile: ProfilePayload; generated_at: string; version: number }> }),
    activeSelectedId
      ? supabase
          .from('fund_manager_notes')
          .select('id, note, added_by, created_at')
          .eq('tenant_id', viewer.tenant_id)
          .eq('fund_manager_id', activeSelectedId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; note: string; added_by: string | null; created_at: string }> }),
  ]);

  const latestByManager = new Map<string, { profile: ProfilePayload; generated_at: string; version: number }>();
  for (const p of profiles ?? []) {
    if (!latestByManager.has(p.fund_manager_id)) {
      latestByManager.set(p.fund_manager_id, {
        profile: (p.profile ?? {}) as ProfilePayload,
        generated_at: p.generated_at,
        version: p.version,
      });
    }
  }

  const list = managerRows.map((m) => {
    const latest = latestByManager.get(m.id);
    return {
      id: m.id,
      name: m.name,
      firm_name: m.firm_name,
      relationship_health: latest?.profile.relationship_health ?? 'DEVELOPING',
      last_interaction_date: latestInteractionDate(latest?.profile ?? null, m.first_contact_date),
      generated_at: latest?.generated_at ?? null,
    };
  });

  const selectedManager = activeSelectedId ? managerRows.find((m) => m.id === activeSelectedId) ?? null : null;
  const selectedLatest = activeSelectedId ? latestByManager.get(activeSelectedId) ?? null : null;

  return NextResponse.json({
    managers: list,
    selected: selectedManager
      ? {
          manager: selectedManager,
          profile: selectedLatest?.profile ?? null,
          generated_at: selectedLatest?.generated_at ?? null,
          version: selectedLatest?.version ?? null,
          notes: notes ?? [],
        }
      : null,
  });
}
