'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/format-date';
import type { VcFundApplication, VcSiteVisit } from '@/types/database';

type Attendee = { name: string; role: string };

function parseAttendees(raw: unknown): Attendee[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const role = typeof o.role === 'string' ? o.role.trim() : '';
      if (!name) return null;
      return { name, role };
    })
    .filter(Boolean) as Attendee[];
}

function outcomeBadgeClass(outcome: string | null) {
  const o = (outcome ?? '').toLowerCase();
  if (o === 'satisfactory') return 'bg-[#0F8A6E]/15 text-[#0F8A6E] border border-[#0F8A6E]/30';
  if (o === 'unsatisfactory') return 'bg-red-50 text-red-700 border border-red-200';
  if (o === 'conditional') return 'bg-amber-50 text-amber-800 border border-amber-200';
  return 'bg-gray-100 text-gray-600 border border-gray-200';
}

export function SiteVisitTab({
  applicationId,
  application,
  canWrite,
  initialSiteVisit,
  reportDownloadUrl,
}: {
  applicationId: string;
  application: Pick<VcFundApplication, 'status' | 'fund_name'>;
  canWrite: boolean;
  initialSiteVisit: VcSiteVisit | null;
  reportDownloadUrl: string | null;
}) {
  const router = useRouter();
  const [visit, setVisit] = useState<VcSiteVisit | null>(initialSiteVisit);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [schedDate, setSchedDate] = useState('');
  const [location, setLocation] = useState('');
  const [attName, setAttName] = useState('');
  const [attRole, setAttRole] = useState('');
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  const [actualDate, setActualDate] = useState('');
  const [outcome, setOutcome] = useState<'satisfactory' | 'unsatisfactory' | 'conditional' | ''>('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [legalReviewed, setLegalReviewed] = useState<'yes' | 'no' | ''>('');
  const [legalNotes, setLegalNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [reportName, setReportName] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [conditionalNotes, setConditionalNotes] = useState('');

  useEffect(() => {
    setVisit(initialSiteVisit);
    if (initialSiteVisit) {
      setSchedDate(initialSiteVisit.scheduled_date ?? '');
      setLocation(initialSiteVisit.location ?? '');
      setAttendees(parseAttendees(initialSiteVisit.dbj_attendees));
      setActualDate(initialSiteVisit.actual_date ?? '');
      setOutcome((initialSiteVisit.outcome as typeof outcome) ?? '');
      setOutcomeNotes(initialSiteVisit.outcome_notes ?? '');
      setLegalReviewed(initialSiteVisit.legal_docs_reviewed ? 'yes' : 'no');
      setLegalNotes(initialSiteVisit.legal_docs_notes ?? '');
      setReportPath(initialSiteVisit.report_file_path ?? null);
      setReportName(initialSiteVisit.report_file_name ?? null);
    }
  }, [initialSiteVisit]);

  const status = (visit?.status ?? '').toLowerCase();
  const visitOutcome = (visit?.outcome ?? '').toLowerCase();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const addAttendee = () => {
    const name = attName.trim();
    if (!name) return;
    setAttendees((prev) => [...prev, { name, role: attRole.trim() }]);
    setAttName('');
    setAttRole('');
  };

  const removeAttendee = (idx: number) => {
    setAttendees((prev) => prev.filter((_, i) => i !== idx));
  };

  const scheduleVisit = async () => {
    if (!schedDate) {
      setError('Scheduled date is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/site-visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: schedDate,
          location: location.trim() || null,
          dbj_attendees: attendees,
        }),
      });
      const json = (await res.json()) as { site_visit?: VcSiteVisit; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to schedule');
      if (json.site_visit) setVisit(json.site_visit);
      setScheduleOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const markCancelled = async () => {
    if (!visit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/site-visit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const json = (await res.json()) as { site_visit?: VcSiteVisit; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to cancel');
      if (json.site_visit) setVisit(json.site_visit);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const saveVisitRecord = async () => {
    if (!actualDate || !outcome) {
      setError('Actual date and outcome are required');
      return;
    }
    if (legalReviewed === '') {
      setError('Please indicate whether legal documents were reviewed');
      return;
    }
    if (legalReviewed === 'yes' && !legalNotes.trim()) {
      setError('Legal documents notes are required when reviewed');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/site-visit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          actual_date: actualDate,
          outcome,
          outcome_notes: outcomeNotes.trim() || null,
          legal_docs_reviewed: legalReviewed === 'yes',
          legal_docs_notes: legalReviewed === 'yes' ? legalNotes.trim() : null,
          report_file_path: reportPath,
          report_file_name: reportName,
        }),
      });
      const json = (await res.json()) as { site_visit?: VcSiteVisit; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to save');
      if (json.site_visit) setVisit(json.site_visit);
      setCompleteOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const beginNegotiation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/contract`, { method: 'POST' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to start negotiation');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const rejectApplication = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      setError('Rejection reason is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to reject');
      setRejectOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const proceedWithConditions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'negotiation',
          metadata: {
            site_visit_conditions: conditionalNotes.trim() || null,
          },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to proceed');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const onReportFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/api/applications/${applicationId}/site-visit/upload`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as { file_path?: string; file_name?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setReportPath(json.file_path ?? null);
      setReportName(json.file_name ?? file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const headerCard = useMemo(
    () => (
      <div className="mb-4 rounded-xl bg-[#0B1F45] p-5">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-white/60" aria-hidden />
          <div>
            <h3 className="font-semibold text-white">Site Visit</h3>
            <p className="mt-1 text-sm text-white/60">
              Schedule and record the fund manager site visit and legal document review
            </p>
          </div>
        </div>
      </div>
    ),
    [],
  );

  if (!visit && !scheduleOpen) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {headerCard}
        <div className="flex flex-col items-center py-6 text-center">
          <MapPin className="mb-3 h-10 w-10 text-gray-300" aria-hidden />
          <p className="text-sm font-medium text-gray-700">No site visit scheduled</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Schedule a site visit to review the fund manager&apos;s operations and legal documents
          </p>
          <p className="mt-1 text-xs text-gray-400">Site visit report: PDF or DOCX, up to 20MB (after the visit)</p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {canWrite ? (
            <Button className="mt-6 rounded-xl bg-[#0B1F45] px-6 hover:bg-[#162d5e]" onClick={() => setScheduleOpen(true)}>
              Schedule Site Visit
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!visit && scheduleOpen) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {headerCard}
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Visit details</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-[#0B1F45]">Scheduled date *</span>
              <Input type="date" className="mt-1" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-[#0B1F45]">Location</span>
              <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or remote" />
            </label>
          </div>
          <div className="mt-6">
            <p className="text-sm font-medium text-[#0B1F45]">DBJ attendees (add team members)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input className="max-w-[200px]" placeholder="Name" value={attName} onChange={(e) => setAttName(e.target.value)} />
              <Input className="max-w-[200px]" placeholder="Role" value={attRole} onChange={(e) => setAttRole(e.target.value)} />
              <Button type="button" variant="secondary" size="sm" onClick={addAttendee}>
                + Add
              </Button>
            </div>
            {attendees.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {attendees.map((a, i) => (
                  <button
                    key={`${a.name}-${i}`}
                    type="button"
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                    onClick={() => removeAttendee(i)}
                    title="Click to remove"
                  >
                    {a.name}
                    {a.role ? ` · ${a.role}` : ''}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button className="bg-[#0B1F45] hover:bg-[#162d5e]" onClick={scheduleVisit} disabled={loading || !canWrite}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Schedule Visit
          </Button>
        </div>
      </div>
    );
  }

  if (visit && status === 'scheduled' && !completeOpen) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {headerCard}
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-[#0B1F45]">Visit scheduled</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Date</dt>
              <dd className="font-medium text-gray-900">{visit.scheduled_date ? formatShortDate(visit.scheduled_date) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Location</dt>
              <dd className="text-right font-medium text-gray-900">{visit.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Attendees</dt>
              <dd className="mt-1 text-gray-900">
                {parseAttendees(visit.dbj_attendees)
                  .map((a) => `${a.name}${a.role ? ` (${a.role})` : ''}`)
                  .join(', ') || '—'}
              </dd>
            </div>
          </dl>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {canWrite ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button className="rounded-xl bg-[#0F8A6E] hover:bg-[#0c6e57]" onClick={() => setCompleteOpen(true)} disabled={loading}>
              Mark as Completed
            </Button>
            <button type="button" className="text-sm text-red-600 underline-offset-2 hover:underline" onClick={markCancelled}>
              Cancel Visit
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (visit && status === 'scheduled' && completeOpen) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {headerCard}
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Visit outcome</p>
          <label className="mt-4 block text-sm">
            <span className="font-medium text-[#0B1F45]">Actual visit date *</span>
            <Input type="date" className="mt-1" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-[#0B1F45]">Outcome *</legend>
            <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
              {(['satisfactory', 'unsatisfactory', 'conditional'] as const).map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} />
                  <span className="capitalize">{o === 'unsatisfactory' ? 'Unsatisfactory' : o}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 block text-sm">
            <span className="font-medium text-[#0B1F45]">Outcome notes</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={3}
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
            />
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-[#0B1F45]">Legal documents reviewed?</legend>
            <div className="mt-2 flex gap-6 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="legal" checked={legalReviewed === 'yes'} onChange={() => setLegalReviewed('yes')} />
                Yes
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="legal" checked={legalReviewed === 'no'} onChange={() => setLegalReviewed('no')} />
                No
              </label>
            </div>
          </fieldset>
          {legalReviewed === 'yes' ? (
            <label className="mt-4 block text-sm">
              <span className="font-medium text-[#0B1F45]">Legal documents notes</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                rows={2}
                value={legalNotes}
                onChange={(e) => setLegalNotes(e.target.value)}
              />
            </label>
          ) : null}
          <div className="mt-4">
            <p className="text-sm font-medium text-[#0B1F45]">Upload site visit report (optional)</p>
            <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 hover:bg-gray-100">
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => onReportFile(e.target.files?.[0] ?? null)}
              />
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-[#0F8A6E]" /> : 'PDF / DOCX · max 20MB'}
            </label>
            {reportName ? <p className="mt-2 text-xs text-gray-600">Selected: {reportName}</p> : null}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={loading}>
            Back
          </Button>
          <Button className="rounded-xl bg-[#0F8A6E] hover:bg-[#0c6e57]" onClick={saveVisitRecord} disabled={loading || !canWrite}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Visit Record
          </Button>
        </div>
      </div>
    );
  }

  if (visit && status === 'cancelled') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {headerCard}
        <p className="text-sm text-gray-600">This site visit was cancelled.</p>
      </div>
    );
  }

  if (visit && status === 'completed') {
    const dl = reportDownloadUrl;
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B1F45] px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-white/80" aria-hidden />
            <span className="font-semibold text-white">Site Visit Complete</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {visit.outcome ? (
              <span className={cn('rounded-full px-3 py-0.5 text-xs font-semibold capitalize', outcomeBadgeClass(visit.outcome))}>
                {visit.outcome}
              </span>
            ) : null}
            {visit.actual_date ? (
              <span className="text-sm text-white/70">{formatShortDate(visit.actual_date)}</span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
          <div className="text-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Location</p>
            <p className="mt-1 text-gray-900">{visit.location || '—'}</p>
            <p className="mt-4 text-xs font-semibold uppercase text-gray-400">Attendees</p>
            <ul className="mt-1 list-inside list-disc text-gray-800">
              {parseAttendees(visit.dbj_attendees).map((a) => (
                <li key={a.name + a.role}>
                  {a.name}
                  {a.role ? ` — ${a.role}` : ''}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Outcome</p>
            <p className="mt-1 capitalize text-gray-900">{visit.outcome ?? '—'}</p>
            <p className="mt-4 text-xs font-semibold uppercase text-gray-400">Legal documents</p>
            <p className="mt-1 text-gray-900">{visit.legal_docs_reviewed ? 'Reviewed' : 'Not reviewed'}</p>
          </div>
        </div>
        {visit.outcome_notes ? (
          <div className="border-t border-gray-100 px-5 py-3 text-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Outcome notes</p>
            <p className="mt-1 text-gray-800">{visit.outcome_notes}</p>
          </div>
        ) : null}
        {visit.legal_docs_notes ? (
          <div className="border-t border-gray-100 px-5 py-3 text-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Legal documents notes</p>
            <p className="mt-1 text-gray-800">{visit.legal_docs_notes}</p>
          </div>
        ) : null}
        {visit.report_file_name ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 text-sm text-gray-700">
            <FileText className="h-4 w-4 text-gray-400" aria-hidden />
            <span>{visit.report_file_name}</span>
            {dl ? (
              <a href={dl} className="text-[#0F8A6E] underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                Download
              </a>
            ) : null}
          </div>
        ) : null}

        {visitOutcome === 'satisfactory' && canWrite ? (
          <div className="mx-5 mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
            <p className="text-sm font-medium text-teal-800">Site visit satisfactory — proceed to contract negotiation</p>
            <Button className="mt-3 rounded-xl bg-[#0B1F45] hover:bg-[#162d5e]" onClick={beginNegotiation} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Begin Contract Negotiation →
            </Button>
          </div>
        ) : null}

        {visitOutcome === 'unsatisfactory' && canWrite ? (
          <div className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Site visit unsatisfactory</p>
            <Button variant="destructive" className="mt-3" onClick={() => setRejectOpen(true)} disabled={loading}>
              Reject Application
            </Button>
          </div>
        ) : null}

        {visitOutcome === 'conditional' && canWrite ? (
          <div className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">Conditions noted — document conditions before proceeding</p>
            <textarea
              className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
              rows={3}
              placeholder="Condition notes"
              value={conditionalNotes}
              onChange={(e) => setConditionalNotes(e.target.value)}
            />
            <Button className="mt-3 rounded-xl bg-amber-700 text-white hover:bg-amber-800" onClick={proceedWithConditions} disabled={loading}>
              Proceed with Conditions
            </Button>
          </div>
        ) : null}

        {rejectOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
              <p className="font-semibold text-[#0B1F45]">Reject application</p>
              <p className="mt-1 text-xs text-gray-500">{application.fund_name}</p>
              <textarea
                className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                rows={4}
                placeholder="Reason for rejection"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectOpen(false)}>
                  Close
                </Button>
                <Button variant="destructive" onClick={rejectApplication} disabled={loading}>
                  Confirm reject
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      {headerCard}
      <p className="text-sm text-gray-600">Unexpected site visit state. Refresh the page or contact support.</p>
    </div>
  );
}
