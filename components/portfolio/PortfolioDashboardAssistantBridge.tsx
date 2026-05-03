'use client';

import { useEffect } from 'react';

import { PAGE_SUGGESTED_PROMPTS } from '@/lib/assistant/page-contexts';
import { useAssistant } from '@/contexts/AssistantContext';
import { useAuth } from '@/hooks/use-auth';

export type PortfolioDashboardAssistantPayload = {
  totalFunds: number;
  totalCommittedCapital: number;
  totalCalledCapital: number | null;
  totalDistributions: number | null;
  totalNAV: number | null;
  deploymentRate: number | null;
  averageMOIC: number | null;
  averageIRR: number | null;
  fundsOnWatchlist: number;
  complianceOverdue: number;
  fundsDueInNext14Days: number;
  fullyCompliantFunds: number;
  fundsNeedingAttention: number;
  funds: Array<{
    name: string;
    committedCapital: number;
    calledCapital: number | null;
    distributions: number | null;
    nav: number | null;
    moic: number | null;
    irr: number | null;
    status: string;
    onWatchlist: boolean;
  }>;
  note: string;
};

export function PortfolioDashboardAssistantBridge({ payload }: { payload: PortfolioDashboardAssistantPayload }) {
  const { setPageContext } = useAssistant();
  const { user, role, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user?.user_id || !role) return;
    setPageContext({
      pageId: 'portfolio-dashboard',
      pageTitle: 'Portfolio Dashboard',
      userRole: role,
      userId: user.user_id,
      data: { ...payload } as Record<string, unknown>,
      suggestedPrompts: PAGE_SUGGESTED_PROMPTS['portfolio-dashboard'],
    });
    return () => setPageContext(null);
  }, [authLoading, payload, role, setPageContext, user?.user_id]);

  return null;
}
