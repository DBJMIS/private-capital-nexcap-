import { notFound } from 'next/navigation';

import { AssessmentReviewClient } from '@/components/portfolio/AssessmentReviewClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { VcQuarterlyAssessment } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; assessmentId: string }>;
}) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const { id: fundId, assessmentId } = await params;
  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('fund_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fErr || !fund) notFound();

  const { data: row, error: aErr } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .maybeSingle();

  if (aErr || !row) notFound();

  const r = row as VcQuarterlyAssessment;
  const { data: ddRef } = r.dd_assessment_id
    ? await supabase
        .from('vc_assessments')
        .select('id, recommendation, overall_weighted_score, overall_score, completed_at')
        .eq('tenant_id', profile.tenant_id)
        .eq('id', r.dd_assessment_id)
        .maybeSingle()
    : { data: null };
  const ids = [r.assessed_by, r.approved_by].filter((x): x is string => !!x);
  const { data: profs } = ids.length
    ? await supabase.from('vc_profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nm = new Map((profs ?? []).map((p) => [p.id as string, (p as { full_name: string }).full_name]));

  const enriched = {
    ...r,
    dd_reference: ddRef
      ? {
          id: (ddRef as { id: string }).id,
          recommendation: (ddRef as { recommendation: string | null }).recommendation,
          score:
            (ddRef as { overall_weighted_score: number | null; overall_score: number | null }).overall_weighted_score ??
            (ddRef as { overall_weighted_score: number | null; overall_score: number | null }).overall_score ??
            null,
          completed_at: (ddRef as { completed_at: string | null }).completed_at,
        }
      : null,
    assessed_by_name: r.assessed_by ? nm.get(r.assessed_by) ?? '—' : null,
    approved_by_name: r.approved_by ? nm.get(r.approved_by) ?? '—' : null,
  };

  const isAdmin = profile.role === 'admin';

  return (
    <AssessmentReviewClient
      fundId={fundId}
      fundName={(fund as { fund_name: string }).fund_name}
      initial={enriched}
      isAdmin={isAdmin}
    />
  );
}
