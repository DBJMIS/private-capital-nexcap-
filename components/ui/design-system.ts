/**
 * DBJ VC / Appraisal Portal — shared design tokens and Tailwind class maps.
 * Import from here instead of hardcoding colors on individual pages.
 */

/** Reference palette (use Tailwind arbitrary values or theme keys in class strings). */
export const DS_COLORS = {
  navy: '#0B1F45',
  gold: '#C8973A',
  teal: '#0F8A6E',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
  pageBg: '#F3F4F6',
  cardBg: '#FFFFFF',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  label: '#374151',
} as const;

/** Layout */
export const dsLayout = {
  pageBg: 'bg-[#F3F4F6]',
  /** Use inside authenticated shell main content column (full width, side padding only) */
  contentMax: 'w-full px-6 py-6',
  sectionDivider: 'border-b border-gray-100',
} as const;

/** Cards */
export const dsCard = {
  base: 'rounded-xl border border-gray-200 bg-white p-6',
  /** Card with no inner padding (e.g. tables) */
  shell: 'overflow-hidden rounded-xl border border-gray-200 bg-white',
  padded: 'rounded-xl border border-gray-200 bg-white p-6',
} as const;

/** Typography (Tailwind) */
export const dsType = {
  pageTitle: 'text-2xl font-bold text-[#0B1F45]',
  sectionTitle: 'text-[13px] font-semibold uppercase tracking-wide text-[#0B1F45]',
  tableHeader: 'text-left text-xs font-medium uppercase tracking-wider text-gray-500',
  body: 'text-sm text-[#111827]',
  muted: 'text-[13px] text-[#6B7280]',
  label: 'mb-1 block text-sm font-medium text-gray-700',
  helper: 'mt-1 text-xs text-gray-500',
} as const;

/** Spacing */
export const dsSpace = {
  pagePadding: 'p-6 md:p-8',
  cardPadding: 'p-6',
  cardGap: 'gap-6',
  sectionHeaderMb: 'mb-4',
} as const;

/** Status → pill classes (DBJ appraisal pattern) */
export const STATUS_BADGE_MAP: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  not_started: 'bg-gray-100 text-gray-500',
  submitted: 'border border-blue-200 bg-blue-50 text-blue-700',
  pre_screening: 'bg-blue-100 text-blue-700',
  pre_screened: 'bg-blue-100 text-blue-700',
  pre_qualified: 'bg-teal-50 text-teal-700',
  preliminary_screening: 'bg-blue-100 text-blue-800',
  shortlisted: 'border border-purple-200 bg-purple-50 text-purple-700',
  presentation_scheduled: 'bg-purple-50 text-purple-700',
  presentation_complete: 'bg-purple-100 text-purple-800',
  panel_evaluation: 'bg-violet-50 text-violet-700',
  full_dd: 'bg-teal-50 text-teal-800',
  conditional_dd: 'bg-amber-50 text-amber-800',
  no_dd: 'bg-gray-100 text-gray-600',
  dd_recommended: 'bg-orange-50 text-orange-700',
  dd_complete: 'bg-teal-100 text-teal-800',
  clarification_requested: 'bg-orange-50 text-orange-700',
  site_visit: 'bg-cyan-50 text-cyan-700',
  negotiation: 'bg-blue-100 text-blue-800',
  contract_review: 'bg-indigo-100 text-indigo-800',
  contract_signed: 'bg-teal-100 text-teal-800',
  committed: 'bg-[#0B1F45] text-white',
  due_diligence: 'bg-amber-100 text-amber-700',
  approved: 'border border-teal-200 bg-teal-50 text-[#0F8A6E]',
  rejected: 'border border-red-200 bg-red-50 text-red-600',
  funded: 'bg-[#0B1F45] text-white',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-teal-50 text-[#0F8A6E]',
  pending: 'bg-gray-100 text-gray-600',
  active: 'bg-teal-50 text-[#0F8A6E]',
  on_hold: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-600',
  denied: 'bg-red-50 text-red-600',
  declined: 'bg-red-50 text-red-600',
  scoring: 'bg-amber-50 text-amber-700',
  in_scoring: 'bg-amber-50 text-amber-700',
  accepted: 'bg-teal-50 text-[#0F8A6E]',
  none: 'bg-gray-100 text-gray-600',
  /** CFP lifecycle */
  closed: 'bg-[#0B1F45] text-white',
  archived: 'bg-gray-50 text-gray-500 border border-gray-200',
};

