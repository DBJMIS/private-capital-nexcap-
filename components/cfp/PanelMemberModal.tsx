'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dsButton, dsField } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';
import type { CfpApplicationListRow } from '@/lib/cfp/detail-data';

type PanelRow = {
  id: string;
  member_name: string;
  member_organisation: string | null;
  member_email: string | null;
  member_type: string;
  is_fund_manager: boolean;
  excluded_application_ids: string[] | null;
  nda_signed: boolean;
  nda_signed_date: string | null;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  cfpId: string;
  member: PanelRow | null;
  applications: CfpApplicationListRow[];
  onClose: () => void;
  onSaved: () => void;
};

export function PanelMemberModal({ open, mode, cfpId, member, applications, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [memberType, setMemberType] = useState<'voting' | 'observer'>('voting');
  const [isFm, setIsFm] = useState(false);
  const [nda, setNda] = useState(false);
  const [ndaDate, setNdaDate] = useState('');
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && member) {
      setName(member.member_name ?? '');
      setOrg(member.member_organisation ?? '');
      setEmail(member.member_email ?? '');
      setMemberType(member.member_type === 'observer' ? 'observer' : 'voting');
      setIsFm(!!member.is_fund_manager);
      setNda(!!member.nda_signed);
      setNdaDate(member.nda_signed_date ?? '');
      const ex: Record<string, boolean> = {};
      for (const id of member.excluded_application_ids ?? []) ex[id] = true;
      setExcluded(ex);
    } else {
      setName('');
      setOrg('');
      setEmail('');
      setMemberType('voting');
      setIsFm(false);
      setNda(false);
      setNdaDate('');
      setExcluded({});
    }
    setErr(null);
  }, [open, mode, member]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const excludedIds = Object.entries(excluded).filter(([, v]) => v).map(([k]) => k);

  const save = async () => {
    setErr(null);
    const n = name.trim();
    if (!n) {
      setErr('Name is required.');
      return;
    }
    const body = {
      member_name: n,
      member_organisation: org.trim() || null,
      member_email: email.trim() || null,
      member_type: memberType,
      is_fund_manager: isFm,
      excluded_application_ids: isFm ? excludedIds : [],
      nda_signed: nda,
      nda_signed_date: nda && ndaDate.trim() ? ndaDate.trim() : null,
    };

    setBusy(true);
    try {
      const url =
        mode === 'create' ? `/api/cfp/${cfpId}/panel-members` : `/api/cfp/${cfpId}/panel-members/${member?.id}`;
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Request failed');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F45]/40 p-4">
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <button type="button" className="absolute right-4 top-4 text-gray-500 hover:text-gray-700" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <h2 className="pr-10 text-lg font-semibold text-[#0B1F45]">{mode === 'create' ? 'Add panel member' : 'Edit panel member'}</h2>
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="pm-name">
              Name <span className={dsField.required}>*</span>
            </Label>
            <Input id="pm-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </div>
          <div>
            <Label htmlFor="pm-org">Organisation</Label>
            <Input id="pm-org" className="mt-1" value={org} onChange={(e) => setOrg(e.target.value)} disabled={busy} />
          </div>
          <div>
            <Label htmlFor="pm-email">Email</Label>
            <Input id="pm-email" type="email" className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Type</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="pm-type" checked={memberType === 'voting'} onChange={() => setMemberType('voting')} disabled={busy} />
                Voting Member
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="pm-type" checked={memberType === 'observer'} onChange={() => setMemberType('observer')} disabled={busy} />
                Observer
              </label>
            </div>
          </fieldset>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-[#F3F4F6] px-3 py-2">
            <span className="text-sm text-gray-800">Is this member also a fund manager?</span>
            <button
              type="button"
              role="switch"
              aria-checked={isFm}
              className={cn(
                'relative h-7 w-12 rounded-full transition-colors',
                isFm ? 'bg-[#0F8A6E]' : 'bg-gray-300',
              )}
              onClick={() => setIsFm((v) => !v)}
              disabled={busy}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                  isFm ? 'left-5' : 'left-0.5',
                )}
              />
            </button>
          </div>
          {isFm && applications.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-gray-800">Exclude from evaluating which applications?</p>
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                {applications.map((a) => (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={!!excluded[a.id]}
                        onChange={(e) => setExcluded((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                        disabled={busy}
                      />
                      <span>
                        <span className="font-medium text-[#0B1F45]">{a.fund_name}</span>
                        <span className="block text-xs text-gray-500">{a.id}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-[#F3F4F6] px-3 py-2">
            <span className="text-sm text-gray-800">NDA signed?</span>
            <button
              type="button"
              role="switch"
              aria-checked={nda}
              className={cn('relative h-7 w-12 rounded-full transition-colors', nda ? 'bg-[#0F8A6E]' : 'bg-gray-300')}
              onClick={() => setNda((v) => !v)}
              disabled={busy}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                  nda ? 'left-5' : 'left-0.5',
                )}
              />
            </button>
          </div>
          {nda ? (
            <div>
              <Label htmlFor="pm-nda-date">NDA signed date</Label>
              <Input id="pm-nda-date" type="date" className="mt-1" value={ndaDate} onChange={(e) => setNdaDate(e.target.value)} disabled={busy} />
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className={dsButton.primary} disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : mode === 'create' ? 'Add member' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
