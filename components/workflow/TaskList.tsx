'use client';

import { useMemo } from 'react';

import { TaskCard, type TaskRow } from '@/components/workflow/TaskCard';

const PRI_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function TaskList({
  tasks,
  onComplete,
  variant,
}: {
  tasks: TaskRow[];
  onComplete: (id: string) => void;
  variant: 'my_open' | 'assigned_by_me';
}) {
  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const pd = (PRI_ORDER[b.priority] ?? 0) - (PRI_ORDER[a.priority] ?? 0);
      if (pd !== 0) return pd;
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return ad - bd;
    });
  }, [tasks]);

  if (sorted.length === 0) {
    return <p className="text-sm text-navy/50">Nothing here.</p>;
  }

  return (
    <div className="space-y-3">
      {sorted.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          onComplete={onComplete}
          showAssignHint={variant === 'assigned_by_me'}
        />
      ))}
    </div>
  );
}
