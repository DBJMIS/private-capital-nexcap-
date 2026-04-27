'use client';

import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  NarrativeExtractAllocations,
  NarrativeExtractCapitalAccountDetail,
  NarrativeExtractFundProfile,
  NarrativeExtractLpRow,
  NarrativeExtractPipelineStats,
  NarrativeExtractionPayload,
} from '@/lib/portfolio/narrative-extraction';
import { cn } from '@/lib/utils';

const NARR_KEYS = [
  ['fundraising_update', 'Fundraising'],
  ['pipeline_development', 'Pipeline'],
  ['team_update', 'Team'],
  ['compliance_update', 'Compliance'],
  ['impact_update', 'Impact'],
  ['risk_assessment', 'Risk'],
  ['outlook', 'Outlook'],
] as const;

function confDot(level: string | undefined) {
  const l = (level ?? 'not_found').toLowerCase();
  if (l === 'high') return 'bg-emerald-500';
  if (l === 'medium') return 'bg-amber-400';
  if (l === 'low') return 'bg-orange-400';
  return 'bg-gray-300';
}

function ConfBadge({ path, confidence }: { path: string; confidence: Record<string, string> }) {
  const lvl = confidence[path];
  if (!lvl) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase text-gray-500" title={lvl}>
      <span className={cn('inline-block h-2 w-2 rounded-full', confDot(lvl))} />
    </span>
  );
}

function emptyFundProfile(): NarrativeExtractFundProfile {
  return {
    fund_vintage: null,
    fund_size: null,
    first_close: null,
    fund_life_years: null,
    final_close: null,
    year_end: null,
    fund_strategy_summary: null,
  };
}

function emptyPipeline(): NarrativeExtractPipelineStats {
  return {
    deal_count: null,
    pipeline_value: null,
    largest_sectors: null,
    term_sheets_issued: null,
    term_sheets_value: null,
  };
}

function emptyCapital(): NarrativeExtractCapitalAccountDetail {
  return {
    portfolio_drawdowns: null,
    fee_drawdowns: null,
    management_fees: null,
    administrative_fees: null,
    other_fund_fees: null,
  };
}

export function cloneNarrativePayload(p: NarrativeExtractionPayload): NarrativeExtractionPayload {
  return JSON.parse(JSON.stringify(p)) as NarrativeExtractionPayload;
}

