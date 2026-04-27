/** Compliance dashboard status column (Epic 4). */
export const COMPLIANCE_BADGE: Record<string, { label: string; className: string }> = {
  fully_compliant: {
    label: 'Fully Compliant',
    className: 'bg-teal-50 text-teal-700 border border-teal-200',
  },
  audits_outstanding: {
    label: 'Audits Outstanding',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  reports_outstanding: {
    label: 'Reports Outstanding',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  non_compliant: {
    label: 'Non-Compliant',
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
  partially_compliant: {
    label: 'In Progress',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  no_data: {
    label: 'No Data',
    className: 'bg-gray-100 text-gray-500',
  },
};
