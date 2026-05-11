'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCapitalCurrency } from '@/lib/portfolio/format-capital-currency';
import { mapCoinvestorRow } from '@/lib/portfolio/capital-structure-data';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type { CapitalStructureData, Coinvestor, FundSizeStatus } from '@/types/capital-structure';
import type { VcFundCoinvestor } from '@/types/database';

const INVESTOR_TYPES = [
  'DFI',
  'Commercial Bank',
  'Pension Fund',
  'Insurance Company',
  'Family Office',
  'Private Equity',
  'Government',
  'Other',
] as const;

function sortCoinvestors(list: Coinvestor[]): Coinvestor[] {
  return [...list].sort((a, b) => {
    const av = a.commitment_amount ?? -Infinity;
    const bv = b.commitment_amount ?? -Infinity;
    if (bv !== av) return bv - av;
    return a.investor_name.localeCompare(b.investor_name);
  });
}

function totalCoinvestorSum(list: Coinvestor[]): number {
  return list.reduce((sum, ci) => sum + Number(ci.commitment_amount ?? 0), 0);
}

function withDerived(base: CapitalStructureData, overrides: Partial<CapitalStructureData>): CapitalStructureData {
  const next = { ...base, ...overrides };
  const totalFund = next.total_fund_commitment;
  const dbj = next.dbj_commitment;
  const leverage_ratio = dbj > 0 && totalFund > 0 ? totalFund / dbj : null;
  return {
    ...next,
    coinvestors: sortCoinvestors(next.coinvestors),
    leverage_ratio,
    total_coinvestor_commitment: totalCoinvestorSum(next.coinvestors),
  };
}

function FundSizeStatusBadge({ status }: { status: FundSizeStatus }) {
  const config: Record<
    FundSizeStatus,
    {
      bg: string;
      color: string;
      border: string;
      label: string;
      icon: string;
    }
  > = {
    confirmed: {
      bg: '#E1F5EE',
      color: '#085041',
      border: '#5DCAA5',
      label: 'Confirmed at close',
      icon: 'ti ti-circle-check',
    },
    estimated: {
      bg: '#FAEEDA',
      color: '#633806',
      border: '#EF9F27',
      label: 'Fundraising open',
      icon: 'ti ti-clock',
    },
    sole_investor: {
      bg: '#E6F1FB',
      color: '#0C447C',
      border: '#85B7EB',
      label: 'Sole investor',
      icon: 'ti ti-building-bank',
    },
    not_applicable: {
      bg: '#F1EFE8',
      color: '#5F5E5A',
      border: '#D3D1C7',
      label: 'Not applicable',
      icon: 'ti ti-minus',
    },
    unknown: {
      bg: '#FCEBEB',
      color: '#791F1F',
      border: '#F09595',
      label: 'Data unknown',
      icon: 'ti ti-alert-circle',
    },
  };

  const c = config[status];

  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        border: `0.5px solid ${c.border}`,
        fontSize: 11,
        padding: '3px 10px',
        borderRadius: 20,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <i className={c.icon} style={{ fontSize: 12 }} aria-hidden="true" />
      {c.label}
    </span>
  );
}

