'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { AccessPreviewBlock, RoleCardGrid, roleChangeWarningMessage } from '@/components/settings/RoleAccessBlocks';
import type { AssignableInviteRole } from '@/lib/auth/rbac';
import { roleAvatarClass, roleBadgeClass, roleDisplayLabel } from '@/lib/settings/role-visual';
import type { Database } from '@/types/database';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { cn } from '@/lib/utils';

type ProfileRow = Database['public']['Tables']['vc_profiles']['Row'];
type UserRoleRow = Database['public']['Tables']['vc_user_roles']['Row'];

type Props = {
  profile: ProfileRow;
  userRole: UserRoleRow | null;
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

export function UserEditForm({ profile, userRole, currentProfileId }: Props) {
  const router = useRouter();
  const initialRole = userRole?.role ?? profile.role;
  const [role, setRole] = useState<string>(initialRole);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const downgrade = useMemo(() => roleChangeWarningMessage(initialRole, role), [initialRole, role]);

  const selectedCard = useMemo(() => {
    const assignable = ['pctu_officer', 'investment_officer', 'portfolio_manager', 'panel_member', 'it_admin', 'senior_management'] as const;
    return assignable.includes(role as (typeof assignable)[number]) ? (role as AssignableInviteRole) : null;
  }, [role]);

  const previewRole = role === 'analyst' || role === 'officer' ? 'investment_officer' : role;

  const active = profile.is_active && (userRole?.is_active ?? true);

  async function onSave() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/${profile.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        setErr(typeof j.error === 'string' ? j.error : 'Save failed');
        return;
      }
      router.push('/settings/users');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/users/${profile.id}/deactivate`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      setDeactivateOpen(false);
      router.push('/settings/users');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isSelf = profile.id === currentProfileId;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <Link
        href="/settings/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0B1F45]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        User Management
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F45]">{profile.full_name}</h1>
        <p className="mt-1 text-sm text-gray-400">{profile.email}</p>
        {initialRole !== role ? (
          <p className="mt-2 text-sm text-gray-600">
            Changing from <strong>{roleDisplayLabel(initialRole)}</strong> to <strong>{roleDisplayLabel(role)}</strong>
          </p>
        ) : null}
      </div>

      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </p>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <span
            className={cn(
              'inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold',
              roleAvatarClass(initialRole),
            )}
          >
            {initials(profile.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#0B1F45]">{profile.full_name}</p>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <span
              className={cn('mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', roleBadgeClass(initialRole))}
            >
              {roleDisplayLabel(initialRole)}
            </span>
            {userRole?.assigned_at ? (
              <p className="mt-2 text-xs text-gray-400">Assigned {new Date(userRole.assigned_at).toLocaleDateString()}</p>
            ) : null}
            <p className="mt-3 text-sm text-gray-600">
              Status:{' '}
              <span className={active ? 'font-medium text-[#0F8A6E]' : 'font-medium text-gray-500'}>
                {active ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[#0B1F45]">Change role</h2>
        <div className="mt-3">
          <RoleCardGrid selected={selectedCard} onSelect={(r) => setRole(r)} />
        </div>
        <AccessPreviewBlock role={previewRole} />
        {downgrade ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{downgrade}</div>
        ) : null}
        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90"
            disabled={busy || role === initialRole || isSelf}
            onClick={() => void onSave()}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {!isSelf && profile.role !== 'admin' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase text-red-500">Danger Zone</p>
          <p className="mt-2 text-sm font-medium text-red-700">Deactivate User</p>
          <p className="mt-1 text-xs text-red-500">
            This will immediately revoke all platform access for {profile.full_name}. They will not be able to sign in.
            This action can be reversed.
          </p>
          <Button type="button" variant="outline" className="mt-4 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setDeactivateOpen(true)}>
            Deactivate User
          </Button>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={deactivateOpen}
        onCancel={() => setDeactivateOpen(false)}
        onConfirm={onDeactivate}
        title="Deactivate user?"
        message={`Are you sure you want to deactivate ${profile.full_name}? They will lose all access immediately.`}
        confirmLabel="Yes, Deactivate"
        loadingConfirmLabel="Deactivating…"
        confirmVariant="danger"
        isLoading={busy}
      />
    </div>
  );
}
