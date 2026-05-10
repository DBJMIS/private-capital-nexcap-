import type { CSSProperties, ReactNode } from 'react';

import {
  PIPELINE_STAGES_OVERVIEW,
  estimateCompletedStageIndexBeforeRejection,
  getStageIndexOverview,
  type PipelineStageOverview,
  type QuestionnaireLite,
} from '@/lib/portal/application-pipeline';
import { formatApplicationStatus, formatPortalDate } from '@/lib/portal/format-helpers';
import { cn } from '@/lib/utils';

type ApplicationFields = {
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type PortalApplicationOverviewCardProps = {
  application: ApplicationFields;
  questionnaire: QuestionnaireLite;
};

/** Design tokens — mockup (#hex). */
const BORDER_TERTIARY = '#EBEAE6';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_TERTIARY = '#9CA3AF';
const BG_SECONDARY = '#F3F4F6';
const BORDER_SECONDARY = '#E5E7EB';

function parseUtcDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysElapsedSince(createdAtIso: string): number {
  const start = parseUtcDateOnly(createdAtIso);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  const endUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.max(0, Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)));
}

type BadgeVariant = {
  background: string;
  border: string;
  color: string;
  showCheck: boolean;
};

function getStatusBadgeVariant(status: string): BadgeVariant {
  if (['committed', 'funded', 'contract_signed', 'approved'].includes(status)) {
    return {
      background: '#E1F5EE',
      border: '#5DCAA5',
      color: '#0F6E56',
      showCheck: true,
    };
  }
  if (
    ['dd_recommended', 'panel_evaluation', 'negotiation', 'due_diligence', 'dd_complete', 'site_visit', 'contract_review'].includes(status)
  ) {
    return {
      background: '#E6F1FB',
      border: '#85B7EB',
      color: '#185FA5',
      showCheck: false,
    };
  }
  if (
    ['pre_screening', 'preliminary_screening', 'pre_qualified', 'shortlisted', 'presentation_scheduled', 'presentation_complete', 'clarification_requested'].includes(
      status,
    )
  ) {
    return {
      background: '#FAEEDA',
      border: '#EF9F27',
      color: '#854F0B',
      showCheck: false,
    };
  }
  if (status === 'rejected') {
    return {
      background: '#FCEBEB',
      border: '#F09595',
      color: '#A32D2D',
      showCheck: false,
    };
  }
  return {
    background: BG_SECONDARY,
    border: BORDER_SECONDARY,
    color: TEXT_SECONDARY,
    showCheck: false,
  };
}

function StatusBadgeCheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type RowKind = 'completed' | 'current' | 'upcoming';

function buildRowModel(
  status: string,
  questionnaire: QuestionnaireLite,
  submittedAt: string | null,
): {
  mode: 'draft' | 'normal' | 'rejected';
  currentIdx: number;
  completedThrough: number;
} {
  const idx = getStageIndexOverview(status);
  if (status === 'rejected' || idx === -2) {
    return {
      mode: 'rejected',
      currentIdx: -2,
      completedThrough: estimateCompletedStageIndexBeforeRejection(questionnaire, submittedAt),
    };
  }
  if (status === 'draft' || idx === -1) {
    return { mode: 'draft', currentIdx: -1, completedThrough: -1 };
  }
  return {
    mode: 'normal',
    currentIdx: Math.min(Math.max(idx, 0), PIPELINE_STAGES_OVERVIEW.length - 1),
    completedThrough: -1,
  };
}

function milestoneRowKind(mode: 'draft' | 'normal' | 'rejected', i: number, currentIdx: number, completedThrough: number): RowKind {
  if (mode === 'draft') return 'upcoming';
  if (mode === 'rejected') {
    if (i <= completedThrough) return 'completed';
    return 'upcoming';
  }
  if (currentIdx < 0) return 'upcoming';
  if (i < currentIdx) return 'completed';
  if (i === currentIdx) return 'current';
  return 'upcoming';
}

function connectorBetween(above: RowKind, below: RowKind): 'teal' | 'gray' {
  if (above === 'completed' && (below === 'completed' || below === 'current')) return 'teal';
  return 'gray';
}

function TimelineCheckmark() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function TimelineXMark() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden stroke="white" strokeWidth={2.5} strokeLinecap="round">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

function DisclaimerInfoIcon({ style }: { style?: CSSProperties }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={style}>
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.5} />
      <path d="M12 16v-5M12 8h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function TimelineMilestoneDots({
  kind,
  hasLineBelow,
  lineBelowColor,
}: {
  kind: RowKind;
  hasLineBelow: boolean;
  lineBelowColor: 'teal' | 'gray';
}) {
  const lineHex = lineBelowColor === 'teal' ? '#9FE1CB' : '#D3D1C7';

  return (
    <div className="flex w-8 shrink-0 flex-col items-center">
      {kind === 'completed' ? (
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#1D9E75' }}>
          <TimelineCheckmark />
        </div>
      ) : null}
      {kind === 'current' ? (
        <div
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 0 0 4px #9FE1CB' }}
        >
          <div className="h-2 w-2 rounded-full bg-white" />
        </div>
      ) : null}
      {kind === 'upcoming' ? (
        <div className="box-border h-[22px] w-[22px] shrink-0 rounded-full bg-white" style={{ border: '2px solid #D3D1C7' }} />
      ) : null}
      {hasLineBelow ? <div className="mt-px min-h-[24px] w-[2px] flex-1 shrink-0" style={{ backgroundColor: lineHex }} /> : null}
    </div>
  );
}

