import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function QuestionnaireCompletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAuth();
  const profile = await getProfile();
  if (!profile) redirect('/login');

  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createQuestionnaireDbClient(profile);
  const access = await assertQuestionnaireAccess(db, profile, user.id, id);
  if ('error' in access) redirect('/questionnaires');

  const { data: q } = await db
    .from('vc_dd_questionnaires')
    .select('status, completed_at')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!q || String(q.status).toLowerCase() !== 'completed') {
    redirect(`/questionnaires/${id}`);
  }

  const fundName = access.application.fund_name?.trim() || 'Fund application';
  const completedRaw = q.completed_at;
  const completedAt =
    completedRaw != null && String(completedRaw).length > 0 ? new Date(String(completedRaw)) : null;
  const completedLabel = completedAt
    ? completedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-[#F3F4F6] px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-[#e5e7eb] bg-white p-10 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#0B1F45]"
            aria-hidden
          >
            <CheckCircle2 className="h-11 w-11 text-[#C9A227]" strokeWidth={2} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#0B1F45]">Questionnaire Submitted</h2>
          <p className="mt-2 text-sm font-medium text-[#374151]">{fundName}</p>
          <p className="mt-4 text-sm text-[#6b7280]">All 9 sections are complete.</p>
          <p className="mt-1 text-xs text-[#9ca3af]">Completed {completedLabel}</p>

          <div className="mt-8 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0B1F45]">What happens next</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#4b5563]">
              <li className="flex gap-2">
                <span className="text-[#C9A227]" aria-hidden>
                  •
                </span>
                <span>DBJ will review your submission.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#C9A227]" aria-hidden>
                  •
                </span>
                <span>You will be notified of next steps.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#C9A227]" aria-hidden>
                  •
                </span>
                <span>The due diligence assessment will begin.</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="bg-[#0B1F45] text-white hover:bg-[#162d5e]">
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="border-[#0B1F45] text-[#0B1F45] hover:bg-[#0B1F45]/5">
              <Link href={`/questionnaires/${id}`}>View Submission</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
