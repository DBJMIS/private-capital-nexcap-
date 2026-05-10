const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseDateOnlyUtc(dateString: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d));
}

/** Format date to DD MMM YYYY (e.g. "07 May 2026"). */
export function formatPortalDate(dateString: string): string {
  const dt = parseDateOnlyUtc(dateString);
  if (Number.isNaN(dt.getTime())) return dateString;
  const day = String(dt.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[dt.getUTCMonth()] ?? '';
  const year = dt.getUTCFullYear();
  return `${day} ${mon} ${year}`;
}

/** Negative = overdue (due date in the past). */
export function daysFromNow(dateString: string): number {
  const due = parseDateOnlyUtc(dateString);
  if (Number.isNaN(due.getTime())) return 0;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((dueUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

export function formatReportType(type: string): string {
  switch (type) {
    case 'quarterly_financial':
      return 'Quarterly Financial Report';
    case 'audited_annual':
      return 'Annual Audited Accounts';
    case 'quarterly_investment_mgmt':
      return 'Quarterly Investment Management';
    case 'inhouse_quarterly':
      return 'In-House Quarterly Report';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function formatApplicationStatus(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    pre_screening: 'Pre-screening',
    preliminary_screening: 'Preliminary screening',
    pre_qualified: 'Pre-qualified',
    shortlisted: 'Shortlisted',
    presentation_scheduled: 'Presentation scheduled',
    presentation_complete: 'Presentation complete',
    panel_evaluation: 'Panel evaluation',
    clarification_requested: 'Clarification requested',
    due_diligence: 'Due diligence',
    dd_recommended: 'DD recommended',
    dd_complete: 'DD complete',
    site_visit: 'Site visit',
    negotiation: 'Negotiation',
    contract_review: 'Contract review',
    contract_signed: 'Contract signed',
    approved: 'Approved',
    committed: 'Committed',
    rejected: 'Rejected',
  };
  return map[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Plain-language portal copy for fund managers (no scoring or internal methodology). */
export type PortalApplicationStatusNarrative = {
  headline: string;
  body: string;
};

export function portalApplicationStatusNarrative(status: string): PortalApplicationStatusNarrative {
  const commonContact =
    ' Your DBJ relationship manager will reach out if anything further is needed from your side.';
  const underReviewBody =
    'Your application is with the DBJ investment team for review.' + commonContact;

  switch (status) {
    case 'draft':
      return {
        headline: 'Application draft',
        body:
          'Your application has not been submitted yet. Submit it when all required sections are ready; after submission, review and next steps proceed with DBJ.',
      };
    case 'submitted':
      return {
        headline: 'Application received',
        body:
          'DBJ has received your submission and will begin processing shortly.' +
          commonContact,
      };
    case 'pre_screening':
    case 'preliminary_screening':
      return {
        headline: 'Assessment in progress',
        body:
          underReviewBody +
          ' Detailed outcomes of internal evaluations are not shared in this portal.',
      };
    case 'pre_qualified':
      return {
        headline: 'Pre-qualified',
        body:
          'Your application has progressed to a pre-qualified stage. DBJ will communicate any further requirements or timelines.' +
          commonContact,
      };
    case 'shortlisted':
    case 'presentation_scheduled':
    case 'presentation_complete':
    case 'panel_evaluation':
      return {
        headline: 'Under screening and evaluation',
        body:
          'Your submission is progressing through DBJ screening and evaluation.' +
          commonContact +
          ' Outcomes stay high-level here; substantive updates come from your relationship manager.',
      };
    case 'clarification_requested':
      return {
        headline: 'Additional information may be requested',
        body:
          'DBJ may need supplementary information before your application moves forward.' +
          commonContact +
          ' Please rely on directions from your relationship manager for specifics.',
      };
    case 'due_diligence':
      return {
        headline: 'Due diligence in progress',
        body:
          'Your application is subject to expanded due diligence. The team may request materials or meetings as part of this work.' +
          commonContact,
      };
    case 'dd_recommended':
      return {
        headline: 'Positive progress toward diligence',
        body:
          'Your application has been recommended through an internal diligence stage. This does not guarantee final approval; DBJ will confirm next milestones.' +
          commonContact,
      };
    case 'dd_complete':
      return {
        headline: 'Diligence stage complete',
        body:
          'The active due diligence workflow for your application has concluded from a process standpoint. Decision bodies will determine next outcomes.' +
          commonContact,
      };
    case 'site_visit':
      return {
        headline: 'Engagement activity in progress',
        body:
          'DBJ-related engagement (such as meetings or visits) may be underway or pending. Coordinating dates and agendas will come from your relationship manager.',
      };
    case 'negotiation':
    case 'contract_review':
      return {
        headline: 'Terms under discussion',
        body:
          'Your application has advanced to documentation and negotiation. Commercial and legal discussions are coordinated with your relationship manager and counsel as applicable.',
      };
    case 'contract_signed':
      return {
        headline: 'Contract executed',
        body:
          'Contractual documentation has progressed to execution. Operational onboarding and disbursement timelines will be aligned with your team by DBJ.',
      };
    case 'approved':
      return {
        headline: 'Approval',
        body:
          'Your fund has progressed through committee approval aligned with applicable policy. Expect follow-up regarding commitment sizing and closure steps from your relationship manager.',
      };
    case 'committed':
      return {
        headline: 'Commitment confirmed',
        body:
          'DBJ recognizes this application as committed per process. Ongoing obligations and notices will surface in the relevant portal sections.',
      };
    case 'rejected':
      return {
        headline: 'Application not proceeding',
        body:
          'After review, DBJ is not progressing this application further at this time. Any feedback DBJ chooses to share appears below.',
      };
    default:
      return {
        headline: formatApplicationStatus(status),
        body:
          'Your application is being processed.' +
          commonContact +
          ' This summary is limited to workflow status.',
      };
  }
}

export function formatPortalCurrency(amount: number, currency: string): string {
  const c = currency.trim().toUpperCase();
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(abs);
  if (c === 'USD') return amount < 0 ? `-US$${formatted}` : `US$${formatted}`;
  if (c === 'JMD') return amount < 0 ? `-J$${formatted}` : `J$${formatted}`;
  return `${amount < 0 ? '-' : ''}${c} ${formatted}`;
}

/**
 * Map application status to timeline step index 0–4:
 * 0 Submitted, 1 Under review, 2 Due diligence, 3 Approved, 4 Committed.
 */
export function statusToTimelineStep(status: string): number {
  if (status === 'draft' || status === 'pre_qualified') return -1;

  if (status === 'submitted') return 0;

  const step1 = new Set([
    'pre_screening',
    'preliminary_screening',
    'shortlisted',
    'presentation_scheduled',
    'presentation_complete',
    'panel_evaluation',
    'clarification_requested',
  ]);
  if (step1.has(status)) return 1;

  const step2 = new Set(['due_diligence', 'dd_recommended', 'dd_complete', 'site_visit']);
  if (step2.has(status)) return 2;

  const step3 = new Set(['approved', 'negotiation', 'contract_review', 'contract_signed']);
  if (step3.has(status)) return 3;

  if (status === 'committed') return 4;

  if (status === 'rejected') return -2;

  return 0;
}

export function snapshotPeriodLabel(
  periodLabel: string | null,
  periodYear: number,
  periodQuarter: number | null,
): string {
  if (periodLabel?.trim()) return periodLabel.trim();
  if (periodQuarter != null && Number.isFinite(periodQuarter)) {
    return `Q${periodQuarter} ${periodYear}`;
  }
  return String(periodYear);
}