function TimelineRejectedRow({ lineAbove }: { lineAbove: 'teal' | 'gray' }) {
  const lineHex = lineAbove === 'teal' ? '#9FE1CB' : '#D3D1C7';
  return (
    <div className="flex gap-3">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="h-3 min-h-[12px] w-[2px] shrink-0" style={{ backgroundColor: lineHex }} aria-hidden />
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#E24B4A' }}>
          <TimelineXMark />
        </div>
      </div>
      <div className="min-w-0 flex-1 pb-0 pl-3 pt-[2px]">
        <p className="text-[13px] font-medium leading-snug" style={{ color: TEXT_PRIMARY }}>
          Not proceeding
        </p>
      </div>
    </div>
  );
}

function statsCompletedValue(status: string, submittedAt: string | null): ReactNode {
  const terminal = ['committed', 'funded', 'contract_signed', 'approved'].includes(status);
  if (terminal && submittedAt?.trim()) {
    return (
      <p className="text-[13px] font-medium leading-snug" style={{ color: TEXT_PRIMARY }}>
        {formatPortalDate(submittedAt.slice(0, 10))}
      </p>
    );
  }
  if (terminal) {
    return (
      <p className="text-[13px] font-medium leading-snug" style={{ color: TEXT_PRIMARY }}>
        —
      </p>
    );
  }
  return (
    <p className="text-[13px] font-medium italic leading-snug" style={{ color: TEXT_SECONDARY }}>
      In progress
    </p>
  );
}

function statsDuration(status: string, createdAtIso: string): string {
  const terminal = ['committed', 'funded', 'contract_signed', 'approved'].includes(status);
  if (terminal) return `${daysElapsedSince(createdAtIso)} days`;
  return 'Ongoing';
}

