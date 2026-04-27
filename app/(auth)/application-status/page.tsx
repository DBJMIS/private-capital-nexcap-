import { redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { dsCard, dsType } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ApplicationStatusPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) redirect('/unauthorized');
  if (profile.role !== 'fund_manager') {
    redirect('/dashboard');
  }

  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const { data: app } = await auth
    .from('vc_fund_applications')
    .select('id, fund_name, status, submitted_at, rejection_reason')
    .eq('tenant_id', profile.tenant_id)
    .eq('created_by', user?.id ?? '')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = app?.status ?? 'none';
  const isRejected = status === 'rejected';
  const isApproved = status === 'approved';
  const underReview = status === 'submitted' || status === 'due_diligence';

  return (
    <div className="w-full max-w-none space-y-6">
      <div className={cn(dsCard.padded)}>
        {!app && <p className={dsType.muted}>No application started yet. Open My Application to begin.</p>}
        {app && (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              <span className="font-medium text-gray-900">Fund:</span> {app.fund_name}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900">Status:</span>
              <StatusBadge status={status} />
            </p>
            {app.submitted_at && (
              <p>
                <span className="font-medium text-gray-900">Submitted:</span>{' '}
                {formatDateTime(app.submitted_at)}
              </p>
            )}
            {underReview && (
              <p className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-[#0F8A6E]">
                Your application is under review by DBJ.
              </p>
            )}
            {isApproved && (
              <p className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-[#0F8A6E]">
                Congratulations — your fund has been accepted. You can access Capital and Portfolio areas from the main
                navigation when enabled for your account.
              </p>
            )}
            {isRejected && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <span className="font-semibold">Application unsuccessful.</span>
                {app.rejection_reason ? ` ${app.rejection_reason}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
