/**
 * Compliance classification for reporting obligations (Epic 4).
 */

export type ComplianceStatus =
  | 'fully_compliant'
  | 'partially_compliant'
  | 'audits_outstanding'
  | 'non_compliant';

export type ObligationLite = {
  report_type: string;
  status: string;
  due_date: string;
};

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function summarizeCompliance(rows: ObligationLite[]): {
  total_obligations: number;
  submitted: number;
  accepted: number;
  outstanding: number;
  overdue: number;
  compliance_status: ComplianceStatus;
} {
  const today = todayStr();
  let submitted = 0;
  let accepted = 0;
  let outstanding = 0;
  let overdue = 0;
  let auditIssue = false;

  for (const r of rows) {
    const st = (r.status ?? '').toLowerCase();
    if (st === 'submitted' || st === 'under_review') submitted += 1;
    if (st === 'accepted' || st === 'waived') accepted += 1;
    if (st === 'outstanding') outstanding += 1;
    if (st === 'overdue') overdue += 1;

    if (r.report_type === 'audited_annual' && st !== 'accepted' && st !== 'waived' && r.due_date <= today) {
      if (['outstanding', 'overdue', 'submitted', 'under_review', 'due'].includes(st)) {
        auditIssue = true;
      }
    }
  }

  const total_obligations = rows.length;
  let compliance_status: ComplianceStatus = 'partially_compliant';

  if (total_obligations === 0) {
    compliance_status = 'partially_compliant';
  } else if (overdue > 0) {
    compliance_status = 'non_compliant';
  } else if (auditIssue) {
    compliance_status = 'audits_outstanding';
  } else if (outstanding > 0) {
    compliance_status = 'partially_compliant';
  } else {
    const open = rows.filter((r) => {
      const st = (r.status ?? '').toLowerCase();
      if (st === 'accepted' || st === 'waived') return false;
      if (st === 'pending' || st === 'due') return r.due_date <= today;
      return st === 'submitted' || st === 'under_review';
    });
    compliance_status = open.length === 0 ? 'fully_compliant' : 'partially_compliant';
  }

  return {
    total_obligations,
    submitted,
    accepted,
    outstanding,
    overdue,
    compliance_status,
  };
}

/** UI badge for fund list row */
export function fundComplianceBadge(
  rows: ObligationLite[],
): { label: string; tone: 'teal' | 'amber' | 'red' | 'gray' } {
  if (rows.length === 0) {
    return { label: 'No data yet', tone: 'gray' };
  }
  const s = summarizeCompliance(rows);
  if (s.overdue > 0) {
    return { label: 'Overdue', tone: 'red' };
  }
  if (s.compliance_status === 'audits_outstanding') {
    return { label: 'Audits outstanding', tone: 'amber' };
  }
  if (s.outstanding > 0 || s.compliance_status === 'partially_compliant') {
    return { label: 'Reports outstanding', tone: 'amber' };
  }
  if (s.compliance_status === 'fully_compliant') {
    return { label: 'Fully compliant', tone: 'teal' };
  }
  return { label: 'Reports outstanding', tone: 'amber' };
}

export function complianceRateByType(
  rows: ObligationLite[],
  reportType: string,
): number {
  const subset = rows.filter((r) => r.report_type === reportType);
  if (subset.length === 0) return 0;
  const done = subset.filter((r) => {
    const st = (r.status ?? '').toLowerCase();
    return st === 'accepted' || st === 'waived';
  }).length;
  return Math.round((done / subset.length) * 100);
}
