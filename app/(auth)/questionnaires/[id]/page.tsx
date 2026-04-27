import { QuestionnaireWorkspace } from '@/components/questionnaire/QuestionnaireWorkspace';

export const dynamic = 'force-dynamic';

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuestionnaireWorkspace questionnaireId={id} />;
}
