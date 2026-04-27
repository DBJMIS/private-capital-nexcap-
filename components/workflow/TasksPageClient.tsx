'use client';

import { useCallback, useEffect, useState } from 'react';
import { ListTodo, UserRound } from 'lucide-react';

import { TaskList } from '@/components/workflow/TaskList';
import type { TaskRow } from '@/components/workflow/TaskCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { dsCard } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export function TasksPageClient() {
  const [mine, setMine] = useState<TaskRow[]>([]);
  const [delegated, setDelegated] = useState<TaskRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const [a, b] = await Promise.all([
      fetch('/api/tasks?view=my_open&limit=200'),
      fetch('/api/tasks?view=assigned_by_me&limit=200'),
    ]);
    const aj = (await a.json()) as { tasks?: TaskRow[]; error?: string };
    const bj = (await b.json()) as { tasks?: TaskRow[]; error?: string };
    if (!a.ok) setErr(aj.error ?? 'Failed to load tasks');
    else setMine(aj.tasks ?? []);
    if (b.ok) setDelegated(bj.tasks ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const complete = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}/complete`, { method: 'POST' });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Could not complete');
      return;
    }
    await load();
  };

  return (
    <div className="space-y-6">
      {err && <p className="text-sm text-red-700">{err}</p>}

      <section className={cn(dsCard.padded)}>
        <SectionHeader
          icon={ListTodo}
          iconVariant="navy"
          title="My open tasks"
          count={mine.length}
          description="Sorted by priority and due date. Overdue items are highlighted."
        />
        {mine.length === 0 ? (
          <EmptyState icon={ListTodo} title="Nothing here" subtitle="You have no open tasks assigned to you." />
        ) : (
          <TaskList tasks={mine} onComplete={(id) => void complete(id)} variant="my_open" />
        )}
      </section>

      <section className={cn(dsCard.padded)}>
        <SectionHeader
          icon={UserRound}
          iconVariant="teal"
          title="Tasks I assigned to others"
          count={delegated.length}
        />
        {delegated.length === 0 ? (
          <EmptyState icon={UserRound} title="Nothing here" subtitle="You have not delegated any open tasks." />
        ) : (
          <TaskList tasks={delegated} onComplete={(id) => void complete(id)} variant="assigned_by_me" />
        )}
      </section>
    </div>
  );
}
