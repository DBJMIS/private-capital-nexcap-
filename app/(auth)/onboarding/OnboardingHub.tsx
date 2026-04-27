'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList } from 'lucide-react';

import { SECTION_CONFIGS } from '@/lib/questionnaire/questions-config';
import { formatCfpDate } from '@/lib/cfp/format-dates';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dsCard, dsType } from '@/components/ui/design-system';

type ActiveCfp = {
  id: string;
  title: string;
  description: string | null;
  opening_date: string;
  closing_date: string;
  status: string;
};

export function OnboardingHub() {
  const router = useRouter();
  const [qid, setQid] = useState<string | null>(null);
  const [aid, setAid] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cfpSummary, setCfpSummary] = useState<{ id: string; title: string; closing_date: string; status: string } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [booting, setBooting] = useState(true);

  const [cfpGate, setCfpGate] = useState(false);
  const [activeCfps, setActiveCfps] = useState<ActiveCfp[]>([]);
  const [cfpLoadErr, setCfpLoadErr] = useState<string | null>(null);
  const [selectedCfpId, setSelectedCfpId] = useState<string | null>(null);
  const [linkingCfp, setLinkingCfp] = useState(false);

  const refresh = useCallback(async () => {
    setErr(null);
    setCfpLoadErr(null);
    const me = await fetch('/api/my-application');
    const mj = (await me.json()) as {
      questionnaire_id?: string | null;
      application_id?: string | null;
      application?: { status?: string; cfp_id?: string | null } | null;
      cfp?: { id: string; title: string; status: string; closing_date: string } | null;
      error?: string;
    };
    if (!me.ok) {
      setErr(mj.error ?? 'Failed to load application');
      setBooting(false);
      return;
    }

    setQid(mj.questionnaire_id ?? null);
    setAid(mj.application_id ?? null);
    setStatus(mj.application?.status ?? null);

    const draftNeedsCfp = mj.application?.status === 'draft' && !mj.application?.cfp_id;

    if (draftNeedsCfp) {
      setCfpGate(true);
      setCfpSummary(null);
      const ar = await fetch('/api/cfp/active');
      const aj = (await ar.json()) as { cfps?: ActiveCfp[]; error?: string };
      if (!ar.ok) {
        setCfpLoadErr(aj.error ?? 'Failed to load active calls');
        setActiveCfps([]);
        setSelectedCfpId(null);
        setBooting(false);
        return;
      }
      const list = aj.cfps ?? [];
      setActiveCfps(list);
      setSelectedCfpId(list.length === 1 ? list[0].id : null);
      setBooting(false);
      return;
    }

    setCfpGate(false);
    setActiveCfps([]);
    setSelectedCfpId(null);

    if (mj.cfp) {
      setCfpSummary({
        id: mj.cfp.id,
        title: mj.cfp.title,
        closing_date: mj.cfp.closing_date,
        status: mj.cfp.status,
      });
    } else {
      setCfpSummary(null);
    }

    if (!mj.questionnaire_id) {
      setBooting(false);
      return;
    }

    const qr = await fetch(`/api/questionnaires/${mj.questionnaire_id}`);
    const qj = (await qr.json()) as {
      progress?: { completed_sections: number; total_sections: number };
      error?: string;
    };
    if (!qr.ok) {
      setErr(qj.error ?? 'Failed to load questionnaire');
      setBooting(false);
      return;
    }
    setProgress({
      completed: qj.progress?.completed_sections ?? 0,
      total: qj.progress?.total_sections ?? SECTION_CONFIGS.length,
    });
    setBooting(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmCfp = async (cfpId: string) => {
    if (!aid) return;
    setLinkingCfp(true);
    setCfpLoadErr(null);
    try {
      const res = await fetch('/api/onboarding/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: aid, application: {}, cfp_id: cfpId }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setCfpLoadErr(j.error ?? 'Could not link CFP');
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setLinkingCfp(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/my-application/submit', { method: 'POST' });
      const j = (await res.json()) as { error?: string; outcome?: string };
      if (!res.ok) throw new Error(j.error ?? 'Submit failed');
      router.push('/application-status');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (booting) {
    return <p className="text-sm text-navy/60">Preparing your application…</p>;
  }

  if (err && !qid && !cfpGate) {
    return <p className="text-sm text-red-700">{err}</p>;
  }

  if (cfpGate) {
    if (cfpLoadErr) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <p className="font-medium">{cfpLoadErr}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      );
    }

    if (activeCfps.length === 0) {
      return (
        <div className={cn(dsCard.padded, 'border-amber-200 bg-amber-50')}>
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <p className="font-semibold text-[#0B1F45]">No open calls for proposals</p>
              <p className={cn('mt-2 text-sm', dsType.body)}>
                There are no active CFPs at this time. Please check back later or contact DBJ.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (activeCfps.length === 1) {
      const c = activeCfps[0];
      return (
        <div className="space-y-6">
          <div className={cn(dsCard.padded)}>
            <p className="text-[15px] font-semibold text-navy">You are applying to:</p>
            <div className="mt-4 flex gap-3 rounded-xl border border-shell-border bg-shell-card p-4">
              <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#0B1F45]" aria-hidden />
              <div>
                <p className="font-semibold text-[#0B1F45]">{c.title}</p>
                <p className={cn('mt-1 text-sm', dsType.muted)}>
                  Active · Closes {formatCfpDate(c.closing_date)}
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="mt-6 w-full bg-navy text-navy-foreground hover:bg-navy/90"
              disabled={linkingCfp}
              onClick={() => void confirmCfp(c.id)}
            >
              {linkingCfp ? 'Saving…' : 'Continue →'}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className={cn(dsCard.padded)}>
          <p className="text-[15px] font-semibold text-navy">Select a Call for Proposals to apply to:</p>
          <div className="mt-4 space-y-3">
            {activeCfps.map((c) => {
              const checked = selectedCfpId === c.id;
              return (
                <label
                  key={c.id}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                    checked ? 'border-teal bg-teal-50/60' : 'border-shell-border bg-white hover:bg-shell-card',
                  )}
                >
                  <input
                    type="radio"
                    name="cfp_pick"
                    className="mt-1"
                    checked={checked}
                    onChange={() => setSelectedCfpId(c.id)}
                  />
                  <div>
                    <p className="font-semibold text-[#0B1F45]">{c.title}</p>
                    <p className={cn('mt-1 text-sm', dsType.muted)}>
                      Active · Closes {formatCfpDate(c.closing_date)}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
          <Button
            type="button"
            className="mt-6 w-full bg-navy text-navy-foreground hover:bg-navy/90"
            disabled={!selectedCfpId || linkingCfp}
            onClick={() => selectedCfpId && void confirmCfp(selectedCfpId)}
          >
            {linkingCfp ? 'Saving…' : 'Continue →'}
          </Button>
        </div>
      </div>
    );
  }

  if (!qid) return <p className="text-sm text-navy/60">Preparing your application…</p>;

  const done = progress?.completed === progress?.total;
  const isDraft = status === 'draft' || status == null;

  return (
    <div className="w-full max-w-none space-y-6">
      {cfpSummary ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <p className="font-medium text-[#0B1F45]">
            Applying to: <span className="font-semibold">{cfpSummary.title}</span>
          </p>
          <p className="mt-1 text-[13px] text-gray-700">
            Active · Closes {formatCfpDate(cfpSummary.closing_date)}
          </p>
        </div>
      ) : null}

      <div className="app-card p-6">
        <p className="text-[13px] text-[#374151]">
          Complete each section in order. Each section auto-saves after you stop typing. When all sections show
          complete, submit for DBJ review.
        </p>
        {progress && (
          <p className="mt-3 text-sm font-medium text-teal">
            Progress: {progress.completed} / {progress.total} sections complete
          </p>
        )}
      </div>

      <ol className="space-y-2">
        {SECTION_CONFIGS.map((s, idx) => (
          <li key={s.key}>
            <Button asChild variant="outline" className="h-auto w-full justify-start py-3">
              <Link href={`/questionnaires/${qid}/sections/${s.key}`}>
                <span className="text-left text-sm font-medium text-navy">
                  Section {idx + 1} of {SECTION_CONFIGS.length}: {s.title.replace(/^Section [IVX]+:\s*/i, '')}
                </span>
              </Link>
            </Button>
          </li>
        ))}
      </ol>

      {err && <p className="text-sm text-red-700">{err}</p>}

      {isDraft && (
        <div className="rounded-xl border border-shell-border bg-shell-card p-6">
          <Button
            type="button"
            className="w-full bg-navy text-navy-foreground hover:bg-navy/90"
            disabled={!done || submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </Button>
          {!done && (
            <p className="mt-2 text-center text-xs text-navy/55">Submit unlocks when every section is marked complete.</p>
          )}
        </div>
      )}

      {!isDraft && (
        <p className="text-center text-sm text-navy/70">
          This application is no longer editable. See <Link href="/application-status">Application status</Link>.
        </p>
      )}
    </div>
  );
}