export const STATUS_BADGE_BASE =
  'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';

export function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Human-readable status text (overrides naive title case for DD acronyms, etc.). */
export const STATUS_DISPLAY_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  pre_screening: 'Pre Screening',
  pre_qualified: 'Pre Qualified',
  preliminary_screening: 'Screening',
  shortlisted: 'Shortlisted',
  presentation_scheduled: 'Presentation Scheduled',
  presentation_complete: 'Presentation Complete',
  panel_evaluation: 'Panel Evaluation',
  dd_recommended: 'Due Diligence',
  due_diligence: 'Due Diligence',
  dd_complete: 'DD Complete',
  clarification_requested: 'Clarification Requested',
  site_visit: 'Site Visit',
  negotiation: 'Negotiation',
  contract_review: 'Contract Review',
  contract_signed: 'Contract Signed',
  committed: 'Committed',
  rejected: 'Rejected',
  full_dd: 'Full DD',
  conditional_dd: 'Conditional DD',
  no_dd: 'No Due Diligence',
};

function titleCaseStatusWords(raw: string): string {
  const s = raw.trim();
  if (!s) return '—';
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatStatusDisplayLabel(status: string): string {
  const key = normalizeStatusKey(status);
  const explicit = STATUS_DISPLAY_LABEL[key];
  if (explicit) return explicit;
  return titleCaseStatusWords(status);
}

export function statusBadgeClasses(status: string): string {
  const key = normalizeStatusKey(status);
  const tone = STATUS_BADGE_MAP[key] ?? STATUS_BADGE_MAP.pending;
  return `${STATUS_BADGE_BASE} ${tone}`;
}

/** Icon badge (section headers) */
export const ICON_BADGE_BASE =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4';

export const iconBadgeVariant = {
  navy: `${ICON_BADGE_BASE} bg-[#0B1F45] text-white`,
  teal: `${ICON_BADGE_BASE} bg-[#0F8A6E] text-white`,
  gold: `${ICON_BADGE_BASE} bg-[#C8973A] text-white`,
  amber: `${ICON_BADGE_BASE} bg-amber-100 text-amber-700`,
} as const;

export type IconBadgeVariant = keyof typeof iconBadgeVariant;

/** Buttons (presentation strings — prefer shadcn Button with className override, or use these) */
export const dsButton = {
  primary:
    'inline-flex items-center justify-center rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#162d5e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F45] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F45] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
} as const;

/** Form controls */
export const dsField = {
  input:
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B1F45]',
  textarea:
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B1F45]',
  required: 'text-[#C8973A]',
  groupCard: 'rounded-xl border border-gray-200 bg-white p-5',
  groupTitle:
    'mb-4 inline-block border-b-2 border-[#C8973A] pb-2 text-xs font-semibold uppercase tracking-wide text-[#0B1F45]',
} as const;

/** Tables */
export const dsTable = {
  container: 'overflow-hidden rounded-xl border border-gray-200 bg-white',
  thead: 'border-b border-gray-200 bg-gray-50',
  th: 'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500',
  tr: 'divide-y divide-gray-100 border-b border-gray-100 last:border-0',
  td: 'px-4 py-3.5 text-sm text-[#111827]',
  rowHover: 'cursor-pointer transition-colors hover:bg-[#F8F9FF]',
  empty: 'py-12 text-center text-sm text-gray-400',
} as const;

/** Stat / KPI */
export const dsStat = {
  number: 'text-3xl font-bold text-[#0B1F45]',
  label: 'mt-1 text-sm text-gray-500',
  icon: 'absolute right-4 top-5 h-8 w-8 text-gray-400',
} as const;

/** Empty state */
export const dsEmpty = {
  wrap: 'flex flex-col items-center justify-center py-12 text-center',
  icon: 'mb-3 h-12 w-12 text-gray-300',
  title: 'text-sm font-medium text-gray-500',
  subtitle: 'mt-1 text-xs text-gray-400',
} as const;

/** Numeric score display (e.g. diligence score) */
export function scoreValueClass(score: number): string {
  if (score >= 70) return 'font-mono text-sm font-semibold tabular-nums text-[#0F8A6E]';
  if (score >= 50) return 'font-mono text-sm font-semibold tabular-nums text-[#C8973A]';
  return 'font-mono text-sm font-semibold tabular-nums text-red-600';
}

/** Action link (“Open ›”) */
export const dsActionLink =
  'inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]';
