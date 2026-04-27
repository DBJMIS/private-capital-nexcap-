import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchAuditLogsTenantAdmin } from '@/lib/audit/fetch';
import { formatAuditTitle } from '@/lib/audit/format';
import { formatDateTime, formatShortDate } from '@/lib/format-date';

export type DashboardMetric = {
  label: string;
  value: string;
  accent: 'navy' | 'teal' | 'gold' | 'amber';
};

export type DashboardFunnelStage = { label: string; count: string };

export type DashboardRecentRow = {
  id: string;
  fund: string;
  manager: string;
  submitted: string;
  statusKey: string;
  score: number | null;
  href: string;
};

export type DashboardActivityItem = { id: string; at: string; text: string };

function utcYearStartIso(): string {
  const y = new Date().getUTCFullYear();
  return `${y}-01-01T00:00:00.000Z`;
}

function funnelLabel(
  status: string,
): 'Submitted' | 'Pre-screened' | 'In scoring' | 'Accepted' | 'Rejected' | null {
  if (status === 'draft') return null;
  if (status === 'rejected') return 'Rejected';
  if (status === 'submitted') return 'Submitted';
  if (
    new Set(['pre_screening', 'preliminary_screening', 'pre_qualified', 'shortlisted']).has(status)
  ) {
    return 'Pre-screened';
  }
  if (new Set(['panel_evaluation', 'presentation_scheduled', 'presentation_complete']).has(status)) {
    return 'In scoring';
  }
  if (
    new Set([
      'dd_recommended',
      'due_diligence',
      'dd_complete',
      'approved',
      'committed',
      'site_visit',
      'negotiation',
      'contract_review',
      'contract_signed',
      'clarification_requested',
    ]).has(status)
  ) {
    return 'Accepted';
  }
  return 'Accepted';
}

export async function loadDashboardData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{
  metrics: DashboardMetric[];
  funnelStages: DashboardFunnelStage[];
  recentRows: DashboardRecentRow[];
  activity: DashboardActivityItem[];
}> {
  const yearStart = utcYearStartIso();

  const { data: appRows, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, manager_name, status, submitted_at, updated_at, created_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (appErr) {
    throw new Error(appErr.message);
  }

  const apps = (appRows ?? []) as Array<{
    id: string;
    fund_name: string;
    manager_name: string;
    status: string;
    submitted_at: string | null;
    updated_at: string;
    created_at: string;
  }>;

  let activeApplications = 0;
  let inDiligence = 0;
  let approvedYtd = 0;
  let rejectedYtd = 0;

  const funnel: Record<DashboardFunnelStage['label'], number> = {
    Submitted: 0,
    'Pre-screened': 0,
    'In scoring': 0,
    Accepted: 0,
    Rejected: 0,
  };

  const approvedLike = new Set(['approved', 'committed', 'contract_signed']);

  for (const a of apps) {
    const { status } = a;
    if (status === 'draft') continue;

    if (status !== 'rejected' && !approvedLike.has(status)) {
      activeApplications += 1;
    }

    if (status === 'due_diligence') {
      inDiligence += 1;
    }

    if (approvedLike.has(status) && a.updated_at >= yearStart) {
      approvedYtd += 1;
    }

    if (status === 'rejected' && a.updated_at >= yearStart) {
      rejectedYtd += 1;
    }

    const fl = funnelLabel(status);
    if (fl) {
      funnel[fl] += 1;
    }
  }

  const metrics: DashboardMetric[] = [
    { label: 'Active applications', value: String(activeApplications), accent: 'navy' },
    { label: 'In diligence', value: String(inDiligence), accent: 'teal' },
    { label: 'Approved YTD', value: String(approvedYtd), accent: 'gold' },
    { label: 'Rejected YTD', value: String(rejectedYtd), accent: 'amber' },
  ];

  const funnelStages: DashboardFunnelStage[] = [
    { label: 'Submitted', count: String(funnel.Submitted) },
    { label: 'Pre-screened', count: String(funnel['Pre-screened']) },
    { label: 'In scoring', count: String(funnel['In scoring']) },
    { label: 'Accepted', count: String(funnel.Accepted) },
    { label: 'Rejected', count: String(funnel.Rejected) },
  ];

  const recentSource = [...apps]
    .filter((a) => a.status !== 'draft')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  const recentIds = recentSource.map((a) => a.id);
  const scoreByApp = new Map<string, number>();

  if (recentIds.length) {
    const { data: assessRows, error: asErr } = await supabase
      .from('vc_assessments')
      .select('application_id, overall_score, completed_at, status')
      .eq('tenant_id', tenantId)
      .in('application_id', recentIds)
      .in('status', ['completed', 'approved'])
      .order('completed_at', { ascending: false });

    if (asErr) {
      throw new Error(asErr.message);
    }

    for (const row of assessRows ?? []) {
      const aid = (row as { application_id: string }).application_id;
      const score = (row as { overall_score: number | null }).overall_score;
      if (scoreByApp.has(aid)) continue;
      if (typeof score === 'number' && !Number.isNaN(score)) {
        scoreByApp.set(aid, score);
      }
    }
  }

  const recentRows: DashboardRecentRow[] = recentSource.map((a) => ({
    id: a.id,
    fund: a.fund_name || '—',
    manager: a.manager_name?.trim() || '—',
    submitted: a.submitted_at ? formatShortDate(a.submitted_at) : formatShortDate(a.created_at),
    statusKey: a.status,
    score: scoreByApp.get(a.id) ?? null,
    href: `/fund-applications/${a.id}`,
  }));

  const auditRows = await fetchAuditLogsTenantAdmin(supabase, tenantId, 12, 0);
  const activity: DashboardActivityItem[] = auditRows.map((row) => ({
    id: row.id,
    at: formatDateTime(row.created_at),
    text: formatAuditTitle(row),
  }));

  return { metrics, funnelStages, recentRows, activity };
}
