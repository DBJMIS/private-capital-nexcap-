import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

type ProfileRow = Database['public']['Tables']['vc_profiles']['Row'];
type UserRoleRow = Database['public']['Tables']['vc_user_roles']['Row'];
type InviteRow = Database['public']['Tables']['vc_invitations']['Row'];

type UserRoleRowCompat = UserRoleRow & {
  // Some environments expose user_id on vc_user_roles instead of profile_id.
  user_id?: string | null;
};

export type UserRowVm = {
  user_role_id: string;
  profile_id: string;
  full_name: string;
  email: string;
  role: string;
  assigned_at: string;
  assigned_by_name: string | null;
  is_active: boolean;
  profile_active: boolean;
  deactivated_at: string | null;
  deactivated_by_name: string | null;
  synthetic: boolean;
};

export type PendingInviteVm = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  token_expires_at: string;
  invited_by_name: string | null;
  created_at: string;
};

export type UserManagementSnapshot = {
  users: UserRowVm[];
  pending_invitations: PendingInviteVm[];
  stats: {
    activeUsers: number;
    pendingInvites: number;
    roleCounts: Record<string, number>;
    lastActivityLabel: string;
  };
};

function daysAgoLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const days = Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export async function loadUserManagementSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<UserManagementSnapshot> {
  const { data: allProfiles } = await supabase.from('vc_profiles').select('*').eq('tenant_id', tenantId);
  const { data: roleRows } = await supabase
    .from('vc_user_roles')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('assigned_at', { ascending: false });

  const profiles = (allProfiles ?? []) as ProfileRow[];
  console.log('Tenant ID:', tenantId);
  console.log('Total users loaded:', profiles.length);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const roles = (roleRows ?? []) as UserRoleRowCompat[];
  const profileByUserId = new Map(profiles.map((p) => [p.user_id, p]));

  function roleProfileId(r: UserRoleRowCompat): string | null {
    const pid = (r as { profile_id?: string | null }).profile_id ?? null;
    if (pid) return pid;
    const uid = r.user_id ?? null;
    if (!uid) return null;
    const p = profileByUserId.get(uid);
    return p?.id ?? null;
  }

  const roleByProfileId = new Map<string, UserRoleRowCompat>();
  for (const role of roles) {
    const pid = roleProfileId(role);
    if (!pid) continue;
    if (!roleByProfileId.has(pid)) {
      roleByProfileId.set(pid, role);
    }
  }

  const relatedProfileIds = [
    ...new Set(roles.flatMap((r) => [r.assigned_by, r.deactivated_by]).filter(Boolean)),
  ] as string[];
  let assignerById = new Map<string, ProfileRow>();
  if (relatedProfileIds.length > 0) {
    const { data: assigners } = await supabase.from('vc_profiles').select('*').in('id', relatedProfileIds);
    assignerById = new Map(((assigners ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  }

  const users: UserRowVm[] = profiles.map((p) => {
    const ur = roleByProfileId.get(p.id) ?? null;
    const assigner = ur?.assigned_by ? assignerById.get(ur.assigned_by) : null;
    return {
      user_role_id: ur?.id ?? `profile-${p.id}`,
      profile_id: p.id,
      full_name: p.full_name ?? 'Unknown',
      email: p.email ?? '',
      role: ur?.role ?? p.role ?? 'viewer',
      assigned_at: ur?.assigned_at ?? p.created_at,
      assigned_by_name: assigner?.full_name ?? null,
      is_active: ur?.is_active ?? p.is_active,
      profile_active: p.is_active,
      deactivated_at: ur?.deactivated_at ?? null,
      deactivated_by_name: ur?.deactivated_by ? assignerById.get(ur.deactivated_by)?.full_name ?? null : null,
      synthetic: !ur,
    };
  });

  console.log(
    'Users with roles:',
    users.filter((u) => !!u.role).length,
  );

  const { data: invites } = await supabase
    .from('vc_invitations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const invList = (invites ?? []) as InviteRow[];
  const inviterIds = [...new Set(invList.map((i) => i.invited_by).filter(Boolean))] as string[];
  let inviterById = new Map<string, ProfileRow>();
  if (inviterIds.length > 0) {
    const { data: inviters } = await supabase.from('vc_profiles').select('*').in('id', inviterIds);
    inviterById = new Map(((inviters ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  }

  const pending_invitations: PendingInviteVm[] = invList
    .filter((i) => i.status === 'pending')
    .map((i) => ({
      id: i.id,
      full_name: i.full_name,
      email: i.email,
      role: i.role,
      token_expires_at: i.token_expires_at,
      invited_by_name: i.invited_by ? inviterById.get(i.invited_by)?.full_name ?? null : null,
      created_at: i.created_at,
    }));

  const activeUsers = users.filter((u) => u.is_active && u.profile_active).length;
  const pendingInvites = pending_invitations.length;

  const roleCounts: Record<string, number> = {
    pctu_officer: 0,
    investment_officer: 0,
    portfolio_manager: 0,
    panel_member: 0,
    it_admin: 0,
    senior_management: 0,
  };
  for (const u of users) {
    if (!u.is_active || !u.profile_active) continue;
    if (u.role in roleCounts) roleCounts[u.role] += 1;
  }

  const activityDates = [
    ...users.map((u) => u.assigned_at),
    ...pending_invitations.map((i) => i.created_at),
  ].filter(Boolean);
  const latest = activityDates
    .map((d) => new Date(d).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];
  const lastActivityLabel = latest ? daysAgoLabel(new Date(latest).toISOString()) : '—';

  return {
    users,
    pending_invitations,
    stats: {
      activeUsers,
      pendingInvites,
      roleCounts,
      lastActivityLabel,
    },
  };
}
