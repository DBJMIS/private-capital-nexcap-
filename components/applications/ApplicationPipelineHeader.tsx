'use client';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import type { PipelineTabKey } from '@/lib/applications/pipeline';
import { PIPELINE_STAGES, pipelineStageIndex } from '@/lib/applications/pipeline';

type TabItem = { key: PipelineTabKey; label: string; hidden?: boolean };

export function ApplicationPipelineHeader({
  fundName,
  managerName,
  status,
  activeTab,
  tabs,
  onTabChange,
  onStageClick,
}: {
  fundName: string;
  managerName: string;
  status: string;
  activeTab: PipelineTabKey;
  tabs: TabItem[];
  onTabChange: (tab: PipelineTabKey) => void;
  onStageClick?: (stageKey: string) => void;
}) {
  const currentStage = pipelineStageIndex(status);
  const isRejected = status.trim().toLowerCase() === 'rejected';
  const lastIdx = PIPELINE_STAGES.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-bold leading-tight text-[#0B1F45]">{fundName}</h2>
          <p className="mt-1 text-sm text-gray-500">{managerName}</p>
        </div>
        <StatusBadge status={status} className="px-3 py-1 text-sm" />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[720px] max-w-full md:min-w-[900px]">
          <div className="flex items-center">
            {PIPELINE_STAGES.map((stage, idx) => {
              const completed = idx < currentStage;
              const current = !isRejected && idx === currentStage;
              const rejected = isRejected && stage.key === 'committed';
              const clickable = completed || current || rejected;
              return (
                <div key={stage.key} className="flex min-w-[52px] flex-1 items-center md:min-w-[72px]">
                  <button
                    type="button"
                    disabled={!clickable || !onStageClick}
                    onClick={() => onStageClick?.(stage.key)}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                      completed && 'border-teal-500 bg-teal-500 text-white',
                      current && 'border-[#0B1F45] bg-[#0B1F45] text-white',
                      !completed && !current && !rejected && 'border-gray-300 bg-white text-gray-400',
                      rejected && 'border-red-500 bg-red-500 text-white',
                      clickable && onStageClick && 'cursor-pointer',
                    )}
                  >
                    {rejected ? '✗' : completed ? '✓' : current ? <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" /> : '○'}
                  </button>
                  {idx < lastIdx ? (
                    <div className={cn('h-0.5 min-w-[4px] flex-1', completed ? 'bg-teal-500' : 'bg-gray-300')} />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex">
            {PIPELINE_STAGES.map((stage) => (
              <div
                key={`${stage.key}-label`}
                className="min-w-[52px] flex-1 text-center text-[10px] font-medium leading-tight text-gray-500 md:min-w-[72px] md:text-xs"
              >
                <span className="sm:hidden">{stage.shortLabel}</span>
                <span className="hidden sm:inline">{stage.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-gray-200">
        {tabs
          .filter((t) => !t.hidden)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={cn(
                'border-b-2 pb-2 text-sm transition-colors',
                activeTab === tab.key
                  ? 'border-[#C8973A] font-semibold text-[#0B1F45]'
                  : 'border-transparent text-gray-400 hover:text-gray-600',
              )}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
      </div>
    </div>
  );
}
