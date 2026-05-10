'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ContactManagementPanelProps {
  fundManagerId: string;
  firmName: string;
  applicationId?: string;
  /** Portfolio fund context (e.g. staff fund detail) — stored on invitation metadata for registration. */
  portfolioFundId?: string;
  /** When false, contact list shows but no add/invite/resend controls. */
  readonly?: boolean;
}

type FundManagerContactRow = {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  is_primary: boolean;
  portal_access: boolean;
  portal_user_id: string | null;
  invited_at: string | null;
  last_login_at: string | null;
};

function parseJsonMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = (raw as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim().length > 0 ? msg.trim() : null;
}

function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const raw = iso.includes('T') ? iso : `${iso}T12:00:00`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ContactListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1].map((k) => (
        <div key={k} className="animate-pulse rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-gray-200" />
              <div className="h-3 w-full max-w-[12rem] rounded bg-gray-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactManagementPanel(props: ContactManagementPanelProps) {
  const { fundManagerId, firmName, applicationId, portfolioFundId, readonly = false } = props;

  const [contacts, setContacts] = useState<FundManagerContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addPrimary, setAddPrimary] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [rowErrId, setRowErrId] = useState<{ id: string; msg: string } | null>(null);

  const canMutate = !readonly;

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch(`/api/fund-managers/${encodeURIComponent(fundManagerId)}/contacts`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadErr(parseJsonMessage(json) ?? 'Could not load contacts.');
        setContacts([]);
        return;
      }
      if (
        json &&
        typeof json === 'object' &&
        'contacts' in json &&
        Array.isArray((json as { contacts: unknown }).contacts)
      ) {
        const parsed = ((json as { contacts: unknown[] }).contacts ?? [])
          .map(normalizeContact)
          .filter((c): c is FundManagerContactRow => c !== null);
        setContacts(parsed);
        return;
      }
      setLoadErr('Invalid response.');
      setContacts([]);
    } catch {
      setLoadErr('Network error.');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [fundManagerId]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const dismissFlash = useCallback(() => setFlashOk(null), []);

  useEffect(() => {
    if (!flashOk) return;
    const id = window.setTimeout(() => setFlashOk(null), 4500);
    return () => window.clearTimeout(id);
  }, [flashOk]);

  const submitAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) return;
    setAddErr(null);
    const nameTrim = addName.trim();
    const emailTrim = addEmail.trim().toLowerCase();
    if (!nameTrim || !emailTrim) {
      setAddErr('Full name and email are required.');
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch(`/api/fund-managers/${encodeURIComponent(fundManagerId)}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          full_name: nameTrim,
          email: emailTrim,
          title: addTitle.trim() || undefined,
          is_primary: addPrimary,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setAddErr(parseJsonMessage(json) ?? `Could not add contact (${res.status}).`);
        return;
      }
      setAddOpen(false);
      setAddName('');
      setAddEmail('');
      setAddTitle('');
      setAddPrimary(false);
      await loadContacts();
    } catch {
      setAddErr('Network error.');
    } finally {
      setAddBusy(false);
    }
  };

  async function inviteContact(contact: FundManagerContactRow) {
    if (!canMutate) return;
    setRowErrId(null);
    setFlashOk(null);
    const previous = contacts.slice();
    const optimisticAt = new Date().toISOString();
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contact.id
          ? {
              ...c,
              invited_at: c.portal_access ? c.invited_at : optimisticAt,
              portal_access: c.portal_access,
            }
          : c,
      ),
    );
    setInviteBusyId(contact.id);
    try {
      const hasApplicationId = typeof applicationId === 'string' && applicationId.trim().length > 0;
      const hasPortfolioFundId = typeof portfolioFundId === 'string' && portfolioFundId.trim().length > 0;
      const inviteBody: { application_id?: string; portfolio_fund_id?: string } = {};
      if (hasApplicationId) inviteBody.application_id = applicationId!.trim();
      if (hasPortfolioFundId) inviteBody.portfolio_fund_id = portfolioFundId!.trim();
      const useJsonBody = hasApplicationId || hasPortfolioFundId;

      const res = await fetch(
        `/api/fund-managers/${encodeURIComponent(fundManagerId)}/contacts/${encodeURIComponent(contact.id)}/invite`,
        {
          method: 'POST',
          credentials: 'same-origin',
          ...(useJsonBody
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inviteBody),
              }
            : {}),
        },
      );
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setContacts(previous);
        setRowErrId({ id: contact.id, msg: parseJsonMessage(json) ?? `Request failed (${res.status}).` });
        setInviteBusyId(null);
        return;
      }

      let msg: string;
      const body = json as { type?: unknown; sent?: unknown };
      if (body.sent === true && body.type === 'registration_invitation') {
        msg = `Invitation sent to ${contact.email.trim()}`;
      } else if (body.sent === true && body.type === 'new_fund_notification') {
        msg = `Portal notification sent to ${contact.email.trim()}`;
      } else {
        msg = `Message sent to ${contact.email.trim()}`;
      }

      await loadContacts();
      setInviteBusyId(null);
      setFlashOk(msg);
    } catch {
      setContacts(previous);
      setRowErrId({ id: contact.id, msg: 'Network error.' });
      setInviteBusyId(null);
    }
  }

  const addHeaderButtonClasses =
    'h-8 border-[#00A99D] px-3 text-xs text-[#00A99D] hover:bg-[#E6F7F6] shrink-0';

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Portal Access</p>
          <p className="mt-0.5 text-xs text-gray-400">Manage who from {firmName} can access the NexCap Fund Manager Portal</p>
        </div>
        {canMutate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={addHeaderButtonClasses}
            onClick={() => {
              setAddErr(null);
              setAddOpen((o) => !o);
            }}
          >
            Add Contact
          </Button>
        ) : null}
      </div>

      {flashOk ? (
        <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900" role="status">
          {flashOk}{' '}
          <button type="button" className="underline hover:no-underline" onClick={() => dismissFlash()}>
            Dismiss
          </button>
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4">
          <ContactListSkeleton />
        </div>
      ) : loadErr ? (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{loadErr}</div>
      ) : contacts.length === 0 ? (
        <div className="mt-4 space-y-2 text-center">
          <p className="text-sm text-gray-400">No contacts added yet</p>
          <p className="text-xs text-gray-400">Add the first contact to enable portal access</p>
          {canMutate ? (
            <Button type="button" variant="outline" size="sm" className={`mx-auto ${addHeaderButtonClasses}`} onClick={() => setAddOpen(true)}>
              Add Contact
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-4 list-none space-y-3 p-0">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-4">
                <div className="flex min-w-0 flex-row gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-teal-50 text-sm font-medium text-teal-700"
                    aria-hidden
                  >
                    {initialsFromName(c.full_name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{c.full_name}</span>
                      {c.is_primary ? (
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">Primary</span>
                      ) : null}
                    </div>
                    {c.title?.trim() ? <p className="text-xs text-gray-400">{c.title.trim()}</p> : null}
                    <p className="text-xs text-gray-500">{c.email}</p>
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2 border-t border-gray-50 pt-3 md:w-auto md:items-end md:border-t-0 md:pt-0">
                  {c.portal_access ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" aria-hidden />
                        Active
                      </div>
                      {c.last_login_at ? (
                        <p className="text-xs text-gray-400">Last login: {formatDisplayDate(c.last_login_at)}</p>
                      ) : (
                        <p className="text-xs text-gray-300">Never logged in</p>
                      )}
                    </>
                  ) : c.invited_at ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        Invited
                      </div>
                      <p className="text-xs text-gray-400">Sent {formatDisplayDate(c.invited_at)}</p>
                      {canMutate ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full justify-start px-2 text-xs text-gray-600 hover:bg-gray-100 md:w-auto md:justify-end"
                          disabled={inviteBusyId !== null}
                          onClick={() => void inviteContact(c)}
                        >
                          {inviteBusyId === c.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Spinner />
                              Sending…
                            </span>
                          ) : (
                            'Resend'
                          )}
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300" aria-hidden />
                        No access
                      </div>
                      {canMutate ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`w-full md:w-auto ${addHeaderButtonClasses}`}
                          disabled={inviteBusyId !== null}
                          onClick={() => void inviteContact(c)}
                        >
                          {inviteBusyId === c.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Spinner />
                              Sending…
                            </span>
                          ) : (
                            'Send Invite'
                          )}
                        </Button>
                      ) : null}
                    </>
                  )}
                  {rowErrId?.id === c.id ? <p className="text-xs font-medium text-red-600">{rowErrId.msg}</p> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addOpen ? (
        <form
          onSubmit={(e) => void submitAddContact(e)}
          className="mt-4 space-y-3 rounded-xl border border-gray-100 bg-gray-50/90 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add contact</p>
          {addErr ? <p className="text-xs font-medium text-red-600">{addErr}</p> : null}
          <label className="block text-xs font-medium text-gray-700">
            Full name
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className={cn(
                'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-[#00A99D]/30 focus-visible:ring-2',
              )}
              required
              autoComplete="name"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Email
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-[#00A99D]/30 focus-visible:ring-2"
              required
              autoComplete="email"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Title (optional)
            <input
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-[#00A99D]/30 focus-visible:ring-2"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={addPrimary} onChange={(e) => setAddPrimary(e.target.checked)} className="rounded border-gray-300" />
            Primary contact
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="submit"
              size="sm"
              className="h-8 bg-[#00A99D] text-white hover:bg-[#008f85]"
              disabled={addBusy}
            >
              {addBusy ? 'Adding…' : 'Add'}
            </Button>
            <button type="button" className="text-xs font-medium text-gray-600 underline hover:no-underline" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function normalizeContact(raw: unknown): FundManagerContactRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.full_name !== 'string' || typeof o.email !== 'string') return null;
  if (!(o.title === null || typeof o.title === 'string')) return null;
  if (typeof o.portal_access !== 'boolean') return null;
  if (!(o.portal_user_id === null || typeof o.portal_user_id === 'string')) return null;
  if (!(o.invited_at === null || typeof o.invited_at === 'string')) return null;
  if (!(o.last_login_at === null || typeof o.last_login_at === 'string')) return null;
  return {
    id: o.id,
    full_name: o.full_name,
    email: o.email,
    title: o.title,
    is_primary: typeof o.is_primary === 'boolean' ? o.is_primary : false,
    portal_access: o.portal_access,
    portal_user_id: o.portal_user_id,
    invited_at: o.invited_at,
    last_login_at: o.last_login_at,
  };
}
