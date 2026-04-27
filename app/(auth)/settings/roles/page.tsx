'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  BarChart2,
  Building2,
  Calendar,
  ClipboardList,
  Eye,
  FileText,
  LayoutDashboard,
  Lock,
  Megaphone,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AccessLevel = 'full' | 'read_only' | 'none';

type RoleMeta = {
  id: string;
  label: string;
  color: string;
  description: string;
};

type ModuleDef = {
  id: string;
  label: string;
  desc: string;
};

const ROLES: RoleMeta[] = [
  { id: 'admin', label: 'Admin', color: '#0B1F45', description: 'Full access — cannot be modified' },
  { id: 'pctu_officer', label: 'PCTU Officer', color: '#0F8A6E', description: 'Portfolio monitoring team' },
  { id: 'portfolio_manager', label: 'Portfolio Manager', color: '#4F46E5', description: 'Portfolio + pipeline access' },
  { id: 'investment_officer', label: 'Investment Officer', color: '#2563EB', description: 'Pipeline management' },
  { id: 'panel_member', label: 'Panel Member', color: '#D97706', description: 'Assessment scoring only' },
  { id: 'it_admin', label: 'IT Admin', color: '#7C3AED', description: 'User management only' },
  { id: 'senior_management', label: 'Senior Management', color: '#6B7280', description: 'Executive view read-only' },
];

const MODULES: Record<'portfolio' | 'pipeline' | 'operations', ModuleDef[]> = {
  portfolio: [
    { id: 'portfolio_dashboard', label: 'Portfolio Dashboard', desc: 'Overview charts and KPIs' },
    { id: 'fund_monitoring', label: 'Fund Monitoring', desc: 'Fund detail pages' },
    { id: 'reporting_calendar', label: 'Reporting Calendar', desc: 'Obligation schedule' },
    { id: 'compliance', label: 'Compliance', desc: 'Compliance dashboard' },
    { id: 'capital_calls', label: 'Capital Calls', desc: 'Drawdown tracking' },
    { id: 'distributions', label: 'Distributions', desc: 'Dividend tracking' },
    { id: 'watchlist', label: 'Watchlist', desc: 'Flagged items' },
    { id: 'divestment', label: 'Divestment Summary', desc: 'Exit tracking' },
    { id: 'executive_view', label: 'Executive View', desc: 'Board report' },
  ],
  pipeline: [
    { id: 'pipeline_dashboard', label: 'Pipeline Dashboard', desc: 'Application overview' },
    { id: 'fund_applications', label: 'Fund Applications', desc: 'Application management' },
    { id: 'cfp', label: 'Calls for Proposals', desc: 'CFP management' },
    { id: 'dd_questionnaires', label: 'DD Questionnaires', desc: 'Due diligence forms' },
    { id: 'assessments', label: 'Assessments & Scoring', desc: 'Panel evaluation' },
  ],
  operations: [
    { id: 'settings', label: 'Settings', desc: 'Platform configuration' },
    { id: 'user_management', label: 'User Management', desc: 'Add and manage users' },
  ],
};

const MODULE_ICON: Record<string, LucideIcon> = {
  portfolio_dashboard: LayoutDashboard,
  pipeline_dashboard: LayoutDashboard,
  fund_monitoring: Building2,
  reporting_calendar: Calendar,
  compliance: ShieldCheck,
  capital_calls: Banknote,
  distributions: TrendingUp,
  watchlist: Eye,
  divestment: ArrowRightLeft,
  executive_view: BarChart2,
  fund_applications: FileText,
  cfp: Megaphone,
  dd_questionnaires: ClipboardList,
  assessments: Star,
  settings: Settings,
  user_management: Users,
};

