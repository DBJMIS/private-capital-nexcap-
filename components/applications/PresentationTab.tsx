'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Info, Pencil, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { dsCard, dsField } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

type Attendee = { name: string; organisation: string; email: string };

type PresentationType = 'teams' | 'in_person';

function normalizeAttendees(value: unknown): Attendee[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const o = item as Record<string, unknown>;
    return {
      name: String(o.name ?? '').trim(),
      organisation: String(o.organisation ?? '').trim(),
      email: String(o.email ?? '').trim(),
    };
  });
}

type PresentationRow = {
  id: string;
  scheduled_date: string | null;
  actual_date: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  recording_url: string | null;
  presentation_file_path: string | null;
  attendees: Attendee[];
  notes: string | null;
  presentation_type: PresentationType;
  location: string | null;
  teams_meeting_id: string | null;
  teams_join_url: string | null;
  teams_recording_url: string | null;
  auto_completed: boolean;
  invite_sent: boolean;
  invite_sent_at: string | null;
};

function formatPresentationDate(iso: string | null | undefined): string {
  if (iso == null || !String(iso).trim()) return '—';
  const d = new Date(String(iso).trim());
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function normalizePresentationRow(p: Record<string, unknown>): PresentationRow {
  const t = String(p.presentation_type ?? 'in_person').toLowerCase();
  return {
    id: String(p.id),
    scheduled_date: (p.scheduled_date as string | null) ?? null,
    actual_date: (p.actual_date as string | null) ?? null,
    status: (p.status as PresentationRow['status']) ?? 'scheduled',
    recording_url: (p.recording_url as string | null) ?? null,
    presentation_file_path: (p.presentation_file_path as string | null) ?? null,
    attendees: normalizeAttendees(p.attendees),
    notes: (p.notes as string | null) ?? null,
    presentation_type: t === 'teams' ? 'teams' : 'in_person',
    location: (p.location as string | null) ?? null,
    teams_meeting_id: (p.teams_meeting_id as string | null) ?? null,
    teams_join_url: (p.teams_join_url as string | null) ?? null,
    teams_recording_url: (p.teams_recording_url as string | null) ?? null,
    auto_completed: Boolean(p.auto_completed),
    invite_sent: Boolean(p.invite_sent),
    invite_sent_at: (p.invite_sent_at as string | null) ?? null,
  };
}

function PresentationTypeReadOnly({ row }: { row: PresentationRow }) {
  const isTeams = row.presentation_type === 'teams';
  return (
    <p className="flex items-center gap-1.5 text-sm text-gray-600">
      {isTeams ? <Video className="h-4 w-4 shrink-0 text-gray-500" aria-hidden /> : <Building2 className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />}
      <span>{isTeams ? 'Microsoft Teams' : 'In Person'}</span>
    </p>
  );
}

export function PresentationTab({ applicationId }: { applicationId: string }) {
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';
  const [row, setRow] = useState<PresentationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openComplete, setOpenComplete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const [presentationType, setPresentationType] = useState<PresentationType>('in_person');
  const [location, setLocation] = useState('');
  const [teamsNotice, setTeamsNotice] = useState<string | null>(null);

  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
  const [attendees, setAttendees] = useState<Attendee[]>([{ name: '', organisation: '', email: '' }]);

  const [actualDate, setActualDate] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [presentationFile, setPresentationFile] = useState<File | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/presentation`, { cache: 'no-store' });
      const j = (await res.json()) as { data: { presentation: Record<string, unknown> | null }; error: string | null };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to load presentation');
        return;
      }
      const pres = j.data.presentation;
      setRow(pres ? normalizePresentationRow(pres) : null);
      if (pres) {
        setScheduledDate((pres.scheduled_date as string | null) ?? '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [applicationId]);

  useEffect(() => {
    if (row?.status === 'completed') setIsEditing(false);
  }, [row?.status]);

  useEffect(() => {
    if (!row || row.status !== 'scheduled' || isEditing) return;
    setScheduledDate(row.scheduled_date ? String(row.scheduled_date).slice(0, 10) : '');
    setLocation(row.location ?? '');
    setNotes(row.notes ?? '');
    setPresentationType(row.presentation_type);
    setAttendees(
      row.attendees.length > 0
        ? row.attendees.map((a) => ({ name: a.name, organisation: a.organisation, email: a.email }))
        : [{ name: '', organisation: '', email: '' }],
    );
  }, [row, isEditing]);

  useEffect(() => {
    if (!showSaved) return;
    const t = window.setTimeout(() => setShowSaved(false), 2500);
    return () => window.clearTimeout(t);
  }, [showSaved]);

  const hasPresentation = row != null;
  const isCompleted = row?.status === 'completed';
  const isScheduled = row?.status === 'scheduled';

  const attendeeCount = useMemo(
    () =>
      attendees.filter((a) => a.name.trim().length > 0 || a.organisation.trim().length > 0 || a.email.trim().length > 0)
        .length,
    [attendees],
  );

  const handleTeamsCardClick = () => {
    setTeamsNotice('Teams integration is not yet active. Using In Person instead.');
    setPresentationType('in_person');
  };

  const submitSchedule = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/presentation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: scheduledDate || null,
          presentation_type: presentationType,
          location: presentationType === 'in_person' ? location.trim() || null : null,
          attendees: attendees.filter((a) => a.name.trim() || a.organisation.trim() || a.email.trim()),
          notes: notes.trim() || null,
        }),
      });
      const j = (await res.json()) as { error: string | null };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to schedule presentation');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const beginEditScheduled = () => {
    if (!row || row.status !== 'scheduled') return;
    setPresentationType(row.presentation_type);
    setLocation(row.location ?? '');
    setScheduledDate(row.scheduled_date ? String(row.scheduled_date).slice(0, 10) : '');
    setNotes(row.notes ?? '');
    setAttendees(
      row.attendees.length > 0
        ? row.attendees.map((a) => ({ name: a.name, organisation: a.organisation, email: a.email }))
        : [{ name: '', organisation: '', email: '' }],
    );
    setTeamsNotice(null);
    setIsEditing(true);
  };

  const saveScheduleEdits = async () => {
    if (!row || row.status !== 'scheduled') return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/presentation/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: scheduledDate || null,
          presentation_type: presentationType,
          location: presentationType === 'in_person' ? location.trim() || null : null,
          attendees: attendees.filter((a) => a.name.trim() || a.organisation.trim() || a.email.trim()),
          notes: notes.trim() || null,
        }),
      });
      const j = (await res.json()) as { error: string | null };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to save changes');
        return;
      }
      setIsEditing(false);
      setShowSaved(true);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveCompletion = async (asCompleted: boolean) => {
    if (!row) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set('actual_date', actualDate || row.scheduled_date || '');
      fd.set('recording_url', recordingUrl.trim());
      fd.set('notes', completionNotes.trim());
      fd.set('status', asCompleted ? 'completed' : row.status);
      if (presentationFile) fd.set('file', presentationFile);

      const res = await fetch(`/api/applications/${applicationId}/presentation/${row.id}`, {
        method: 'PATCH',
        body: fd,
      });
      const j = (await res.json()) as { error: string | null };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to update presentation');
        return;
      }
      setOpenComplete(false);
      setPresentationFile(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const renderScheduleFields = () => (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="whitespace-nowrap text-sm font-medium text-gray-700">Presentation type</span>
        <div
          className="inline-flex shrink-0 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1"
          role="group"
          aria-label="Presentation type"
        >
          <button
            type="button"
            onClick={handleTeamsCardClick}
            className={cn(
              'flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
              'bg-transparent text-gray-300',
            )}
            aria-disabled
          >
            <Video className="h-4 w-4 shrink-0" aria-hidden />
            <span>Microsoft Teams</span>
            <span className="ml-1 inline-flex shrink-0 items-center rounded-full bg-[#C8973A]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#C8973A]">
              Coming soon
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPresentationType('in_person');
              setTeamsNotice(null);
            }}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
              presentationType === 'in_person'
                ? 'border border-gray-200 bg-white font-semibold text-[#0B1F45] shadow-sm'
                : 'bg-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Building2
              className={cn('h-4 w-4 shrink-0', presentationType === 'in_person' ? 'text-[#0B1F45]' : 'text-gray-400')}
              aria-hidden
            />
            <span>In Person</span>
            {presentationType === 'in_person' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F8A6E]" aria-hidden />
            ) : null}
          </button>
        </div>
      </div>

      {presentationType === 'in_person' ? (
        <div className="mt-3 transition-opacity duration-200">
          <label className={labelClass}>
            Location
            <input
              type="text"
              className={cn('mt-1', dsField.input)}
              placeholder="e.g. DBJ Boardroom, 11A-15 Oxford Road"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 transition-opacity duration-200">
          <Info className="h-5 w-5 shrink-0 text-blue-500" aria-hidden />
          <div>
            <p className="text-sm font-medium text-blue-700">Microsoft Teams integration coming soon</p>
            <p className="mt-1 text-xs leading-relaxed text-blue-600">
              When enabled, the system will automatically:
              <br />· Create a Teams meeting
              <br />· Send calendar invites to all panel members and the fund manager
              <br />· Store the recording URL after the meeting
            </p>
          </div>
        </div>
      )}

      <label className={labelClass}>
        Scheduled date
        <input type="date" className={cn('mt-1', dsField.input)} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
      </label>
      <div className="space-y-2">
        <p className={labelClass}>Expected attendees</p>
        <p className="mt-1 text-xs italic text-gray-400">
          Email addresses will be used for future integrations (calendar invites, Teams meetings)
        </p>
        {attendees.map((a, idx) => (
          <div key={`attendee-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <input
                className={cn(dsField.input, 'min-w-0 sm:flex-1')}
                placeholder="Name"
                value={a.name}
                onChange={(e) =>
                  setAttendees((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                }
              />
              <input
                className={cn(dsField.input, 'min-w-0 sm:flex-1')}
                placeholder="Organisation"
                value={a.organisation}
                onChange={(e) =>
                  setAttendees((prev) => prev.map((r, i) => (i === idx ? { ...r, organisation: e.target.value } : r)))
                }
              />
            </div>
            <div className="flex gap-2 sm:contents">
              <input
                type="email"
                autoComplete="email"
                className={cn(dsField.input, 'min-w-0 flex-1 sm:flex-1')}
                placeholder="email@example.com"
                value={a.email}
                onChange={(e) =>
                  setAttendees((prev) => prev.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))
                }
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => setAttendees((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setAttendees((prev) => [...prev, { name: '', organisation: '', email: '' }])}
        >
          + Add Attendee
        </Button>
      </div>
      <label className={labelClass}>
        Notes (optional)
        <textarea className={cn('mt-1 min-h-[96px]', dsField.textarea)} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </div>
  );

  if (loading) {
    return <div className={dsCard.padded}>Loading presentation…</div>;
  }

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
      {showSaved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">Saved ✓</div>
      ) : null}
      {teamsNotice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{teamsNotice}</div>
      ) : null}

      {!hasPresentation ? (
        <section className={dsCard.padded}>
          <h3 className="text-sm font-semibold text-[#0B1F45]">Schedule Presentation</h3>
          <div className="mt-4 space-y-4">
            {renderScheduleFields()}
            <Button type="button" className="bg-[#0B1F45] text-white hover:bg-[#162d5e]" disabled={!scheduledDate || busy} onClick={submitSchedule}>
              {busy ? 'Scheduling…' : `Schedule Presentation${attendeeCount ? ` (${attendeeCount} attendees)` : ''}`}
            </Button>
          </div>
        </section>
      ) : (
        <section className={dsCard.padded}>
          {isCompleted ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#0F8A6E]">✓ Presentation Completed</p>
                {row.auto_completed ? (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Auto-completed</span>
                ) : null}
              </div>
              <div className="mt-2 space-y-1">
                <PresentationTypeReadOnly row={row} />
                {row.presentation_type === 'in_person' && row.location ? (
                  <p className="text-sm text-gray-500">📍 {row.location}</p>
                ) : null}
                {row.teams_join_url ? (
                  <a
                    href={row.teams_join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit rounded-lg bg-[#0F8A6E] px-3 py-2 text-sm font-medium text-white hover:bg-[#0c735d]"
                  >
                    Join Teams Meeting →
                  </a>
                ) : null}
                {row.teams_recording_url ? (
                  <p className="text-sm">
                    <a href={row.teams_recording_url} className="font-medium text-[#0B1F45] underline" target="_blank" rel="noreferrer">
                      Recording available →
                    </a>
                  </p>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-24 flex-shrink-0 text-sm text-gray-500">Date</span>
                  <span className="text-sm text-gray-800">{formatPresentationDate(row.actual_date ?? row.scheduled_date)}</span>
                </div>
                {row.recording_url ? (
                  <div className="flex items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-sm text-gray-500">Recording</span>
                    <span className="text-sm text-gray-800">
                      <a className="font-medium text-[#0B1F45] underline" href={row.recording_url} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    </span>
                  </div>
                ) : null}
                {row.presentation_file_path ? (
                  <div className="flex items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-sm text-gray-500">File</span>
                    <span className="text-sm text-gray-800">{row.presentation_file_path}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-2">
                <p className="text-sm font-medium text-gray-700">Attendees</p>
                <p className="mt-1 text-xs italic text-gray-400">
                  Email addresses will be used for future integrations (calendar invites, Teams meetings)
                </p>
                {row.attendees?.length ? (
                  <ul className="mt-2 space-y-3">
                    {row.attendees.map((a, i) => (
                      <li key={`${a.name}-${a.email}-${i}`} className="text-sm text-gray-700">
                        <div>
                          {a.name || 'Unnamed'}
                          {a.organisation ? ` — ${a.organisation}` : ''}
                        </div>
                        {a.email ? <div className="text-xs text-gray-400">{a.email}</div> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">—</p>
                )}
              </div>
              {row.notes ? <p className="mt-2 text-sm text-gray-600">{row.notes}</p> : null}
            </>
          ) : isScheduled && isEditing ? (
            <>
              <p className="mb-3 text-sm font-semibold text-[#0B1F45]">Presentation Scheduled</p>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Editing scheduled presentation — changes will update the existing record
              </div>
              {renderScheduleFields()}
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={busy}
                  onClick={() => {
                    setIsEditing(false);
                    setTeamsNotice(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-[#0B1F45] text-xs text-white hover:bg-[#162d5e]"
                  size="sm"
                  disabled={!scheduledDate || busy}
                  onClick={() => void saveScheduleEdits()}
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#0B1F45]">Presentation Scheduled</p>
                {isScheduled ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-0 pr-3 pl-2.5 text-xs [&_svg]:mr-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5"
                    onClick={beginEditScheduled}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Edit
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 space-y-1">
                <PresentationTypeReadOnly row={row} />
                {row.presentation_type === 'in_person' && row.location ? (
                  <p className="text-sm text-gray-500">📍 {row.location}</p>
                ) : null}
                {row.teams_join_url ? (
                  <a
                    href={row.teams_join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit rounded-lg bg-[#0F8A6E] px-3 py-2 text-sm font-medium text-white hover:bg-[#0c735d]"
                  >
                    Join Teams Meeting →
                  </a>
                ) : null}
                {row.teams_recording_url ? (
                  <p className="text-sm">
                    <a href={row.teams_recording_url} className="font-medium text-[#0B1F45] underline" target="_blank" rel="noreferrer">
                      Recording available →
                    </a>
                  </p>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-gray-700">Date: {row.scheduled_date ? formatDateTime(`${row.scheduled_date}T12:00:00`) : '—'}</p>
              {row.notes ? <p className="mt-2 text-sm text-gray-600">{row.notes}</p> : null}
              <div className="mt-2">
                <p className="text-xs italic text-gray-400">
                  Email addresses will be used for future integrations (calendar invites, Teams meetings)
                </p>
                <ul className="mt-2 space-y-2">
                  {row.attendees?.map((a, i) => (
                    <li key={`${a.name}-${a.email}-${i}`} className="text-sm text-gray-600">
                      <div>
                        {a.name || 'Unnamed'}
                        {a.organisation ? ` — ${a.organisation}` : ''}
                      </div>
                      {a.email ? <div className="text-xs text-gray-400">{a.email}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
              {isScheduled ? (
                <Button
                  type="button"
                  className="mt-4 bg-[#0F8A6E] text-white hover:bg-[#0c735d]"
                  onClick={() => {
                    setActualDate(row.scheduled_date ?? '');
                    setRecordingUrl(row.recording_url ?? '');
                    setCompletionNotes(row.notes ?? '');
                    setOpenComplete(true);
                  }}
                >
                  Mark as Completed
                </Button>
              ) : null}
            </>
          )}
        </section>
      )}

      {openComplete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-[#0B1F45]">Complete Presentation</h3>
            <p className="text-sm text-gray-500">Record actual delivery details and supporting links/files.</p>
            <div className="mt-4 grid gap-3">
              <label className={labelClass}>
                Actual date
                <input type="date" className={cn('mt-1', dsField.input)} value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
              </label>
              <label className={labelClass}>
                Recording URL
                <input
                  type="url"
                  className={cn('mt-1', dsField.input)}
                  placeholder="https://vroom.example.com/..."
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Presentation file (PDF/PPTX)
                <input
                  type="file"
                  accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setPresentationFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className={labelClass}>
                Notes
                <textarea className={cn('mt-1 min-h-[96px]', dsField.textarea)} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenComplete(false)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0F8A6E] text-white hover:bg-[#0c735d]" disabled={busy} onClick={() => void saveCompletion(true)}>
                {busy ? 'Saving…' : 'Save & Complete'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
