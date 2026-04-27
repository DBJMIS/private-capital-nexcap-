import type { Metadata } from 'next';

import { ApprovalQueue } from '@/components/workflow/ApprovalQueue';
import { requireAuth } from '@/lib/auth/session';
export const metadata: Metadata = {
  title: 'Approvals',
};

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  await requireAuth();

  return (
    <div className="w-full max-w-none space-y-6">
      <ApprovalQueue />
    </div>
  );
}
