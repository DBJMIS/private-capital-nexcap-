import { QuestionnaireWorkspace } from '@/components/questionnaire/QuestionnaireWorkspace';

const PORTAL_Q_BASE = '/portal/questionnaire';

export const dynamic = 'force-dynamic';

export default async function PortalQuestionnaireByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuestionnaireWorkspace questionnaireId={id} basePath={PORTAL_Q_BASE} />;
}
