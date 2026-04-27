import type { Metadata } from 'next';

import { TasksPageClient } from '@/components/workflow/TasksPageClient';
import { requireAuth } from '@/lib/auth/session';
export const metadata: Metadata = {
  title: 'Tasks',
};

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  await requireAuth();

  return (
    <div className="w-full max-w-none space-y-6">
      <TasksPageClient />
    </div>
  );
}
