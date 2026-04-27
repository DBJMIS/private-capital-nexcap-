'use client';

import { useCallback, useEffect, useState } from 'react';

import { InvestorCard, type InvestorListRow } from '@/components/investors/InvestorCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { INVESTOR_TYPES, INVESTOR_TYPE_LABELS, type InvestorType } from '@/lib/investors/types';

export function InvestorsListClient({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<InvestorListRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [country, setCountry] = useState('');
  const [minUtil, setMinUtil] = useState('');
  const [maxUtil, setMaxUtil] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [newType, setNewType] = useState<InvestorType>('other');
  const [newCountry, setNewCountry] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    const q = new URLSearchParams();
    q.set('limit', '500');
    if (type) q.set('type', type);
    if (country.trim()) q.set('country', country.trim());
    if (minUtil.trim()) q.set('min_util', minUtil.trim());
    if (maxUtil.trim()) q.set('max_util', maxUtil.trim());
    const res = await fetch(`/api/investors?${q.toString()}`);
    const j = (await res.json()) as { investors?: InvestorListRow[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load');
      return;
    }
    setRows(j.investors ?? []);
  }, [type, country, minUtil, maxUtil]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          investor_type: newType,
          country: newCountry.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Create failed');
        return;
      }
      setName('');
      setNewCountry('');
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {err && <p className="text-sm text-red-700">{err}</p>}

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
        <h2 className="text-sm font-semibold text-navy">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="f_type">Type</Label>
            <select
              id="f_type"
              className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 text-sm text-navy"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All types</option>
              {INVESTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INVESTOR_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f_country">Country</Label>
            <Input id="f_country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Contains…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f_min">Min utilization %</Label>
            <Input id="f_min" inputMode="numeric" value={minUtil} onChange={(e) => setMinUtil(e.target.value)} placeholder="e.g. 0" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f_max">Max utilization %</Label>
            <Input id="f_max" inputMode="numeric" value={maxUtil} onChange={(e) => setMaxUtil(e.target.value)} placeholder="e.g. 50 under-deployed" />
          </div>
        </div>
        <p className="mt-2 text-xs text-navy/50">Filter by utilization to find under-deployed capital (e.g. max 50).</p>
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'Add investor'}
          </Button>
        </div>
      )}

      {showForm && canWrite && (
        <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
          <h3 className="text-sm font-semibold text-navy">New investor</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="n_name">Name</Label>
              <Input id="n_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Institution name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="n_type">Type</Label>
              <select
                id="n_type"
                className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 text-sm"
                value={newType}
                onChange={(e) => setNewType(e.target.value as InvestorType)}
              >
                {INVESTOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INVESTOR_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="n_country">Country</Label>
              <Input id="n_country" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <Button type="button" className="mt-3 bg-navy text-navy-foreground" disabled={busy} onClick={() => void create()}>
            {busy ? 'Saving…' : 'Create'}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <InvestorCard key={r.id} row={r} />
        ))}
      </div>
      {rows.length === 0 && <p className="text-sm text-navy/50">No investors match the filters.</p>}
    </div>
  );
}