export function PortalApplicationOverviewCard({ application: app, questionnaire }: PortalApplicationOverviewCardProps) {
  const badge = getStatusBadgeVariant(app.status);
  const { mode, currentIdx, completedThrough } = buildRowModel(app.status, questionnaire, app.submitted_at);
  const rejectionNote = app.rejection_reason?.trim();

  const submittedDisplay = app.submitted_at?.trim() ? formatPortalDate(app.submitted_at.slice(0, 10)) : '—';

  const lastIdx = PIPELINE_STAGES_OVERVIEW.length - 1;

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm md:col-span-2 lg:col-span-2" style={{ borderColor: BORDER_SECONDARY }}>
      <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-5" style={{ borderBottom: `0.5px solid ${BORDER_TERTIARY}` }}>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-medium uppercase leading-none" style={{ letterSpacing: '0.06em', color: TEXT_TERTIARY }}>
            APPLICATION
          </p>
          <h2 className="text-[17px] font-medium leading-snug" style={{ color: TEXT_PRIMARY }}>
            {app.fund_name}
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: TEXT_SECONDARY }}>
            {app.manager_name}
            {app.submitted_at?.trim() ? (
              <>
                {' '}
                · Submitted {formatPortalDate(app.submitted_at.slice(0, 10))}
              </>
            ) : (
              <>
                {' '}
                · Not yet submitted
              </>
            )}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5 rounded-[20px] px-3 py-1 text-[12px] font-medium leading-none"
          style={{
            backgroundColor: badge.background,
            border: `0.5px solid ${badge.border}`,
            color: badge.color,
          }}
        >
          {badge.showCheck ? <StatusBadgeCheckIcon /> : null}
          <span>{formatApplicationStatus(app.status)}</span>
        </div>
      </div>

      <div className="px-6 pb-6 pt-6">
        <div className="mb-7 overflow-hidden rounded-[8px]" style={{ border: `0.5px solid ${BORDER_TERTIARY}` }}>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {/* Stage */}
            <div
              className={cn('col-span-1 flex flex-col border-b-[0.5px] px-4 py-3 md:border-b-0')}
              style={{
                backgroundColor: '#E1F5EE',
                borderBottomColor: BORDER_TERTIARY,
                borderRight: '0.5px solid #5DCAA5',
              }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide leading-none" style={{ color: '#0F6E56' }}>
                Stage
              </p>
              <p className="mt-3 text-[15px] font-medium leading-snug" style={{ color: '#085041' }}>
                {formatApplicationStatus(app.status)}
              </p>
            </div>
            {/* Submitted */}
            <div
              className={cn('flex flex-col border-b-[0.5px] px-4 py-3 md:border-b-0 md:border-r')}
              style={{ borderBottomColor: BORDER_TERTIARY, borderRight: `0.5px solid ${BORDER_TERTIARY}` }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide leading-none" style={{ color: TEXT_TERTIARY }}>
                Submitted
              </p>
              <p className="mt-3 text-[13px] font-medium leading-snug" style={{ color: TEXT_PRIMARY }}>
                {submittedDisplay}
              </p>
            </div>
            {/* Completed */}
            <div
              className={cn('flex flex-col border-t-[0.5px] px-4 py-3 md:border-r md:border-t-0')}
              style={{ borderRight: `0.5px solid ${BORDER_TERTIARY}`, borderTopColor: BORDER_TERTIARY }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide leading-none" style={{ color: TEXT_TERTIARY }}>
                Completed
              </p>
              <div className="mt-3">{statsCompletedValue(app.status, app.submitted_at)}</div>
            </div>
            {/* Duration */}
            <div
              className={cn('flex flex-col border-t-[0.5px] px-4 py-3 md:border-t-0')}
              style={{ borderTopColor: BORDER_TERTIARY }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide leading-none" style={{ color: TEXT_TERTIARY }}>
                Duration
              </p>
              <p className="mt-3 text-[13px] font-medium leading-snug" style={{ color: TEXT_PRIMARY }}>
                {statsDuration(app.status, app.created_at)}
              </p>
            </div>
          </div>
        </div>

        <p className="mb-4 text-[11px] font-medium uppercase leading-none" style={{ letterSpacing: '0.06em', color: TEXT_TERTIARY }}>
          Review journey
        </p>

        <div className="max-h-[min(70vh,640px)] overflow-y-auto pr-1 md:max-h-none md:overflow-visible">
          <div className="">
            {PIPELINE_STAGES_OVERVIEW.map((stage: PipelineStageOverview, i: number) => {
              const kind = milestoneRowKind(mode, i, currentIdx, completedThrough);
              let lineBelowColor: 'teal' | 'gray' = 'gray';
              let hasLineBelow = false;

              if (i < lastIdx) {
                const nextKind = milestoneRowKind(mode, i + 1, currentIdx, completedThrough);
                lineBelowColor = connectorBetween(kind, nextKind);
                hasLineBelow = true;
              } else if (mode === 'rejected') {
                const lk = milestoneRowKind(mode, lastIdx, currentIdx, completedThrough);
                lineBelowColor = connectorBetween(lk, 'upcoming');
                hasLineBelow = true;
              }

              const showCurrentDateOnly = mode === 'normal' && kind === 'current';
              const labelColor = kind === 'upcoming' ? TEXT_TERTIARY : TEXT_PRIMARY;

              const isLastTimelineRow = i === lastIdx && mode !== 'rejected';
              const description =
                stage.key === 'committed' && stage.description && (kind === 'current' || kind === 'completed') ? (
                  <p className="mt-px text-[12px] leading-snug" style={{ color: '#0F6E56' }}>
                    {stage.description}
                  </p>
                ) : null;

              return (
                <div key={stage.key} className="flex min-w-0">
                  <TimelineMilestoneDots kind={kind} hasLineBelow={hasLineBelow} lineBelowColor={lineBelowColor} />
                  <div
                    className="min-w-0 flex-1 pl-3"
                    style={{
                      paddingBottom: isLastTimelineRow ? 0 : 20,
                      paddingTop: 2,
                    }}
                  >
                    <p className="text-[13px] font-medium leading-snug" style={{ color: labelColor }}>
                      {stage.label}
                    </p>
                    {showCurrentDateOnly ? (
                      <p className="mt-px text-[12px]" style={{ color: TEXT_TERTIARY }}>
                        {formatPortalDate(app.created_at.slice(0, 10))}
                      </p>
                    ) : null}
                    {description}
                  </div>
                </div>
              );
            })}

            {mode === 'rejected' ? (
              <TimelineRejectedRow
                lineAbove={connectorBetween(milestoneRowKind(mode, lastIdx, currentIdx, completedThrough), 'upcoming')}
              />
            ) : null}
          </div>
        </div>

        {mode === 'rejected' && rejectionNote ? (
          <div className="mt-4 rounded-[8px] px-4 py-3 text-[13px]" style={{ backgroundColor: '#FAEEDA', border: `0.5px solid #EF9F27`, color: '#633806' }}>
            <p className="font-medium">DBJ has provided the following context:</p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{rejectionNote}</p>
          </div>
        ) : null}

        <div className="mt-5 flex gap-2 border-t pt-4" style={{ borderTop: `0.5px solid ${BORDER_TERTIARY}` }}>
          <DisclaimerInfoIcon style={{ color: TEXT_TERTIARY }} />
          <p className="text-[11px] italic leading-relaxed" style={{ color: TEXT_TERTIARY }}>
            This reflects your application&apos;s progress through DBJ&apos;s review process. Detailed updates are provided by your relationship manager.
          </p>
        </div>
      </div>
    </section>
  );
}
