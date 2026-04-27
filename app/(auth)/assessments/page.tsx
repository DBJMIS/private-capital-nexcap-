import Link from 'next/link';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { ActionButton } from '@/components/ui/ActionButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { dsCard } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AssessmentsListPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from('vc_assessments')
    .select('id, status, overall_score, passed, completed_at, application_id, evaluator_id')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  const appIds = [...new Set((rows ?? []).map((r: { application_id: string }) => r.application_id))];
  const apps = new Map<string, string>();
  if (appIds.length) {
    const { data: arows } = await supabase
      .from('vc_fund_applications')
      .select('id, fund_name')
      .eq('tenant_id', profile.tenant_id)
      .in('id', appIds);
    for (const a of arows ?? []) apps.set(a.id, a.fund_name);
  }

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">Assessments & Scoring</h1>
          <p className="mt-1 text-sm text-gray-400">
            Review criteria scores, AI insights, and pass or fail outcomes for fund applications.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
        >
          <Link href="/fund-applications">Fund applications</Link>
        </Button>
      </div>
      <ul className="space-y-2">
        {(rows ?? []).length === 0 && (
          <li className={cn(dsCard.padded, 'text-sm text-gray-500')}>
            No assessments yet. Create one from a submitted questionnaire.
          </li>
        )}
        {(rows ?? []).map(
          (r: {
            id: string;
            status: string;
            overall_score: number | null;
            passed: boolean | null;
            application_id: string;
          }) => (
            <li
              key={r.id}
              className={cn(dsCard.shell, 'flex flex-wrap items-center justify-between gap-3 p-4')}
            >
              <div className="min-w-0">
                <p className="font-medium text-[#0B1F45]">{apps.get(r.application_id) ?? 'Application'}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <StatusBadge status={r.status} />
                  {r.overall_score != null && <span>Score {r.overall_score}</span>}
                  {r.passed != null && <span>{r.passed ? 'Pass' : 'Below threshold'}</span>}
                </p>
              </div>
              <ActionButton href={`/assessments/${r.id}`}>Open assessment</ActionButton>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
