/**
 * Shared auth + DB client for questionnaire structured-list API routes.
 * File path: lib/questionnaire/structured-list-api-context.ts
 */

import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';

export type StructuredListApiOk = {
  db: ReturnType<typeof createQuestionnaireDbClient>;
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>;
  userId: string;
  tenantId: string;
  questionnaireId: string;
};

export async function getStructuredListApiContext(
  questionnaireId: string,
): Promise<NextResponse | StructuredListApiOk> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createQuestionnaireDbClient(profile);
  const access = await assertQuestionnaireAccess(db, profile, user.id, questionnaireId);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const loaded = await loadQuestionnaireForTenant(db, profile.tenant_id, questionnaireId);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return { db, profile, userId: user.id, tenantId: profile.tenant_id, questionnaireId };
}
