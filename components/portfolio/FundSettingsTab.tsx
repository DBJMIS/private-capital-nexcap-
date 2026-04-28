'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { FundCategoryValue } from '@/lib/portfolio/fund-category';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';

/** Matches Fund Settings cards — reuse in `FundPctuProfileEditor` for visual continuity */
export const FUND_SETTINGS_FIELD_CLASS =
  'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:border-[#0B1F45] focus:ring-2 focus:ring-[#0B1F45]/10 focus:outline-none';

const FIELD = FUND_SETTINGS_FIELD_CLASS;

export type FundContactRow = {
  name: string;
  role: string;
  email: string;
  phone: string;
};

function parseContacts(raw: unknown): FundContactRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const o = c as Record<string, unknown>;
    return {
      name: String(o.name ?? ''),
      role: String(o.role ?? ''),
      email: String(o.email ?? ''),
      phone: String(o.phone ?? ''),
    };
  });
}

function serializeContacts(rows: FundContactRow[]): FundContactRow[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      role: r.role.trim(),
      email: r.email.trim(),
      phone: r.phone.trim(),
    }))
    .filter((r) => r.name || r.role || r.email || r.phone);
}

function formatLastSaved(iso: string | undefined): string {
  if (!iso) return 'Never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Unknown';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ymdForInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

export const FUND_SETTINGS_SECTION_IDS = {
  identity: 'fund-settings-identity',
  commitment: 'fund-settings-commitment',
  cadence: 'fund-settings-cadence',
  contacts: 'fund-settings-contacts',
} as const;

type SectionKey = keyof typeof FUND_SETTINGS_SECTION_IDS;

export const FUND_SETTINGS_NAV_ITEMS: { key: SectionKey; label: string }[] = [
  { key: 'identity', label: 'Fund Identity' },
  { key: 'commitment', label: 'Commitment' },
  { key: 'cadence', label: 'Reporting Cadence' },
  { key: 'contacts', label: 'Contacts & Notes' },
];

const SECTION_IDS = FUND_SETTINGS_SECTION_IDS;

const CATEGORY_OPTIONS: { value: FundCategoryValue; label: string }[] = [
  { value: 'sme_fund', label: 'SME Fund' },
  { value: 'growth_equity', label: 'Growth Equity' },
  { value: 'private_credit', label: 'Private Credit' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'special_situation', label: 'Special Situation' },
  { value: 'bigge_fund', label: 'Bigge Fund' },
  { value: 'angel', label: 'Angel' },
];

const REPORT_TILES: {
  name: 'requires_quarterly_financial' | 'requires_quarterly_inv_mgmt' | 'requires_audited_annual' | 'requires_inhouse_quarterly';
  title: string;
  description: string;
}[] = [
  {
    name: 'requires_quarterly_financial',
    title: 'Quarterly Financial',
    description: 'Unaudited quarterly financial statements',
  },
  {
    name: 'requires_quarterly_inv_mgmt',
    title: 'Investment Management',
    description: 'Quarterly investment management reports',
  },
  {
    name: 'requires_audited_annual',
    title: 'Audited Annual',
    description: 'Annual audited financial statements',
  },
  {
    name: 'requires_inhouse_quarterly',
    title: 'In-house Quarterly',
    description: 'DBJ internal quarterly assessment',
  },
];

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function FundSettingsTab({
  fund,
  saveSettings,
  busy,
}: {
  fund: PortfolioFundRow;
  saveSettings: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  busy: boolean;
}) {
  const [formNonce, setFormNonce] = useState(0);
  const formKey = `${fund.updated_at}-${formNonce}`;

  useEffect(() => {
    setFormNonce(0);
  }, [fund.updated_at]);

  const [currency, setCurrency] = useState(fund.currency);
  const [isPvc, setIsPvc] = useState(Boolean(fund.is_pvc));
  const [contacts, setContacts] = useState<FundContactRow[]>(() => parseContacts(fund.contacts));

  useEffect(() => {
    setCurrency(fund.currency);
    setIsPvc(Boolean(fund.is_pvc));
    setContacts(parseContacts(fund.contacts));
    // Reset draft fields when form remount key changes (cancel / server refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only formKey
  }, [formKey]);

  const contactsJson = useMemo(() => JSON.stringify(serializeContacts(contacts)), [contacts]);

  const cur = currency === 'JMD' ? 'JMD' : 'USD';

  const handleCancel = () => {
    setFormNonce((n) => n + 1);
  };

  return (
        <form key={formKey} onSubmit={(e) => void saveSettings(e)} className="space-y-4">
          <input type="hidden" name="contacts_json" value={contactsJson} readOnly aria-hidden />
          {currency !== 'JMD' ? (
            <input type="hidden" name="exchange_rate_jmd_usd" value={String(fund.exchange_rate_jmd_usd ?? 157)} readOnly aria-hidden />
          ) : null}

          <div className="sticky top-0 z-10 -mx-1 mb-4 border-b border-gray-100 bg-white/90 px-1 py-3 backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#0B1F45]">Fund Settings</p>
                <p className="text-xs text-gray-400">Last saved {formatLastSaved(fund.updated_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy} className="bg-[#0B1F45] hover:bg-[#162d5e]">
                  {busy ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>

          {/* Card 1 */}
          <section
            id={SECTION_IDS.identity}
            className="scroll-mt-28 overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Fund Identity</h2>
              <p className="text-xs text-gray-400">Core identification and classification</p>
            </header>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="fund_name" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Fund name
                </label>
                <input id="fund_name" name="fund_name" required defaultValue={fund.fund_name} className={FIELD} />
              </div>
              <div>
                <label htmlFor="manager_name" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Manager name
                </label>
                <input id="manager_name" name="manager_name" required defaultValue={fund.manager_name} className={FIELD} />
              </div>
              <div>
                <label htmlFor="fund_representative" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Fund representative
                </label>
                <input
                  id="fund_representative"
                  name="fund_representative"
                  defaultValue={fund.fund_representative ?? ''}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="currency" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Currency
                </label>
                <select
                  id="currency"
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value === 'JMD' ? 'JMD' : 'USD')}
                  className={FIELD}
                >
                  <option value="USD">USD</option>
                  <option value="JMD">JMD</option>
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <span className="mb-1.5 block text-xs font-medium text-gray-500">Listed</span>
                <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <input id="listed" name="listed" type="checkbox" defaultChecked={fund.listed} className="accent-[#0B1F45]" />
                  <span className="text-sm text-gray-800">Listed on a stock exchange</span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="fund_category" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Fund category
                </label>
                <select
                  id="fund_category"
                  name="fund_category"
                  defaultValue={fund.fund_category ?? ''}
                  className={FIELD}
                >
                  <option value="">Uncategorised</option>
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Card 2 */}
          <section
            id={SECTION_IDS.commitment}
            className="scroll-mt-28 overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Commitment</h2>
              <p className="text-xs text-gray-400">Financial commitment details</p>
            </header>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
              <div>
                <label htmlFor="total_fund_commitment" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Total fund commitment
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {cur}
                  </span>
                  <input
                    id="total_fund_commitment"
                    name="total_fund_commitment"
                    type="number"
                    step="any"
                    required
                    defaultValue={String(fund.total_fund_commitment)}
                    className={cn(FIELD, 'pl-11')}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="dbj_commitment" className="mb-1.5 block text-xs font-medium text-gray-500">
                  DBJ commitment
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {cur}
                  </span>
                  <input
                    id="dbj_commitment"
                    name="dbj_commitment"
                    type="number"
                    step="any"
                    required
                    defaultValue={String(fund.dbj_commitment)}
                    className={cn(FIELD, 'pl-11')}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="dbj_pro_rata_pct" className="mb-1.5 block text-xs font-medium text-gray-500">
                  DBJ pro-rata
                </label>
                <div className="relative">
                  <input
                    id="dbj_pro_rata_pct"
                    name="dbj_pro_rata_pct"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={String(fund.dbj_pro_rata_pct)}
                    className={cn(FIELD, 'pr-9')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                </div>
              </div>
              {currency === 'JMD' ? (
                <div>
                  <label htmlFor="exchange_rate_jmd_usd" className="mb-1.5 block text-xs font-medium text-gray-500">
                    Exchange rate (JMD/USD)
                  </label>
                  <input
                    id="exchange_rate_jmd_usd"
                    name="exchange_rate_jmd_usd"
                    type="number"
                    step="0.01"
                    defaultValue={String(fund.exchange_rate_jmd_usd ?? 157)}
                    className={FIELD}
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor="commitment_date" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Commitment date
                </label>
                <input
                  id="commitment_date"
                  name="commitment_date"
                  type="date"
                  defaultValue={ymdForInput(fund.commitment_date)}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="fund_end_date" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Fund end date <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="fund_end_date"
                  name="fund_end_date"
                  type="date"
                  disabled={isPvc}
                  defaultValue={ymdForInput(fund.fund_end_date ?? undefined)}
                  className={cn(FIELD, isPvc && 'cursor-not-allowed bg-gray-50 text-gray-500')}
                />
              </div>
              <div className="md:col-span-3">
                <label className="inline-flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <input
                    name="is_pvc"
                    type="checkbox"
                    checked={isPvc}
                    onChange={(e) => setIsPvc(e.target.checked)}
                    className="mt-0.5 accent-[#0B1F45]"
                  />
                  <span>
                    <span className="text-sm font-medium text-gray-800">Permanent Capital Vehicle (PCV)</span>
                    {isPvc ? (
                      <span className="mt-1 block text-xs text-gray-400">If PCV, fund end date is not applicable.</span>
                    ) : null}
                  </span>
                </label>
              </div>
            </div>
          </section>

          {/* Card 3 */}
          <section
            id={SECTION_IDS.cadence}
            className="scroll-mt-28 overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Reporting Cadence</h2>
              <p className="text-xs text-gray-400">Report schedule and due day rules</p>
            </header>
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="quarterly_report_due_days" className="mb-1.5 block text-xs font-medium text-gray-500">
                    Quarterly reports due
                  </label>
                  <div className="relative">
                    <input
                      id="quarterly_report_due_days"
                      name="quarterly_report_due_days"
                      type="number"
                      defaultValue={fund.quarterly_report_due_days}
                      className={cn(FIELD, 'pr-[11rem]')}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 max-w-[10.5rem] -translate-y-1/2 text-right text-xs text-gray-400">
                      days after quarter end
                    </span>
                  </div>
                </div>
                <div>
                  <label htmlFor="audit_report_due_days" className="mb-1.5 block text-xs font-medium text-gray-500">
                    Audit report due
                  </label>
                  <div className="relative">
                    <input
                      id="audit_report_due_days"
                      name="audit_report_due_days"
                      type="number"
                      defaultValue={fund.audit_report_due_days}
                      className={cn(FIELD, 'pr-[10.5rem]')}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 max-w-[10rem] -translate-y-1/2 text-right text-xs text-gray-400">
                      days after year end
                    </span>
                  </div>
                </div>
              </div>
              <div className="max-w-md">
                <label htmlFor="year_end_month" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Year end month
                </label>
                <select
                  id="year_end_month"
                  name="year_end_month"
                  defaultValue={fund.year_end_month}
                  className={FIELD}
                >
                  {MONTH_LONG.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Required submissions</p>
                <p className="mb-3 text-xs text-gray-400">Select which report types this fund must submit</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REPORT_TILES.map((tile) => (
                    <label
                      key={tile.name}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition-colors hover:border-[#0B1F45]/30',
                        'has-[:checked]:border-[#0B1F45] has-[:checked]:bg-[#0B1F45]/5',
                      )}
                    >
                      <input
                        type="checkbox"
                        name={tile.name}
                        defaultChecked={
                          tile.name === 'requires_quarterly_financial'
                            ? fund.requires_quarterly_financial
                            : tile.name === 'requires_quarterly_inv_mgmt'
                              ? fund.requires_quarterly_inv_mgmt
                              : tile.name === 'requires_audited_annual'
                                ? fund.requires_audited_annual
                                : fund.requires_inhouse_quarterly
                        }
                        className="mt-0.5 accent-[#0B1F45]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{tile.title}</span>
                        <span className="mt-0.5 block text-xs text-gray-400">{tile.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Card 4 */}
          <section
            id={SECTION_IDS.contacts}
            className="scroll-mt-28 overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-[#0B1F45]">Contacts & Notes</h2>
              <p className="text-xs text-gray-400">Fund manager contacts and internal notes</p>
            </header>
            <div className="space-y-5 p-5">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-500">Contacts</span>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]"
                    onClick={() => setContacts((rows) => [...rows, { name: '', role: '', email: '', phone: '' }])}
                  >
                    + Add contact
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-sm italic text-gray-400">
                    No contacts added yet
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {contacts.map((row, idx) => (
                      <li key={idx} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                        <input
                          aria-label={`Contact ${idx + 1} name`}
                          value={row.name}
                          onChange={(e) =>
                            setContacts((rows) => rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                          }
                          placeholder="Name"
                          className={cn(FIELD, 'sm:flex-1')}
                        />
                        <input
                          aria-label={`Contact ${idx + 1} role`}
                          value={row.role}
                          onChange={(e) =>
                            setContacts((rows) => rows.map((r, i) => (i === idx ? { ...r, role: e.target.value } : r)))
                          }
                          placeholder="Role"
                          className={cn(FIELD, 'sm:flex-1')}
                        />
                        <input
                          aria-label={`Contact ${idx + 1} email`}
                          value={row.email}
                          onChange={(e) =>
                            setContacts((rows) => rows.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))
                          }
                          placeholder="Email"
                          type="email"
                          className={cn(FIELD, 'sm:flex-1')}
                        />
                        <input
                          aria-label={`Contact ${idx + 1} phone`}
                          value={row.phone}
                          onChange={(e) =>
                            setContacts((rows) => rows.map((r, i) => (i === idx ? { ...r, phone: e.target.value } : r)))
                          }
                          placeholder="Phone"
                          className={cn(FIELD, 'sm:flex-1')}
                        />
                        <button
                          type="button"
                          className="shrink-0 self-end text-gray-400 hover:text-red-500 sm:self-start"
                          aria-label={`Remove contact ${idx + 1}`}
                          onClick={() => setContacts((rows) => rows.filter((_, i) => i !== idx))}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label htmlFor="notes" className="mb-1.5 block text-xs font-medium text-gray-500">
                  Internal notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  placeholder="Internal notes about this fund…"
                  defaultValue={fund.notes ?? ''}
                  className={FIELD}
                />
              </div>
            </div>
          </section>
        </form>
  );
}
