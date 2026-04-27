'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { ASSIGNABLE_INVITE_ROLES, type AssignableInviteRole } from '@/lib/auth/rbac';
import { roleDisplayLabel } from '@/lib/settings/role-visual';
import { AccessPreviewBlock, RoleCardGrid } from '@/components/settings/RoleAccessBlocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AzureUser = {
  azure_id: string;
  name: string;
  email: string;
  job_title: string | null;
  already_added: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: (msg: string) => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AddInternalUserModal({ open, onClose, onAdded }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AzureUser[]>([]);
  const [selected, setSelected] = useState<AzureUser | null>(null);
  const [role, setRole] = useState<AssignableInviteRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [graphUnavailable, setGraphUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setRole(null);
      setError(null);
      setGraphUnavailable(false);
      setShowDropdown(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      setGraphUnavailable(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/settings/users/search-azure-ad?q=${encodeURIComponent(q)}`);
        const json = (await res.json().catch(() => ({}))) as {
          users?: AzureUser[];
          graph_unavailable?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? 'Search failed');
          setResults([]);
          setShowDropdown(false);
          return;
        }
        setGraphUnavailable(!!json.graph_unavailable);
        setResults(json.users ?? []);
        setShowDropdown(true);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, open]);

  const canAdd = !!selected && !!role && !selected.already_added && !loading;

  const title = useMemo(
    () => (selected && role ? `${selected.name} added as ${roleDisplayLabel(role)}` : ''),
    [selected, role],
  );

  async function onSubmit() {
    if (!selected || !role) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/users/add-internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          azure_id: selected.azure_id,
          user_email: selected.email,
          user_name: selected.name,
          role,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Failed to add internal user');
        return;
      }
      onAdded(title || `${selected.name} added`);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={ref}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-[#0B1F45]">Add Internal User</h2>
          <button type="button" className="text-gray-400 hover:text-gray-600" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Search Azure AD</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {showDropdown && results.length > 0 ? (
            <div className="z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {results.map((u) => (
                <button
                  key={u.azure_id}
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-gray-50 px-3 py-2.5 text-left hover:bg-gray-50"
                  onClick={() => {
                    setSelected(u);
                    setShowDropdown(false);
                  }}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm text-blue-700">
                    {initials(u.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#0B1F45]">{u.name}</span>
                    <span className="block truncate text-xs text-gray-400">{u.email}</span>
                  </span>
                  {u.already_added ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">Already added</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {graphUnavailable ? (
            <p className="mt-2 text-xs text-amber-700">
              Azure AD search is not available. Use Invite User to add users manually.
            </p>
          ) : null}
        </div>

        {selected ? (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm text-blue-700">
              {initials(selected.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#0B1F45]">{selected.name}</p>
              <p className="truncate text-xs text-gray-400">{selected.email}</p>
            </div>
            <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="mt-5">
          <RoleCardGrid selected={role} onSelect={setRole} />
          <AccessPreviewBlock role={role} />
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90"
            disabled={!canAdd}
            onClick={() => void onSubmit()}
          >
            Add User
          </Button>
        </div>
      </div>
    </div>
  );
}
