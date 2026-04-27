'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Mail, Users, X } from 'lucide-react';

import type { PendingInviteVm, UserManagementSnapshot, UserRowVm } from '@/lib/settings/user-management-snapshot';
import { roleAvatarClass, roleBadgeClass, roleDisplayLabel } from '@/lib/settings/role-visual';
import { ASSIGNABLE_INVITE_ROLES } from '@/lib/auth/rbac';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AddInternalUserModal } from '@/components/settings/AddInternalUserModal';

type Props = {
  initial: UserManagementSnapshot;
  currentProfileId: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function formatAssigned(at: string, by: string | null) {
  const d = new Date(at);
  // Use fixed locale/time zone to avoid SSR/client hydration mismatch.
  const date = Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }).format(d) : '—';
  return by ? `${date} · by ${by}` : date;
}

export function UserManagementClient({ initial, currentProfileId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invited = searchParams.get('invited');

  const [tab, setTab] = useState<'users' | 'invites' | 'inactive'>('users');
  const [users, setUsers] = useState(initial.users);
  const [invites, setInvites] = useState(initial.pending_invitations);
  const [stats, setStats] = useState(initial.stats);
  const [editingRoleUser, setEditingRoleUser] = useState<UserRowVm | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState<string | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<UserRowVm | null>(null);
  const [reactivateUser, setReactivateUser] = useState<UserRowVm | null>(null);
  const [showAddInternalModal, setShowAddInternalModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/settings/users');
    if (!res.ok) return;
    const j = (await res.json()) as UserManagementSnapshot;
    setUsers(j.users);
    setInvites(j.pending_invitations);
    setStats(j.stats);
  }, []);

  const onRoleSave = async (row: UserRowVm, role: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/${row.profile_id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingRoleUser(null);
      setEditingRoleValue(null);
      setNotice(`${row.full_name} updated to ${roleDisplayLabel(role)}.`);
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async () => {
    if (!deactivateUser) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/${deactivateUser.profile_id}/deactivate`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice(`${deactivateUser.full_name} has been deactivated.`);
      setDeactivateUser(null);
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onReactivate = async () => {
    if (!reactivateUser) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/${reactivateUser.profile_id}/reactivate`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice(`${reactivateUser.full_name} has been reactivated.`);
      setReactivateUser(null);
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onResend = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/invitations/${id}/resend`, { method: 'PATCH' });
      if (!res.ok) throw new Error(await res.text());
      setNotice('Invitation resent.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/invitations/${id}/revoke`, { method: 'PATCH' });
      if (!res.ok) throw new Error(await res.text());
      setNotice('Invitation revoked.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const inviteExpiresLabel = useMemo(() => {
    return (iso: string) => {
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return { text: '—', expired: false };
      const expired = t < Date.now();
      if (expired) return { text: 'Expired', expired: true };
      const days = Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
      return {
        text: `${days} day${days === 1 ? '' : 's'} remaining`,
        expired: false,
      };
    };
  }, []);

  const activeUsers = users.filter((u) => u.is_active && u.profile_active);
  const inactiveUsers = users.filter((u) => !u.is_active || !u.profile_active);

  const roleOptions = ASSIGNABLE_INVITE_ROLES;

  return (
    <div className="w-full max-w-none space-y-6 pb-10">
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {invited ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Invitation sent to {decodeURIComponent(invited)}.
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">User Management</h1>
          <p className="mt-1 text-sm text-gray-400">Manage platform access and roles</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90" onClick={() => setShowAddInternalModal(true)}>
            + Add Internal User
          </Button>
          <Button asChild variant="outline" className="border-gray-300 text-gray-700">
            <Link href="/settings/users/invite">+ Invite External User</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="border-t-4 border-blue-500 pt-1" />
          <div className="mt-2 flex items-center gap-2 text-blue-600">
            <Users className="h-5 w-5" />
            <span className="text-2xl font-bold text-[#0B1F45]">{stats.activeUsers}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-600">Active Users</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="border-t-4 border-amber-500 pt-1" />
          <div className="mt-2 flex items-center gap-2 text-amber-600">
            <Mail className="h-5 w-5" />
            <span className="text-2xl font-bold text-[#0B1F45]">{stats.pendingInvites}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-600">Pending Invites</p>
          {stats.pendingInvites > 0 ? (
            <p className="mt-0.5 text-xs text-amber-600">Awaiting acceptance</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="border-t-4 border-[#0B1F45] pt-1" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">By Role</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            <li className="flex justify-between">
              <span>PCTU Officers</span>
              <span className="font-medium text-[#0B1F45]">{stats.roleCounts.pctu_officer}</span>
            </li>
            <li className="flex justify-between">
              <span>Investment Officers</span>
              <span className="font-medium text-[#0B1F45]">{stats.roleCounts.investment_officer}</span>
            </li>
            <li className="flex justify-between">
              <span>Portfolio Managers</span>
              <span className="font-medium text-[#0B1F45]">{stats.roleCounts.portfolio_manager}</span>
            </li>
            <li className="flex justify-between">
              <span>Panel Members</span>
              <span className="font-medium text-[#0B1F45]">{stats.roleCounts.panel_member}</span>
            </li>
            <li className="flex justify-between">
              <span>IT Admins</span>
              <span className="font-medium text-[#0B1F45]">{stats.roleCounts.it_admin}</span>
            </li>
            <li className="flex justify-between">
              <span>Senior Management</span>
              <span className="font-medium text-[#0B1F45]">{stats.roleCounts.senior_management}</span>
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="border-t-4 border-[#0F8A6E] pt-1" />
          <p className="mt-2 text-2xl font-bold text-[#0B1F45]">{stats.lastActivityLabel}</p>
          <p className="mt-1 text-sm font-medium text-gray-600">Recently Added</p>
          <p className="mt-0.5 text-xs text-gray-500">Based on invites & assignments</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex gap-2 border-b border-gray-100 px-4 pt-3">
          <button
            type="button"
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium',
              tab === 'users' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-500',
            )}
            onClick={() => setTab('users')}
          >
            Active Users
          </button>
          <button
            type="button"
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium',
              tab === 'invites' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-500',
            )}
            onClick={() => setTab('invites')}
          >
            Pending Invitations
          </button>
          <button
            type="button"
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium',
              tab === 'inactive' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-500',
            )}
            onClick={() => setTab('inactive')}
          >
            Inactive Users
          </button>
        </div>

        {tab === 'users' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((row) => {
                  const isAdmin = row.role === 'admin' || row.synthetic;
                  return (
                    <tr key={row.user_role_id} className="border-b border-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold',
                              roleAvatarClass(row.role),
                            )}
                          >
                            {initials(row.full_name)}
                          </span>
                          <div>
                            <p className="font-semibold text-[#0B1F45]">{row.full_name}</p>
                            <p className="text-xs text-gray-400">{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                            roleBadgeClass(row.role),
                          )}
                        >
                          {roleDisplayLabel(row.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatAssigned(row.assigned_at, row.assigned_by_name)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                          <span className={cn('h-2 w-2 rounded-full bg-[#0F8A6E]')} />
                          Active
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin || row.profile_id === currentProfileId ? (
                          <span className="text-xs italic text-gray-300">System admin</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#0B1F45] hover:bg-[#0B1F45]/5 hover:text-[#0B1F45]"
                              onClick={() => {
                                setEditingRoleUser(row);
                                setEditingRoleValue(row.role);
                              }}
                            >
                              Edit Role
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50"
                              onClick={() => setDeactivateUser(row)}
                            >
                              Deactivate
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {activeUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No active users.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : tab === 'invites' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Invited User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Invited By</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No pending invitations.
                    </td>
                  </tr>
                ) : (
                  invites.map((inv) => {
                    const exp = inviteExpiresLabel(inv.token_expires_at);
                    return (
                      <tr key={inv.id} className="border-b border-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                              {initials(inv.full_name)}
                            </span>
                            <div>
                              <p className="font-semibold text-[#0B1F45]">{inv.full_name}</p>
                              <p className="text-xs text-gray-400">{inv.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                              roleBadgeClass(inv.role),
                            )}
                          >
                            {roleDisplayLabel(inv.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{inv.invited_by_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          {exp.expired ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              Expired
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500">{exp.text}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onResend(inv.id)}>
                              Resend
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-red-600"
                              disabled={busy}
                              onClick={() => void onRevoke(inv.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Deactivated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inactiveUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No inactive users.
                    </td>
                  </tr>
                ) : (
                  inactiveUsers.map((row) => (
                    <tr key={row.user_role_id} className="border-b border-gray-50 text-gray-500">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 opacity-50">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-500">
                            {initials(row.full_name)}
                          </span>
                          <div>
                            <p className="font-semibold text-gray-400">{row.full_name}</p>
                            <p className="text-xs text-gray-400">{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium opacity-50',
                            roleBadgeClass(row.role),
                          )}
                        >
                          {roleDisplayLabel(row.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        Deactivated:{' '}
                        {row.deactivated_at
                          ? `${Math.max(
                              0,
                              Math.floor((Date.now() - new Date(row.deactivated_at).getTime()) / (24 * 60 * 60 * 1000)),
                            )} days ago`
                          : '—'}
                        {row.deactivated_by_name ? ` by ${row.deactivated_by_name}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-medium text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-50"
                          onClick={() => setReactivateUser(row)}
                        >
                          Reactivate
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ActionConfirmModal
        open={!!deactivateUser}
        busy={busy}
        title={deactivateUser ? `Deactivate ${deactivateUser.full_name}?` : ''}
        description="This will immediately remove their access to the platform. They will not be able to sign in until reactivated."
        confirmLabel="Yes, Deactivate"
        kind="deactivate"
        onCancel={() => setDeactivateUser(null)}
        onConfirm={() => void onDeactivate()}
      />

      <ActionConfirmModal
        open={!!reactivateUser}
        busy={busy}
        title={reactivateUser ? `Reactivate ${reactivateUser.full_name}?` : ''}
        description={
          reactivateUser
            ? `They will regain access with their previous role: ${roleDisplayLabel(reactivateUser.role)}.`
            : ''
        }
        confirmLabel="Yes, Reactivate"
        kind="reactivate"
        confirmClassName="bg-[#0F8A6E] hover:bg-[#0a6e58]"
        onCancel={() => setReactivateUser(null)}
        onConfirm={() => void onReactivate()}
      />

      <EditRoleModal
        open={!!editingRoleUser}
        busy={busy}
        user={editingRoleUser}
        selectedRole={editingRoleValue}
        onSelectRole={setEditingRoleValue}
        onClose={() => {
          setEditingRoleUser(null);
          setEditingRoleValue(null);
        }}
        onSave={() => {
          if (editingRoleUser && editingRoleValue) {
            void onRoleSave(editingRoleUser, editingRoleValue);
          }
        }}
        roleOptions={roleOptions}
      />

      <AddInternalUserModal
        open={showAddInternalModal}
        onClose={() => setShowAddInternalModal(false)}
        onAdded={(msg) => {
          setNotice(msg);
          void refresh();
          router.refresh();
        }}
      />
    </div>
  );
}

function ActionConfirmModal({
  open,
  busy,
  title,
  description,
  confirmLabel,
  confirmClassName = 'bg-red-600 hover:bg-red-700',
  kind,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName?: string;
  kind: 'deactivate' | 'reactivate';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full',
              kind === 'reactivate' ? 'bg-teal-100' : 'bg-red-100',
            )}
          >
            {kind === 'reactivate' ? (
              <CheckCircle className="h-7 w-7 text-teal-600" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-red-600" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-[#0B1F45]">{title}</h3>
          <p className="mt-2 text-sm text-gray-500">{description}</p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            type="button"
            className={cn('flex-1 text-white', confirmClassName)}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditRoleModal({
  open,
  busy,
  user,
  selectedRole,
  onSelectRole,
  onClose,
  onSave,
  roleOptions,
}: {
  open: boolean;
  busy: boolean;
  user: UserRowVm | null;
  selectedRole: string | null;
  onSelectRole: (role: string) => void;
  onClose: () => void;
  onSave: () => void;
  roleOptions: readonly string[];
}) {
  if (!open || !user) return null;
  const selected = selectedRole ?? user.role;
  const canSave = selected !== user.role;

  const descriptions: Record<string, string> = {
    pctu_officer: 'Full portfolio monitoring access',
    investment_officer: 'Full pipeline management access',
    portfolio_manager: 'Portfolio monitoring and pipeline access',
    panel_member: 'Assigned assessments only',
    it_admin: 'User management only',
    senior_management: 'Executive dashboard read-only',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[#0B1F45]">Edit Role</h3>
        <button
          type="button"
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 mt-4 flex items-center gap-3 border-b border-gray-100 pb-4">
          <span
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold',
              roleAvatarClass(user.role),
            )}
          >
            {initials(user.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[#0B1F45]">{user.full_name}</p>
            <p className="truncate text-xs text-gray-400">{user.email}</p>
          </div>
          <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', roleBadgeClass(user.role))}>
            {roleDisplayLabel(user.role)}
          </span>
        </div>

        <p className="mb-3 text-sm font-medium text-gray-600">Select new role</p>
        <div className="space-y-2">
          {roleOptions.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent p-3 transition-colors hover:bg-gray-50 has-[:checked]:border-[#0B1F45] has-[:checked]:bg-[#0B1F45]/5"
            >
              <input
                type="radio"
                name="edit-role"
                value={role}
                checked={selected === role}
                onChange={() => onSelectRole(role)}
                className="accent-[#0B1F45]"
              />
              <div>
                <div className="text-sm font-medium text-[#0B1F45]">{roleDisplayLabel(role)}</div>
                <div className="text-xs text-gray-400">{descriptions[role] ?? ''}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" className="border-gray-200 text-gray-600" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90"
            disabled={busy || !canSave}
            onClick={onSave}
          >
            Save Role
          </Button>
        </div>
      </div>
    </div>
  );
}
