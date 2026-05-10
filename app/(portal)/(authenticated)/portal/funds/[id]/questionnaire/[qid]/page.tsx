import { QuestionnaireWorkspace } from '@/components/questionnaire/QuestionnaireWorkspace';

export default async function FundQuestionnaireByIdPage({
  params,
}: {
  params: Promise<{ id: string; qid: string }>;
}) {
  const { id, qid } = await params;
  return <QuestionnaireWorkspace questionnaireId={qid} basePath={`/portal/funds/${id}/questionnaire`} />;
}
