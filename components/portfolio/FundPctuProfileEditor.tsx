'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FUND_SETTINGS_FIELD_CLASS } from '@/components/portfolio/FundSettingsTab';
import { defaultPctuProfile, parsePctuProfile } from '@/lib/portfolio/pctu-profile-parse';
import type { PctuIcMember, PctuManagementTeamMember, PctuPrincipal, PctuProfile } from '@/lib/portfolio/pctu-report-types';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';

const L = 'mb-1.5 block text-xs font-medium text-gray-500';
const FIELD = FUND_SETTINGS_FIELD_CLASS;
const TEXTAREA = cn(FIELD, 'min-h-[88px] resize-y');

type PctuPanelId =
  | 'pctu-section-fund-profile'
  | 'pctu-section-principals'
  | 'pctu-section-directors'
  | 'pctu-section-investment-committee'
  | 'pctu-section-management-team'
  | 'pctu-section-esg-notes';

function initialOpenState(): Record<PctuPanelId, boolean> {
  return {
    'pctu-section-fund-profile': false,
    'pctu-section-principals': false,
    'pctu-section-directors': false,
    'pctu-section-investment-committee': false,
    'pctu-section-management-team': false,
    'pctu-section-esg-notes': false,
  };
}

function PctuCard({
  id,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  id: PctuPanelId;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#0B1F45]">{title}</div>
          <div className="mt-0.5 text-xs text-gray-400">{description}</div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open ? 'rotate-0' : '-rotate-90')}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-4 p-5">{children}</div> : null}
    </section>
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
  const [openPanels, setOpenPanels] = useState<Record<PctuPanelId, boolean>>(initialOpenState);

  useEffect(() => {
    setProfile(parsePctuProfile(pctuProfileRaw));
    setOpenPanels(initialOpenState());
  }, [pctuProfileRaw, resetKey]);

  const toggle = useCallback((id: PctuPanelId) => {
    setOpenPanels((p) => ({ ...p, [id]: !p[id] }));
  }, []);

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
    <div className="space-y-4">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      <PctuCard
        id="pctu-section-fund-profile"
        title="Fund profile"
        description="Legal identifiers and instrument wording for the PDF cover."
        open={openPanels['pctu-section-fund-profile']}
        onToggle={() => toggle('pctu-section-fund-profile')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="pctu_br" className={L}>
              Business registration
            </label>
            <input
              id="pctu_br"
              className={FIELD}
              value={profile.business_registration ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, business_registration: e.target.value || null }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pctu_inv" className={L}>
              DBJ investment type
            </label>
            <input
              id="pctu_inv"
              className={FIELD}
              value={profile.investment_type ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, investment_type: e.target.value || null }))}
              placeholder="e.g. J$ Cumulative Redeemable Class B Preference Shares"
            />
          </div>
        </div>
      </PctuCard>

      <PctuCard
        id="pctu-section-principals"
        title="Principals"
        description="Key principals listed in the quarterly report."
        open={openPanels['pctu-section-principals']}
        onToggle={() => toggle('pctu-section-principals')}
      >
        <div className="space-y-4">
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
        </div>
      </PctuCard>

      <PctuCard
        id="pctu-section-directors"
        title="Directors"
        description="Directors as printed in the report."
        open={openPanels['pctu-section-directors']}
        onToggle={() => toggle('pctu-section-directors')}
      >
        <div className="space-y-3">
          {profile.directors.map((row, i) => (
            <div key={`d-${i}`} className="flex gap-2">
              <input
                className={cn(FIELD, 'flex-1')}
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
        </div>
      </PctuCard>

      <PctuCard
        id="pctu-section-investment-committee"
        title="Investment committee"
        description="Governance disclosure for IC structure and members."
        open={openPanels['pctu-section-investment-committee']}
        onToggle={() => toggle('pctu-section-investment-committee')}
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={profile.investment_committee.has_ic} onChange={(e) => setIc({ has_ic: e.target.checked })} className="accent-[#0B1F45]" />
            Fund has an investment committee
          </label>
          <div>
            <label htmlFor="pctu_ic_note" className={L}>
              Structure / governance note
            </label>
            <textarea
              id="pctu_ic_note"
              className={TEXTAREA}
              rows={3}
              value={profile.investment_committee.structure_note ?? ''}
              onChange={(e) => setIc({ structure_note: e.target.value || null })}
              placeholder={profile.investment_committee.has_ic ? 'Optional context' : 'Required when no IC'}
            />
          </div>
          {profile.investment_committee.has_ic ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Members</p>
              {profile.investment_committee.members.map((m, i) => (
                <IcMemberRow key={`ic-${i}`} row={m} onChange={(next) => updateIcMember(i, next)} onRemove={() => removeIcMember(i)} />
              ))}
              <Button type="button" size="sm" variant="outline" onClick={addIcMember}>
                Add member
              </Button>
            </div>
          ) : null}
        </div>
      </PctuCard>

      <PctuCard
        id="pctu-section-management-team"
        title="Management team (report bios)"
        description="Names, roles, and bios shown in the report."
        open={openPanels['pctu-section-management-team']}
        onToggle={() => toggle('pctu-section-management-team')}
      >
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
        </div>
      </PctuCard>

      <PctuCard
        id="pctu-section-esg-notes"
        title="ESG notes"
        description="Bullet points printed under environmental / social / governance."
        open={openPanels['pctu-section-esg-notes']}
        onToggle={() => toggle('pctu-section-esg-notes')}
      >
        <div className="space-y-3">
          {profile.esg_notes.map((line, i) => (
            <div key={`e-${i}`} className="flex gap-2">
              <input
                className={cn(FIELD, 'flex-1')}
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
        </div>
      </PctuCard>

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
    <div className="space-y-3 rounded-lg border border-gray-100 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={L}>Name</label>
          <input className={FIELD} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
        </div>
        <div>
          <label className={L}>Role</label>
          <input className={FIELD} value={row.role ?? ''} onChange={(e) => onChange({ ...row, role: e.target.value || undefined })} />
        </div>
        <div>
          <label className={L}>Departed date</label>
          <input
            className={FIELD}
            type="date"
            value={row.departed_date?.slice(0, 10) ?? ''}
            onChange={(e) => onChange({ ...row, departed_date: e.target.value || null })}
          />
        </div>
        <div>
          <label className={L}>Notes</label>
          <input className={FIELD} value={row.notes ?? ''} onChange={(e) => onChange({ ...row, notes: e.target.value || undefined })} />
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
        <label className={L}>Name</label>
        <input className={FIELD} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
      </div>
      <div className="min-w-[120px] flex-1">
        <label className={L}>Role</label>
        <input className={FIELD} value={row.role ?? ''} onChange={(e) => onChange({ ...row, role: e.target.value || undefined })} />
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
    <div className="space-y-3 rounded-lg border border-gray-100 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={L}>Name</label>
          <input className={FIELD} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
        </div>
        <div>
          <label className={L}>Role</label>
          <input className={FIELD} value={row.role} onChange={(e) => onChange({ ...row, role: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={L}>Bio</label>
        <textarea className={TEXTAREA} rows={3} value={row.bio} onChange={(e) => onChange({ ...row, bio: e.target.value })} />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
