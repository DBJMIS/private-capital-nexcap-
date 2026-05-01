'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Tab = 'search' | 'create';

type ManagerHit = { id: string; name: string; firm_name: string; email: string | null };

export function FundManagerAssociateModal({
  open,
  fundId,
  onClose,
  onLinked,
}: {
  open: boolean;
  fundId: string;
  onClose: () => void;
  onLinked: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ManagerHit[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newFirm, setNewFirm] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [firstContact, setFirstContact] = useState('');

  const reset = useCallback(() => {
    setTab('search');
    setQ('');
    setHits([]);
    setSelectedId(null);
    setErr(null);
    setNewName('');
    setNewFirm('');
    setNewEmail('');
    setNewPhone('');
    setFirstContact('');
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open || tab !== 'search' || q.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await fetch(`/api/fund-managers/search?q=${encodeURIComponent(q.trim())}`);
        const json = (await res.json()) as { managers?: ManagerHit[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Search failed');
        if (!cancelled) setHits(json.managers ?? []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, tab, q]);

  const patchFundWithManager = async (managerId: string) => {
    const patch = await fetch(`/api/portfolio/funds/${fundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fund_manager_id: managerId }),
    });
    const pj = (await patch.json()) as { error?: string };
    if (!patch.ok) throw new Error(pj.error ?? 'Could not link manager');
  };

  const linkFund = async (managerId: string) => {
    setBusy(true);
    setErr(null);
    try {
      await patchFundWithManager(managerId);
      onClose();
      await onLinked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to link manager');
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    if (!newName.trim() || !newFirm.trim()) {
      setErr('Name and firm name are required');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/fund-managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          firm_name: newFirm.trim(),
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          first_contact_date: firstContact.trim() || null,
        }),
      });
      const json = (await res.json()) as { manager?: { id: string }; error?: string };
      if (!res.ok || !json.manager) throw new Error(json.error ?? 'Create failed');
      await patchFundWithManager(json.manager.id);
      onClose();
      await onLinked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#0B1F45]">Associate fund manager</h2>
          <button type="button" className="text-xs text-gray-500 hover:text-gray-700" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', tab === 'search' ? 'bg-[#0B1F45] text-white' : 'bg-gray-100 text-gray-600')}
            onClick={() => setTab('search')}
          >
            Search existing
          </button>
          <button
            type="button"
            className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', tab === 'create' ? 'bg-[#0B1F45] text-white' : 'bg-gray-100 text-gray-600')}
            onClick={() => setTab('create')}
          >
            Create new
          </button>
        </div>

        {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}

        {tab === 'search' ? (
          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs text-gray-500">Search by name or firm</Label>
              <Input className="mt-1 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing..." />
              <p className="mt-1 text-[11px] text-gray-400">{loadingSearch ? 'Searching…' : 'Minimum 2 characters'}</p>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setSelectedId(h.id)}
                  className={cn(
                    'block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-white',
                    selectedId === h.id && 'bg-[#E6F7F6]',
                  )}
                >
                  <span className="font-medium text-gray-900">{h.name}</span>
                  <span className="block text-xs text-gray-500">{h.firm_name}</span>
                </button>
              ))}
              {!loadingSearch && q.trim().length >= 2 && hits.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-gray-400">No matches</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full border-[#00A99D] text-xs text-[#00A99D] hover:bg-[#E6F7F6]"
              disabled={!selectedId || busy}
              onClick={() => selectedId && void linkFund(selectedId)}
            >
              Save association
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs text-gray-500">Name *</Label>
              <Input className="mt-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Firm name *</Label>
              <Input className="mt-1 text-sm" value={newFirm} onChange={(e) => setNewFirm(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Email</Label>
              <Input className="mt-1 text-sm" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Phone</Label>
              <Input className="mt-1 text-sm" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">First contact date</Label>
              <Input className="mt-1 text-sm" type="date" value={firstContact} onChange={(e) => setFirstContact(e.target.value)} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full border-[#00A99D] text-xs text-[#00A99D] hover:bg-[#E6F7F6]"
              disabled={busy}
              onClick={() => void submitCreate()}
            >
              Create and link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