function CoinvestorRow({
  coinvestor,
  canEdit,
  onEdit,
  onDelete,
}: {
  coinvestor: Coinvestor;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initials = coinvestor.investor_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  const avatarColors: Record<string, { bg: string; color: string }> = {
    DFI: { bg: '#E6F1FB', color: '#185FA5' },
    'Commercial Bank': { bg: '#FAEEDA', color: '#633806' },
    'Pension Fund': { bg: '#EEEDFE', color: '#534AB7' },
    'Insurance Company': { bg: '#E1F5EE', color: '#085041' },
    'Family Office': { bg: '#FCEBEB', color: '#791F1F' },
    'Private Equity': { bg: '#F1EFE8', color: '#5F5E5A' },
    Government: { bg: '#FAEEDA', color: '#633806' },
  };

  const colors = coinvestor.investor_type
    ? (avatarColors[coinvestor.investor_type] ?? { bg: '#F1EFE8', color: '#5F5E5A' })
    : { bg: '#F1EFE8', color: '#5F5E5A' };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: colors.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 500,
            color: colors.color,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: '#0b1f45',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {coinvestor.investor_name}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>
            {[coinvestor.investor_type, coinvestor.investor_country].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        {coinvestor.commitment_amount != null && coinvestor.commitment_amount > 0 ? (
          <div style={{ fontSize: 12, fontWeight: 500, color: '#0b1f45' }}>
            {formatCapitalCurrency(coinvestor.commitment_amount, coinvestor.currency)}
          </div>
        ) : null}
        {canEdit ? (
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              type="button"
              onClick={onEdit}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                color: '#9ca3af',
              }}
              title="Edit co-investor"
            >
              <i className="ti ti-edit" style={{ fontSize: 13 }} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                color: '#9ca3af',
              }}
              title="Remove co-investor"
            >
              <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface CapitalStructureCardProps {
  fundId: string;
  currency: string;
  initialData: CapitalStructureData;
  canEdit: boolean;
  /** When true, omit outer teal card chrome (embedded in unified fund details panel). */
  embedded?: boolean;
  onFundFieldsUpdated?: (patch: Pick<PortfolioFundRow, 'total_fund_commitment' | 'fund_size_status' | 'fund_close_lp_count' | 'fund_close_date_actual'>) => void;
}

export function CapitalStructureCard({
  fundId,
  currency: _currencyProp,
  initialData,
  canEdit,
  embedded = false,
  onFundFieldsUpdated,
}: CapitalStructureCardProps) {
  const [data, setData] = useState(() => withDerived(initialData, {}));
  const [editingSize, setEditingSize] = useState(false);
  const [editForm, setEditForm] = useState({
    total_fund_commitment: initialData.total_fund_commitment,
    fund_size_status: initialData.fund_size_status ?? ('' as FundSizeStatus | ''),
    fund_close_lp_count: initialData.fund_close_lp_count,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [coinvestorModal, setCoinvestorModal] = useState<'add' | 'edit' | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [editingCoinvestor, setEditingCoinvestor] = useState<Coinvestor | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<(typeof INVESTOR_TYPES)[number]>('DFI');
  const [formCountry, setFormCountry] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<'USD' | 'JMD'>('USD');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    setData(withDerived(initialData, {}));
  }, [initialData]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openAddModal = useCallback(() => {
    setModalErr(null);
    setFormName('');
    setFormType('DFI');
    setFormCountry('');
    setFormAmount('');
    setFormCurrency('USD');
    setFormDate('');
    setFormNotes('');
    setEditingCoinvestor(null);
    setCoinvestorModal('add');
  }, []);

  const openEditModal = useCallback((ci: Coinvestor) => {
    setModalErr(null);
    setEditingCoinvestor(ci);
    setFormName(ci.investor_name);
    setFormType((ci.investor_type as (typeof INVESTOR_TYPES)[number] | null) ?? 'Other');
    setFormCountry(ci.investor_country ?? '');
    setFormAmount(ci.commitment_amount != null ? String(ci.commitment_amount) : '');
    setFormCurrency(ci.currency === 'JMD' ? 'JMD' : 'USD');
    setFormDate(ci.commitment_date ?? '');
    setFormNotes(ci.notes ?? '');
    setCoinvestorModal('edit');
  }, []);

  const closeModal = useCallback(() => {
    if (modalBusy) return;
    setCoinvestorModal(null);
    setEditingCoinvestor(null);
  }, [modalBusy]);

  const handleSaveFundSize = async () => {
    setIsSaving(true);
    try {
      const lpRaw = editForm.fund_close_lp_count;
      const payload: Record<string, unknown> = {
        total_fund_commitment: editForm.total_fund_commitment,
        fund_size_status: editForm.fund_size_status === '' ? null : editForm.fund_size_status,
        fund_close_lp_count: lpRaw === null || lpRaw === undefined || Number.isNaN(Number(lpRaw)) ? null : Number(lpRaw),
      };
      const res = await fetch(`/api/portfolio/funds/${fundId}/capital-structure`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as {
        error?: string;
        total_fund_commitment?: number;
        fund_size_status?: string | null;
        fund_close_lp_count?: number | null;
        fund_close_date_actual?: string | null;
        dbj_commitment?: number;
        dbj_pro_rata_pct?: number;
        exchange_rate_jmd_usd?: number | null;
        currency?: string;
      };
      if (!res.ok) throw new Error(j.error ?? 'Save failed');

      const totalFund = Number(j.total_fund_commitment ?? editForm.total_fund_commitment);
      const allowed = new Set(['confirmed', 'estimated', 'sole_investor', 'not_applicable', 'unknown']);
      const rawStatus = j.fund_size_status;
      let fundSizeStatus: FundSizeStatus | null = null;
      if (rawStatus === null || rawStatus === undefined) {
        fundSizeStatus = editForm.fund_size_status === '' ? null : (editForm.fund_size_status as FundSizeStatus);
      } else if (allowed.has(rawStatus)) {
        fundSizeStatus = rawStatus as FundSizeStatus;
      }

      setData((prev) =>
        withDerived(prev, {
          total_fund_commitment: totalFund,
          fund_size_status: fundSizeStatus,
          fund_close_lp_count: j.fund_close_lp_count ?? null,
          fund_close_date_actual: j.fund_close_date_actual ?? prev.fund_close_date_actual,
          dbj_commitment: j.dbj_commitment != null ? Number(j.dbj_commitment) : prev.dbj_commitment,
          dbj_pro_rata_pct: j.dbj_pro_rata_pct != null ? Number(j.dbj_pro_rata_pct) : prev.dbj_pro_rata_pct,
          exchange_rate_jmd_usd: j.exchange_rate_jmd_usd ?? prev.exchange_rate_jmd_usd,
          currency: j.currency ?? prev.currency,
        }),
      );

      onFundFieldsUpdated?.({
        total_fund_commitment: totalFund,
        fund_size_status: j.fund_size_status ?? null,
        fund_close_lp_count: j.fund_close_lp_count ?? null,
        fund_close_date_actual: j.fund_close_date_actual ?? null,
      });

      setEditingSize(false);
      setToast('Fund size saved.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const submitCoinvestor = async () => {
    if (!coinvestorModal) return;
    const name = formName.trim();
    if (!name) {
      setModalErr('Investor name is required.');
      return;
    }
    setModalBusy(true);
    setModalErr(null);
    const amountNum = formAmount.trim() === '' ? null : Number(formAmount);
    if (formAmount.trim() !== '' && (Number.isNaN(amountNum) || amountNum! < 0)) {
      setModalErr('Invalid commitment amount.');
      setModalBusy(false);
      return;
    }

    const body = {
      investor_name: name,
      investor_type: formType,
      investor_country: formCountry.trim() || undefined,
      commitment_amount: amountNum,
      currency: formCurrency,
      commitment_date: formDate.trim() || null,
      notes: formNotes.trim() || undefined,
    };

    try {
      if (coinvestorModal === 'add') {
        const res = await fetch(`/api/portfolio/funds/${fundId}/coinvestors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { error?: string; coinvestor?: VcFundCoinvestor };
        if (!res.ok || !j.coinvestor) throw new Error(j.error ?? 'Failed to add');
        const mapped = mapCoinvestorRow(j.coinvestor);
        setData((prev) =>
          withDerived(prev, {
            coinvestors: sortCoinvestors([...prev.coinvestors, mapped]),
          }),
        );
        setToast('Co-investor added.');
      } else if (editingCoinvestor) {
        const res = await fetch(`/api/portfolio/funds/${fundId}/coinvestors/${editingCoinvestor.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { error?: string; coinvestor?: VcFundCoinvestor };
        if (!res.ok || !j.coinvestor) throw new Error(j.error ?? 'Failed to update');
        const mapped = mapCoinvestorRow(j.coinvestor);
        setData((prev) =>
          withDerived(prev, {
            coinvestors: prev.coinvestors.map((c) => (c.id === mapped.id ? mapped : c)),
          }),
        );
        setToast('Co-investor updated.');
      }
      closeModal();
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setModalBusy(false);
    }
  };

  const confirmRemoveCoinvestor = async (coinvestorId: string) => {
    const prevList = data.coinvestors;
    setData((prev) =>
      withDerived(prev, {
        coinvestors: prev.coinvestors.filter((c) => c.id !== coinvestorId),
      }),
    );
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/coinvestors/${coinvestorId}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Delete failed');
      setToast('Co-investor removed.');
    } catch (e) {
      setData((prev) => withDerived(prev, { coinvestors: prevList }));
      setToast(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const leverageOk = data.leverage_ratio !== null && data.leverage_ratio > 0;
  const target = data.portfolio_leverage_target;
  const pctTowardTarget =
    target > 0 && data.leverage_ratio !== null ? (data.leverage_ratio / target) * 100 : 0;

  const coinvestorRows = useMemo(() => data.coinvestors, [data.coinvestors]);

  const cardInner = editingSize ? (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 12,
            color: '#6b7280',
            display: 'block',
            marginBottom: 4,
          }}
        >
          Total fund size
        </label>
        <input
          type="number"
          value={editForm.total_fund_commitment}
          onChange={(e) =>
            setEditForm({
              ...editForm,
              total_fund_commitment: Number(e.target.value),
            })
          }
          style={{
            width: '100%',
            fontSize: 13,
            padding: '6px 10px',
            border: '0.5px solid #e5e7eb',
            borderRadius: 8,
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 12,
            color: '#6b7280',
            display: 'block',
            marginBottom: 4,
          }}
        >
          Fund size status
        </label>
        <select
          value={editForm.fund_size_status ?? ''}
          onChange={(e) =>
            setEditForm({
              ...editForm,
              fund_size_status: e.target.value as FundSizeStatus | '',
            })
          }
          style={{
            width: '100%',
            fontSize: 13,
            padding: '6px 10px',
            border: '0.5px solid #e5e7eb',
            borderRadius: 8,
          }}
        >
          <option value="">Select status</option>
          <option value="confirmed">Confirmed at close</option>
          <option value="estimated">Estimated — fundraising open</option>
          <option value="sole_investor">Sole investor — DBJ only</option>
          <option value="not_applicable">Not applicable</option>
          <option value="unknown">Unknown — legacy data gap</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 12,
            color: '#6b7280',
            display: 'block',
            marginBottom: 4,
          }}
        >
          Number of LPs at close
        </label>
        <input
          type="number"
          value={editForm.fund_close_lp_count ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setEditForm({
              ...editForm,
              fund_close_lp_count: v === '' ? null : Number(v),
            });
          }}
          style={{
            width: '100%',
            fontSize: 13,
            padding: '6px 10px',
            border: '0.5px solid #e5e7eb',
            borderRadius: 8,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => void handleSaveFundSize()}
          disabled={isSaving}
          style={{
            flex: 1,
            fontSize: 12,
            padding: '7px 0',
            background: '#1D9E75',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingSize(false);
            setEditForm({
              total_fund_commitment: data.total_fund_commitment,
              fund_size_status: data.fund_size_status ?? '',
              fund_close_lp_count: data.fund_close_lp_count,
            });
          }}
          style={{
            flex: 1,
            fontSize: 12,
            padding: '7px 0',
            background: 'none',
            color: '#6b7280',
            border: '0.5px solid #e5e7eb',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: '#9ca3af',
          }}
        >
          Capital structure
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setEditForm({
                total_fund_commitment: data.total_fund_commitment,
                fund_size_status: data.fund_size_status ?? '',
                fund_close_lp_count: data.fund_close_lp_count,
              });
              setEditingSize(true);
            }}
            style={{
              fontSize: 11,
              color: '#1D9E75',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontWeight: 500,
            }}
          >
            Edit
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Fund size</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b1f45' }}>
            {data.total_fund_commitment > 0 ? formatCapitalCurrency(data.total_fund_commitment, data.currency) : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>DBJ stake</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b1f45' }}>
            {data.dbj_pro_rata_pct > 0 ? `${data.dbj_pro_rata_pct.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>LPs</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b1f45' }}>
            {data.fund_close_lp_count ?? '—'}
          </div>
        </div>
      </div>

      {leverageOk ? (
        <div
          style={{
            background: '#E1F5EE',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <div style={{ fontSize: 12, color: '#0F6E56' }}>Leverage ratio</div>
            <div style={{ fontSize: 17, fontWeight: 500, color: '#085041' }}>{data.leverage_ratio!.toFixed(1)}x</div>
          </div>

          <div
            style={{
              marginTop: 6,
              background: '#9FE1CB',
              borderRadius: 3,
              height: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: '#0F6E56',
                height: '100%',
                width: `${Math.min((data.leverage_ratio! / data.portfolio_leverage_target) * 100, 100)}%`,
                borderRadius: 3,
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: '#0F6E56', marginTop: 4 }}>
            {pctTowardTarget.toFixed(1)}% toward {data.portfolio_leverage_target}x portfolio target
          </div>
        </div>
      ) : (
        <div
          style={{
            background: '#f3f4f6',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <i className="ti ti-alert-circle" style={{ fontSize: 14, color: '#9CA3AF' }} aria-hidden="true" />
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {data.total_fund_commitment === 0
              ? 'Add total fund size to calculate leverage'
              : 'Leverage ratio unavailable'}
          </div>
        </div>
      )}

      {data.fund_size_status ? (
        <div style={{ marginBottom: 12 }}>
          <FundSizeStatusBadge status={data.fund_size_status} />
        </div>
      ) : null}

      <div
        style={{
          borderTop: '0.5px solid #e5e7eb',
          paddingTop: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 12, color: '#6b7280' }}>Co-investors</div>
          {canEdit ? (
            <button
              type="button"
              onClick={openAddModal}
              style={{
                fontSize: 11,
                color: '#1D9E75',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />
              Add
            </button>
          ) : null}
        </div>

        {data.coinvestors.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: '#9ca3af',
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '8px 0',
            }}
          >
            No co-investors recorded
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {coinvestorRows.map((ci) =>
              confirmDeleteId === ci.id ? (
                <div key={ci.id} style={{ fontSize: 12, padding: '6px 0' }}>
                  <span style={{ color: '#6b7280' }}>
                    Remove {ci.investor_name} from co-investors?
                  </span>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void confirmRemoveCoinvestor(ci.id)}
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        background: '#1D9E75',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        background: 'none',
                        border: '0.5px solid #e5e7eb',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <CoinvestorRow
                  key={ci.id}
                  coinvestor={ci}
                  canEdit={canEdit}
                  onEdit={() => openEditModal(ci)}
                  onDelete={() => setConfirmDeleteId(ci.id)}
                />
              ),
            )}

            <div
              style={{
                borderTop: '0.5px solid #e5e7eb',
                paddingTop: 6,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {coinvestorRows.length} co-investor{coinvestorRows.length !== 1 ? 's' : ''} ·{' '}
                {formatCapitalCurrency(data.total_coinvestor_commitment, data.currency)}
              </div>
              {leverageOk && data.dbj_commitment > 0 ? (
                <div style={{ fontSize: 11, color: '#1D9E75', fontWeight: 500 }}>
                  {(data.total_coinvestor_commitment / data.dbj_commitment).toFixed(1)}x additional
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div style={{ position: 'relative' }}>
      {toast ? (
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            fontSize: 11,
            padding: '6px 12px',
            borderRadius: 8,
            background: '#0B1F45',
            color: 'white',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          {toast}
        </div>
      ) : null}

      {embedded ? (
        <div>{cardInner}</div>
      ) : (
        <div
          style={{
            background: '#ffffff',
            border: '0.5px solid #1D9E75',
            borderRadius: 12,
            padding: 16,
          }}
        >
          {cardInner}
        </div>
      )}

      {coinvestorModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !modalBusy) closeModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold text-[#0B1F45]">
              {coinvestorModal === 'add' ? 'Add co-investor' : 'Edit co-investor'}
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <Label>Investor name</Label>
                <Input className="mt-1" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div>
                <Label>Investor type</Label>
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as (typeof INVESTOR_TYPES)[number])}
                >
                  {INVESTOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Country (optional)</Label>
                <Input className="mt-1" value={formCountry} onChange={(e) => setFormCountry(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Commitment amount (optional)</Label>
                  <Input className="mt-1" type="number" step="any" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <select
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value as 'USD' | 'JMD')}
                  >
                    <option value="USD">USD</option>
                    <option value="JMD">JMD</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Commitment date (optional)</Label>
                <Input className="mt-1" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea className="mt-1" rows={3} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </div>
            </div>

            {modalErr ? <p className="mt-3 text-sm text-red-600">{modalErr}</p> : null}

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={modalBusy} onClick={closeModal}>
                Cancel
              </Button>
              <Button type="button" disabled={modalBusy} className="bg-[#1D9E75] hover:bg-[#178863]" onClick={() => void submitCoinvestor()}>
                {modalBusy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