const ALL_MODULE_IDS = Object.values(MODULES).flat().map((m) => m.id);

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function RoleManagementPage() {
  const [selectedRole, setSelectedRole] = useState('pctu_officer');
  const [permissions, setPermissions] = useState<Record<string, AccessLevel>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const [roleUsers, setRoleUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  const selectedMeta = ROLES.find((r) => r.id === selectedRole) ?? ROLES[0]!;
  const selectedIsAdmin = selectedRole === 'admin';

  async function loadRoleStats() {
    const res = await fetch('/api/settings/roles');
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{ role: string; user_count: number; module_count: number }>;
    setRoleCounts(Object.fromEntries(rows.map((r) => [r.role, r.user_count])));
    setModuleCounts(Object.fromEntries(rows.map((r) => [r.role, r.module_count])));
  }

  async function loadPermissions(role: string) {
    const res = await fetch(`/api/settings/roles/${role}/permissions`);
    if (!res.ok) return;
    const json = (await res.json()) as { permissions: Record<string, AccessLevel> };
    setPermissions(json.permissions ?? {});
    setIsDirty(false);
  }

  async function loadRoleUsers(role: string) {
    const res = await fetch(`/api/settings/roles/${role}/users`);
    if (!res.ok) return;
    const json = (await res.json()) as { users: Array<{ id: string; full_name: string; email: string }> };
    setRoleUsers(json.users ?? []);
  }

  useEffect(() => {
    void loadRoleStats();
    void loadPermissions(selectedRole);
    void loadRoleUsers(selectedRole);
  }, []);

  useEffect(() => {
    void loadRoleUsers(selectedRole);
  }, [selectedRole]);

  const enabledCount = useMemo(
    () => Object.values(permissions).filter((v) => v === 'full' || v === 'read_only').length,
    [permissions],
  );

  const selectedUserCount = roleCounts[selectedRole] ?? 0;

  const saveLabel = isSaving ? 'Saving...' : saveState === 'saved' ? 'Saved ✓' : isDirty ? 'Save changes ●' : 'Save changes';

  const saveClass = saveState === 'saved' ? 'bg-[#0F8A6E] hover:bg-[#0F8A6E]' : 'bg-[#0B1F45] hover:bg-[#0B1F45]/90';

  async function savePermissions() {
    if (!isDirty || selectedIsAdmin) return;
    setIsSaving(true);
    const res = await fetch(`/api/settings/roles/${selectedRole}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    setIsSaving(false);
    if (res.ok) {
      setIsDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      await loadRoleStats();
    }
  }

  function handleModuleChange(moduleId: string) {
    if (selectedIsAdmin) return;
    setPermissions((prev) => ({
      ...prev,
      [moduleId]: prev[moduleId] === 'full' ? 'none' : 'full',
    }));
    setIsDirty(true);
    setSaveState('idle');
  }

  async function switchRole(roleId: string) {
    if (roleId === selectedRole) return;
    if (isDirty) {
      setPendingRole(roleId);
      return;
    }
    setSelectedRole(roleId);
    await loadPermissions(roleId);
  }

  async function confirmDiscard() {
    if (!pendingRole) return;
    const next = pendingRole;
    setPendingRole(null);
    setSelectedRole(next);
    await loadPermissions(next);
  }

  async function confirmSaveFirst() {
    if (!pendingRole) return;
    await savePermissions();
    const next = pendingRole;
    setPendingRole(null);
    setSelectedRole(next);
    await loadPermissions(next);
  }

  return (
    <div className="pb-8">
      <div className="flex min-h-[calc(100vh-170px)] gap-4">
        <aside className="w-[220px] rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-4">
            <p className="text-sm font-semibold text-[#0B1F45]">Roles</p>
            <p className="mt-1 text-xs text-gray-400">Configure module access by role</p>
          </div>
          <div className="py-2">
            {ROLES.map((role) => {
              const active = role.id === selectedRole;
              return (
                <div
                  key={role.id}
                  onClick={() => void switchRole(role.id)}
                  className={cn(
                    'mx-2 mb-1 flex cursor-pointer items-center gap-[10px] rounded-lg border px-3 py-[9px]',
                    active ? 'border-gray-200 bg-[#F3F4F6]' : 'border-transparent hover:bg-gray-50',
                  )}
                >
                  {role.id === 'admin' ? (
                    <Lock className="h-3.5 w-3.5 text-gray-500" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0B1F45]">{role.label}</p>
                    <p className="text-xs text-gray-400">
                      {role.id === 'admin' ? 'System role — read only' : `(${roleCounts[role.id] ?? 0} users)`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-[#0B1F45]">{selectedMeta.label}</h1>
              <span
                className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: selectedMeta.color }}
              >
                {selectedMeta.id}
              </span>
            </div>
            <Button
              type="button"
              className={cn('text-white', saveClass)}
              disabled={!isDirty || isSaving || selectedIsAdmin}
              onClick={() => void savePermissions()}
            >
              {saveLabel}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {(
              [
                ['portfolio', 'Portfolio'],
                ['pipeline', 'Pipeline'],
                ['operations', 'Operations'],
              ] as const
            ).map(([key, title]) => (
              <div className="mb-6" key={key}>
                <div className="mb-3 border-b border-gray-100 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {MODULES[key].map((mod) => {
                    const access = permissions[mod.id] ?? 'none';
                    const enabled = access === 'full' || access === 'read_only';
                    const Icon = MODULE_ICON[mod.id] ?? Settings;
                    return (
                      <div
                        key={mod.id}
                        onClick={() => handleModuleChange(mod.id)}
                        className={cn(
                          'cursor-pointer rounded-xl border p-3',
                          selectedIsAdmin && 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-60',
                          !selectedIsAdmin && enabled && 'border-[#0B1F45] bg-[rgba(11,31,69,0.03)]',
                          !selectedIsAdmin && !enabled && 'border-gray-200 bg-white',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className={cn('mt-0.5 h-4 w-4', enabled ? 'text-[#0B1F45]' : 'text-gray-300')} />
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm font-medium', enabled ? 'text-[#0B1F45]' : 'text-gray-400')}>{mod.label}</p>
                            <p className="mt-0.5 text-xs text-gray-400">{mod.desc}</p>
                          </div>
                          <button
                            type="button"
                            disabled={selectedIsAdmin}
                            className={cn(
                              'relative h-5 w-9 rounded-full transition-colors',
                              enabled ? 'bg-[#0B1F45]' : 'bg-[#D1D5DB]',
                            )}
                            aria-label={`${mod.label} toggle`}
                          >
                            <span
                              className={cn(
                                'absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white transition-all',
                                enabled ? 'left-[18px]' : 'left-[3px]',
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="mt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Users with this role</div>
              <div className="rounded-lg border border-gray-100 bg-white">
                {roleUsers.length === 0 ? (
                  <div className="px-3 py-3 text-sm italic text-gray-400">No users assigned to this role</div>
                ) : (
                  roleUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0">
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: selectedMeta.color }}
                      >
                        {initials(u.full_name)}
                      </span>
                      <span className="text-sm font-medium text-[#0B1F45]">{u.full_name}</span>
                      <span className="ml-auto text-xs text-gray-400">{u.email}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center gap-6 border-t border-gray-100 bg-gray-50 px-5 py-3">
            <span className="text-sm text-gray-600">
              Modules enabled: <strong>{enabledCount}</strong>
            </span>
            <span className="text-sm text-gray-600">
              Users assigned: <strong>{selectedUserCount}</strong>
            </span>
            <span className="ml-auto text-xs">
              {isDirty ? (
                <span className="text-amber-600">● Unsaved changes</span>
              ) : (
                <span className="text-gray-400">All changes saved</span>
              )}
            </span>
          </div>
        </section>
      </div>

      {pendingRole ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[#0B1F45]">Unsaved changes</h3>
            <p className="mt-2 text-sm text-gray-500">You have unsaved changes. Save or discard?</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => void confirmDiscard()}>
                Discard
              </Button>
              <Button className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90" onClick={() => void confirmSaveFirst()}>
                Save First
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

