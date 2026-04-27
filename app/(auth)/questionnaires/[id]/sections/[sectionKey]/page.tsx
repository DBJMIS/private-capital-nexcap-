import { notFound, redirect } from 'next/navigation';

import { allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';

export const dynamic = 'force-dynamic';

export default async function QuestionnaireSectionRedirectPage({
  params,
}: {
  params: Promise<{ id: string; sectionKey: string }>;
}) {
  const { id, sectionKey } = await params;
  if (!allSectionKeys().includes(sectionKey as DdSectionKey)) {
    notFound();
  }
  redirect(`/questionnaires/${id}?section=${sectionKey}`);
}
