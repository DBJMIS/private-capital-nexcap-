'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { defaultPctuProfile, parsePctuProfile } from '@/lib/portfolio/pctu-profile-parse';
import type { PctuIcMember, PctuManagementTeamMember, PctuPrincipal, PctuProfile } from '@/lib/portfolio/pctu-report-types';
import type { Json } from '@/types/database';

function section(title: string, children: React.ReactNode) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white open:shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-[#0B1F45] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex w-full items-center justify-between gap-2">
          {title}
          <span className="text-xs font-normal text-gray-400 group-open:hidden">Show</span>
          <span className="hidden text-xs font-normal text-gray-400 group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="border-t border-gray-100 px-4 py-4">{children}</div>
    </details>
  );
}

export function FundPctuProfileEditor({
  fundId,
  pctuProfileRaw,
  resetKey,
  onSaved,
}: {
  fundId: string;
  pctuProfileRaw: Json | null;
  resetKey: string;
  onSaved?: () => void;
}) {
  const [profile, setProfile] = useState<PctuProfile>(() => parsePctuProfile(pctuProfileRaw));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setProfile(parsePctuProfile(pctuProfileRaw));
  }, [pctuProfileRaw, resetKey]);

  const setIc = useCallback((patch: Partial<PctuProfile['investment_committee']>) => {
    setProfile((p) => ({ ...p, investment_committee: { ...p.investment_committee, ...patch } }));
  }, []);

  const updateIcMember = useCallback((index: number, next: PctuIcMember) => {
    setProfile((p) => ({
      ...p,
      investment_committee: {
        ...p.investment_committee,
        members: p.investment_committee.members.map((x, j) => (j === index ? next : x)),
      },
    }));
  }, []);

  const removeIcMember = useCallback((index: number) => {
    setProfile((p) => ({
      ...p,
      investment_committee: {
        ...p.investment_committee,
        members: p.investment_committee.members.filter((_, j) => j !== index),
      },
    }));
  }, []);

  const addIcMember = useCallback(() => {
    setProfile((p) => ({
      ...p,
      investment_committee: {
        ...p.investment_committee,
        members: [...p.investment_committee.members, { name: '' }],
      },
    }));
  }, []);

  const save = async () => {
    const ic = profile.investment_committee;
    if (!ic.has_ic) {
      const note = (ic.structure_note ?? '').trim();
      if (!note) {
        setErr('When the fund has no investment committee, explain the structure in the structure note.');
        return;
      }
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pctu_profile: profile as unknown as Json }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Save failed');
      setOk('PCTU profile saved.');
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[#0B1F45]">PCTU quarterly report profile</h3>
        <p className="mt-1 text-xs text-gray-500">Used for the branded PCTU PDF. All sections are optional except the investment committee note when there is no IC.</p>
      </div>
      {err ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}
      {ok ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      {section(
        'Fund profile',
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="pctu_br">Business registration</Label>
            <Input
              id="pctu_br"
              className="mt-1"
              value={profile.business_registration ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, business_registration: e.target.value || null }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pctu_inv">DBJ investment type</Label>
            <Input
              id="pctu_inv"
              className="mt-1"
              value={profile.investment_type ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, investment_type: e.target.value || null }))}
              placeholder='e.g. J$ Cumulative Redeemable Class B Preference Shares'
            />
          </div>
        </div>,
      )}

      {section(
        'Principals',
        <div className="space-y-3">
          {profile.principals.map((row, i) => (
            <PrincipalRow
              key={`p-${i}`}
              row={row}
              onChange={(next) => setProfile((p) => ({ ...p, principals: p.principals.map((x, j) => (j === i ? next : x)) }))}
              onRemove={() => setProfile((p) => ({ ...p, principals: p.principals.filter((_, j) => j !== i) }))}
            />
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setProfile((p) => ({ ...p, principals: [...p.principals, { name: '' }] }))}>
            Add principal
          </Button>
        </div>,
      )}

      {section(
        'Directors',
        <div className="space-y-3">
          {profile.directors.map((row, i) => (
            <div key={`d-${i}`} className="flex gap-2">
              <Input
                className="flex-1"
                value={row.name}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    directors: p.directors.map((x, j) => (j === i ? { name: e.target.value } : x)),
                  }))
                }
                placeholder="Name"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => setProfile((p) => ({ ...p, directors: p.directors.filter((_, j) => j !== i) }))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setProfile((p) => ({ ...p, directors: [...p.directors, { name: '' }] }))}>
            Add director
          </Button>
        </div>,
      )}

      {section(
        'Investment committee',
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={profile.investment_committee.has_ic} onChange={(e) => setIc({ has_ic: e.target.checked })} />
            Fund has an investment committee
          </label>
          <div>
            <Label>Structure / governance note</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={profile.investment_committee.structure_note ?? ''}
              onChange={(e) => setIc({ structure_note: e.target.value || null })}
              placeholder={profile.investment_committee.has_ic ? 'Optional context' : 'Required when no IC'}
            />
          </div>
          {profile.investment_committee.has_ic ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Members</p>
              {profile.investment_committee.members.map((m, i) => (
                <IcMemberRow key={`ic-${i}`} row={m} onChange={(next) => updateIcMember(i, next)} onRemove={() => removeIcMember(i)} />
              ))}
              <Button type="button" size="sm" variant="outline" onClick={addIcMember}>
                Add member
              </Button>
            </div>
          ) : null}
        </div>,
      )}

      {section(
        'Management team (report bios)',
        <div className="space-y-4">
          {profile.management_team.map((row, i) => (
            <MgmtRow
              key={`m-${i}`}
              row={row}
              onChange={(next) => setProfile((p) => ({ ...p, management_team: p.management_team.map((x, j) => (j === i ? next : x)) }))}
              onRemove={() => setProfile((p) => ({ ...p, management_team: p.management_team.filter((_, j) => j !== i) }))}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setProfile((p) => ({ ...p, management_team: [...p.management_team, { name: '', role: '', bio: '' }] }))}
          >
            Add team member
          </Button>
        </div>,
      )}

      {section(
        'ESG notes',
        <div className="space-y-2">
          {profile.esg_notes.map((line, i) => (
            <div key={`e-${i}`} className="flex gap-2">
              <Input
                className="flex-1"
                value={line}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    esg_notes: p.esg_notes.map((x, j) => (j === i ? e.target.value : x)),
                  }))
                }
                placeholder="Bullet point"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => setProfile((p) => ({ ...p, esg_notes: p.esg_notes.filter((_, j) => j !== i) }))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setProfile((p) => ({ ...p, esg_notes: [...p.esg_notes, ''] }))}>
            Add bullet
          </Button>
        </div>,
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" disabled={busy} className="bg-[#0B1F45] hover:bg-[#162d5e]" onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save PCTU profile'}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setProfile(defaultPctuProfile())}>
          Reset form to empty
        </Button>
      </div>
    </div>
  );
}

function PrincipalRow({
  row,
  onChange,
  onRemove,
}: {
  row: PctuPrincipal;
  onChange: (next: PctuPrincipal) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-gray-100 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input className="mt-1" value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
        </div>
        <div>
          <Label>Role</Label>
          <Input className="mt-1" value={row.role ?? ''} onChange={(e) => onChange({ ...row, role: e.target.value || undefined })} />
        </div>
        <div>
          <Label>Departed date</Label>
          <Input
            className="mt-1"
            type="date"
            value={row.departed_date?.slice(0, 10) ?? ''}
            onChange={(e) => onChange({ ...row, departed_date: e.target.value || null })}
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Input className="mt-1" value={row.notes ?? ''} onChange={(e) => onChange({ ...row, notes: e.target.value || undefined })} />
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRemove}>
        Remove principal
      </Button>
    </div>
  );
}

function IcMemberRow({
  row,
  onChange,
  onRemove,
}: {
  row: PctuIcMember;
  onChange: (next: PctuIcMember) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[140px] flex-1">
        <Label className="text-xs">Name</Label>
        <Input className="mt-1" value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
      </div>
      <div className="min-w-[120px] flex-1">
        <Label className="text-xs">Role</Label>
        <Input className="mt-1" value={row.role ?? ''} onChange={(e) => onChange({ ...row, role: e.target.value || undefined })} />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

function MgmtRow({
  row,
  onChange,
  onRemove,
}: {
  row: PctuManagementTeamMember;
  onChange: (next: PctuManagementTeamMember) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-gray-100 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input className="mt-1" value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
        </div>
        <div>
          <Label>Role</Label>
          <Input className="mt-1" value={row.role} onChange={(e) => onChange({ ...row, role: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Bio</Label>
        <Textarea className="mt-1" rows={3} value={row.bio} onChange={(e) => onChange({ ...row, bio: e.target.value })} />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
