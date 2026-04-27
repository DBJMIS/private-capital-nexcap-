import { notFound } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { AssessmentEditor } from '@/components/assessment/AssessmentEditor';
import { EMPTY_QUESTIONNAIRE_BUNDLE, loadQuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';

export const dynamic = 'force-dynamic';

export default async function AssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || (!can(profile, 'score:assessment') && !can(profile, 'write:applications'))) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const { id: assessmentId } = await params;
  const sp = await searchParams;
  const initialMainTab = sp.tab === 'insights' ? ('ai_insights' as const) : ('scoring' as const);

  const supabase = createServerClient();
  const { data: asmt } = await supabase
    .from('vc_assessments')
    .select('id, questionnaire_id')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!asmt) notFound();

  const qid = asmt.questionnaire_id as string | null;
  const questionnaireBundle = qid
    ? (await loadQuestionnaireBundle(supabase, profile.tenant_id, qid)) ?? EMPTY_QUESTIONNAIRE_BUNDLE
    : EMPTY_QUESTIONNAIRE_BUNDLE;
  const questionnaireStatus = questionnaireBundle.status;

  return (
    <div className="w-full max-w-none space-y-6">
      <AssessmentEditor
        assessmentId={assessmentId}
        actorRole={profile.role}
        canScoreNarrative={can(profile, 'score:assessment')}
        canRunAiAssessment={can(profile, 'score:assessment')}
        questionnaireBundle={questionnaireBundle}
        questionnaireStatus={questionnaireStatus}
        initialMainTab={initialMainTab}
      />
    </div>
  );
}
