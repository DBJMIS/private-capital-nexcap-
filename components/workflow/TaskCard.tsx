'use client';

import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  entity_type: string;
  entity_id: string;
  assigned_to: string | null;
  created_by: string;
  completed_at: string | null;
};

const PRI_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function TaskCard({
  task,
  onComplete,
  showAssignHint,
}: {
  task: TaskRow;
  onComplete: (id: string) => void;
  showAssignHint?: boolean;
}) {
  const overdue =
    task.due_date &&
    task.status !== 'completed' &&
    task.status !== 'cancelled' &&
    new Date(task.due_date) < new Date(new Date().toDateString());

  return (
    <div
      className={cn(
        'rounded-xl border p-4 shadow-shell',
        overdue ? 'border-amber-400 bg-amber-50/80' : 'border-shell-border bg-shell-card',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-navy">{task.title}</p>
          <p className="mt-1 text-xs text-navy/55">
            {task.entity_type} · Priority {task.priority} (P{PRI_ORDER[task.priority] ?? 0})
            {task.due_date && ` · Due ${formatShortDate(task.due_date)}`}
          </p>
          {overdue && <p className="mt-1 text-xs font-medium text-amber-900">Overdue</p>}
          {task.description && <p className="mt-2 text-sm text-navy/75">{task.description}</p>}
          {showAssignHint && <p className="mt-2 text-xs text-navy/45">You assigned this task to someone else.</p>}
        </div>
        {task.status !== 'completed' && task.status !== 'cancelled' && (
          <Button type="button" size="sm" variant="outline" onClick={() => onComplete(task.id)}>
            Complete
          </Button>
        )}
      </div>
    </div>
  );
}