export function NarrativeExtractFormBody({
  draft,
  setDraft,
}: {
  draft: NarrativeExtractionPayload;
  setDraft: Dispatch<SetStateAction<NarrativeExtractionPayload>>;
}) {
  const conf = draft.confidence;

  const setNarr = (k: keyof NarrativeExtractionPayload['narrative'], v: string) => {
    setDraft((d) => ({
      ...d,
      narrative: { ...d.narrative, [k]: v.trim() ? v : null },
    }));
  };

  const setInd = <K extends keyof NarrativeExtractionPayload['indicators']>(k: K, v: NarrativeExtractionPayload['indicators'][K]) => {
    setDraft((d) => ({ ...d, indicators: { ...d.indicators, [k]: v } }));
  };

  const fp = draft.fund_profile ?? emptyFundProfile();
  const setFp = (patch: Partial<NarrativeExtractFundProfile>) => {
    setDraft((d) => {
      const next = { ...(d.fund_profile ?? emptyFundProfile()), ...patch };
      const allNull = Object.values(next).every((x) => x == null || x === '');
      return { ...d, fund_profile: allNull ? null : next };
    });
  };

  const alloc = draft.allocations ?? { sector: null, geographic: null };
  const setAlloc = (next: NarrativeExtractAllocations | null) => {
    setDraft((d) => ({ ...d, allocations: next }));
  };

  const lps = draft.fund_lps ?? [];
  const setLps = (rows: NarrativeExtractLpRow[] | null) => {
    setDraft((d) => ({ ...d, fund_lps: rows && rows.length ? rows : null }));
  };

  const pipe = draft.pipeline_stats ?? emptyPipeline();
  const setPipe = (patch: Partial<NarrativeExtractPipelineStats>) => {
    setDraft((d) => {
      const next = { ...(d.pipeline_stats ?? emptyPipeline()), ...patch };
      const empty =
        next.deal_count == null &&
        !next.pipeline_value &&
        !(next.largest_sectors?.length ?? 0) &&
        next.term_sheets_issued == null &&
        !next.term_sheets_value;
      return { ...d, pipeline_stats: empty ? null : next };
    });
  };

  const cap = draft.capital_account_detail ?? emptyCapital();
  const setCap = (patch: Partial<NarrativeExtractCapitalAccountDetail>) => {
    setDraft((d) => {
      const next = { ...(d.capital_account_detail ?? emptyCapital()), ...patch };
      const empty =
        !next.portfolio_drawdowns &&
        !next.fee_drawdowns &&
        !next.management_fees &&
        !next.administrative_fees &&
        !next.other_fund_fees;
      return { ...d, capital_account_detail: empty ? null : next };
    });
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-[#0B1F45]">Narrative sections</h3>
        <div className="mt-3 space-y-3">
          {NARR_KEYS.map(([key, label]) => (
            <div key={key}>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-600">{label}</Label>
                <ConfBadge path={key} confidence={conf as Record<string, string>} />
              </div>
              <Textarea
                className="mt-1 min-h-[56px] text-sm"
                value={draft.narrative[key] ?? ''}
                onChange={(e) => void setNarr(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F45]">Fund profile (from report)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">Vintage year</Label>
              <ConfBadge path="fund_profile.fund_vintage" confidence={conf as Record<string, string>} />
            </div>
            <Input
              type="number"
              className="mt-1"
              value={fp.fund_vintage ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setFp({ fund_vintage: Number.isFinite(n as number) ? (n as number) : null });
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">Fund life (years)</Label>
              <ConfBadge path="fund_profile.fund_life_years" confidence={conf as Record<string, string>} />
            </div>
            <Input
              type="number"
              className="mt-1"
              value={fp.fund_life_years ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setFp({ fund_life_years: Number.isFinite(n as number) ? (n as number) : null });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Fund size — currency</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={fp.fund_size?.currency ?? ''}
              onChange={(e) => {
                const cur = e.target.value;
                setFp({
                  fund_size:
                    cur && fp.fund_size?.amount != null
                      ? { currency: cur, amount: fp.fund_size.amount }
                      : cur
                        ? { currency: cur, amount: Number.NaN }
                        : null,
                });
              }}
            >
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="JMD">JMD</option>
            </select>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">Fund size — amount</Label>
              <ConfBadge path="fund_profile.fund_size" confidence={conf as Record<string, string>} />
            </div>
            <Input
              type="number"
              className="mt-1"
              value={fp.fund_size?.amount != null && Number.isFinite(fp.fund_size.amount) ? String(fp.fund_size.amount) : ''}
              onChange={(e) => {
                const amt = e.target.value === '' ? Number.NaN : Number(e.target.value);
                const cur = fp.fund_size?.currency ?? 'USD';
                setFp({
                  fund_size: Number.isFinite(amt) ? { currency: cur, amount: amt } : null,
                });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">First close</Label>
            <ConfBadge path="fund_profile.first_close" confidence={conf as Record<string, string>} />
            <Input className="mt-1" value={fp.first_close ?? ''} onChange={(e) => void setFp({ first_close: e.target.value || null })} />
          </div>
          <div>
            <Label className="text-xs">Final close</Label>
            <ConfBadge path="fund_profile.final_close" confidence={conf as Record<string, string>} />
            <Input className="mt-1" value={fp.final_close ?? ''} onChange={(e) => void setFp({ final_close: e.target.value || null })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Year end</Label>
            <ConfBadge path="fund_profile.year_end" confidence={conf as Record<string, string>} />
            <Input className="mt-1" value={fp.year_end ?? ''} onChange={(e) => void setFp({ year_end: e.target.value || null })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Strategy summary</Label>
            <ConfBadge path="fund_profile.fund_strategy_summary" confidence={conf as Record<string, string>} />
            <Textarea className="mt-1" value={fp.fund_strategy_summary ?? ''} onChange={(e) => void setFp({ fund_strategy_summary: e.target.value || null })} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F45]">Indicators</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Team size</Label>
            <Input
              type="number"
              className="mt-1"
              value={draft.indicators.team_size ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setInd('team_size', Number.isFinite(n as number) ? (n as number) : null);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Pipeline count</Label>
            <Input
              type="number"
              className="mt-1"
              value={draft.indicators.pipeline_count ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setInd('pipeline_count', Number.isFinite(n as number) ? (n as number) : null);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Investments made</Label>
            <Input
              type="number"
              className="mt-1"
              value={draft.indicators.investments_made ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setInd('investments_made', Number.isFinite(n as number) ? (n as number) : null);
              }}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0B1F45]">Sector allocation %</h3>
          <ConfBadge path="allocations.sector" confidence={conf as Record<string, string>} />
        </div>
        <div className="mt-2 space-y-2">
          {(alloc.sector ?? []).map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Sector"
                value={row.name}
                onChange={(e) => {
                  const rows = [...(alloc.sector ?? [])];
                  rows[i] = { ...rows[i]!, name: e.target.value };
                  setAlloc({ ...alloc, sector: rows.length ? rows : null });
                }}
              />
              <Input
                type="number"
                className="w-24"
                placeholder="%"
                value={row.percentage}
                onChange={(e) => {
                  const rows = [...(alloc.sector ?? [])];
                  rows[i] = { ...rows[i]!, percentage: Number(e.target.value) || 0 };
                  setAlloc({ ...alloc, sector: rows });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const rows = (alloc.sector ?? []).filter((_, j) => j !== i);
                  setAlloc({ ...alloc, sector: rows.length ? rows : null });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAlloc({ ...alloc, sector: [...(alloc.sector ?? []), { name: '', percentage: 0 }] })}
          >
            Add sector row
          </Button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0B1F45]">Geographic allocation %</h3>
          <ConfBadge path="allocations.geographic" confidence={conf as Record<string, string>} />
        </div>
        <div className="mt-2 space-y-2">
          {(alloc.geographic ?? []).map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Country"
                value={row.country}
                onChange={(e) => {
                  const rows = [...(alloc.geographic ?? [])];
                  rows[i] = { ...rows[i]!, country: e.target.value };
                  setAlloc({ ...alloc, geographic: rows.length ? rows : null });
                }}
              />
              <Input
                type="number"
                className="w-24"
                value={row.percentage}
                onChange={(e) => {
                  const rows = [...(alloc.geographic ?? [])];
                  rows[i] = { ...rows[i]!, percentage: Number(e.target.value) || 0 };
                  setAlloc({ ...alloc, geographic: rows });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const rows = (alloc.geographic ?? []).filter((_, j) => j !== i);
                  setAlloc({ ...alloc, geographic: rows.length ? rows : null });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAlloc({ ...alloc, geographic: [...(alloc.geographic ?? []), { country: '', percentage: 0 }] })}
          >
            Add geography row
          </Button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0B1F45]">Fund LPs</h3>
          <ConfBadge path="fund_lps" confidence={conf as Record<string, string>} />
        </div>
        <div className="mt-2 space-y-3">
          {lps.map((row, i) => (
            <div key={i} className="rounded-lg border border-gray-100 p-3">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[160px] flex-1"
                  placeholder="LP name"
                  value={row.name}
                  onChange={(e) => {
                    const next = [...lps];
                    next[i] = { ...next[i]!, name: e.target.value };
                    setLps(next);
                  }}
                />
                <Input
                  className="w-24"
                  type="number"
                  placeholder="%"
                  value={row.percentage}
                  onChange={(e) => {
                    const next = [...lps];
                    next[i] = { ...next[i]!, percentage: Number(e.target.value) || 0 };
                    setLps(next);
                  }}
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  value={row.commitment?.currency ?? ''}
                  onChange={(e) => {
                    const cur = e.target.value;
                    const next = [...lps];
                    const amt = row.commitment?.amount;
                    next[i] = {
                      ...next[i]!,
                      commitment: cur && amt != null && Number.isFinite(amt) ? { currency: cur, amount: amt } : cur ? { currency: cur, amount: Number.NaN } : null,
                    };
                    setLps(next);
                  }}
                >
                  <option value="">CCY</option>
                  <option value="USD">USD</option>
                  <option value="JMD">JMD</option>
                </select>
                <Input
                  className="w-28"
                  type="number"
                  placeholder="Commit"
                  value={row.commitment?.amount != null && Number.isFinite(row.commitment.amount) ? String(row.commitment.amount) : ''}
                  onChange={(e) => {
                    const amt = e.target.value === '' ? Number.NaN : Number(e.target.value);
                    const cur = row.commitment?.currency ?? 'USD';
                    const next = [...lps];
                    next[i] = {
                      ...next[i]!,
                      commitment: Number.isFinite(amt) ? { currency: cur, amount: amt } : null,
                    };
                    setLps(next);
                  }}
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setLps(lps.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setLps([...lps, { name: '', commitment: null, percentage: 0 }])}>
            Add LP
          </Button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F45]">Pipeline stats</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Deal count</Label>
            <ConfBadge path="pipeline_stats.deal_count" confidence={conf as Record<string, string>} />
            <Input
              type="number"
              className="mt-1"
              value={pipe.deal_count ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setPipe({ deal_count: Number.isFinite(n as number) ? (n as number) : null });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Term sheets issued</Label>
            <ConfBadge path="pipeline_stats.term_sheets_issued" confidence={conf as Record<string, string>} />
            <Input
              type="number"
              className="mt-1"
              value={pipe.term_sheets_issued ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                setPipe({ term_sheets_issued: Number.isFinite(n as number) ? (n as number) : null });
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Pipeline value (currency / amount)</Label>
            <ConfBadge path="pipeline_stats.pipeline_value" confidence={conf as Record<string, string>} />
            <div className="mt-1 flex gap-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                value={pipe.pipeline_value?.currency ?? ''}
                onChange={(e) => {
                  const cur = e.target.value;
                  setPipe({
                    pipeline_value:
                      cur && pipe.pipeline_value?.amount != null
                        ? { currency: cur, amount: pipe.pipeline_value.amount }
                        : cur
                          ? { currency: cur, amount: Number.NaN }
                          : null,
                  });
                }}
              >
                <option value="">—</option>
                <option value="USD">USD</option>
                <option value="JMD">JMD</option>
              </select>
              <Input
                type="number"
                value={pipe.pipeline_value?.amount != null && Number.isFinite(pipe.pipeline_value.amount) ? String(pipe.pipeline_value.amount) : ''}
                onChange={(e) => {
                  const amt = e.target.value === '' ? Number.NaN : Number(e.target.value);
                  const cur = pipe.pipeline_value?.currency ?? 'USD';
                  setPipe({ pipeline_value: Number.isFinite(amt) ? { currency: cur, amount: amt } : null });
                }}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Term sheets value</Label>
            <ConfBadge path="pipeline_stats.term_sheets_value" confidence={conf as Record<string, string>} />
            <div className="mt-1 flex gap-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                value={pipe.term_sheets_value?.currency ?? ''}
                onChange={(e) => {
                  const cur = e.target.value;
                  setPipe({
                    term_sheets_value:
                      cur && pipe.term_sheets_value?.amount != null
                        ? { currency: cur, amount: pipe.term_sheets_value.amount }
                        : cur
                          ? { currency: cur, amount: Number.NaN }
                          : null,
                  });
                }}
              >
                <option value="">—</option>
                <option value="USD">USD</option>
                <option value="JMD">JMD</option>
              </select>
              <Input
                type="number"
                value={pipe.term_sheets_value?.amount != null && Number.isFinite(pipe.term_sheets_value.amount) ? String(pipe.term_sheets_value.amount) : ''}
                onChange={(e) => {
                  const amt = e.target.value === '' ? Number.NaN : Number(e.target.value);
                  const cur = pipe.term_sheets_value?.currency ?? 'USD';
                  setPipe({ term_sheets_value: Number.isFinite(amt) ? { currency: cur, amount: amt } : null });
                }}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Largest sectors (comma-separated)</Label>
            <ConfBadge path="pipeline_stats.largest_sectors" confidence={conf as Record<string, string>} />
            <Input
              className="mt-1"
              value={(pipe.largest_sectors ?? []).join(', ')}
              onChange={(e) => {
                const parts = e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                setPipe({ largest_sectors: parts.length ? parts : null });
              }}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F45]">Capital account (from report)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['portfolio_drawdowns', 'Portfolio drawdowns'],
              ['fee_drawdowns', 'Fee drawdowns'],
              ['management_fees', 'Management fees'],
              ['administrative_fees', 'Administrative fees'],
              ['other_fund_fees', 'Other fund fees'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <div className="flex items-center gap-1">
                <Label className="text-xs">{label}</Label>
                <ConfBadge path={`capital_account_detail.${field}`} confidence={conf as Record<string, string>} />
              </div>
              <div className="mt-1 flex gap-2">
                <select
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  value={cap[field]?.currency ?? ''}
                  onChange={(e) => {
                    const cur = e.target.value;
                    const prev = cap[field];
                    setCap({
                      [field]:
                        cur && prev?.amount != null
                          ? { currency: cur, amount: prev.amount }
                          : cur
                            ? { currency: cur, amount: Number.NaN }
                            : null,
                    });
                  }}
                >
                  <option value="">—</option>
                  <option value="USD">USD</option>
                  <option value="JMD">JMD</option>
                </select>
                <Input
                  type="number"
                  value={cap[field]?.amount != null && Number.isFinite(cap[field]!.amount) ? String(cap[field]!.amount) : ''}
                  onChange={(e) => {
                    const amt = e.target.value === '' ? Number.NaN : Number(e.target.value);
                    const cur = cap[field]?.currency ?? 'USD';
                    setCap({ [field]: Number.isFinite(amt) ? { currency: cur, amount: amt } : null });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
