import { notFound } from 'next/navigation';

import { AssessmentPeriodStartClient } from '@/components/portfolio/AssessmentPeriodStartClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function NewAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const { id: fundId } = await params;
  const supabase = createServerClient();

  const { data: fund, error } = await supabase
    .from('vc_portfolio_funds')
    .select('id, fund_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (error || !fund) notFound();

  const { data: existingRows } = await supabase
    .from('vc_quarterly_assessments')
    .select('id, assessment_period, status, assessment_date')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('assessment_date', { ascending: false });

  return (
    <AssessmentPeriodStartClient
      fundId={fundId}
      fundName={(fund as { fund_name: string }).fund_name}
      existingAssessments={
        (existingRows ?? []) as Array<{
          id: string;
          assessment_period: string;
          status: string;
        }>
      }
    />
  );
}
