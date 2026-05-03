'use client';

import { useEffect, useState } from 'react';

import type { PortfolioDashboardAssistantPayload } from '@/components/portfolio/PortfolioDashboardAssistantBridge';
import { PortfolioDashboardAssistantBridge } from '@/components/portfolio/PortfolioDashboardAssistantBridge';

/**
 * Defers mounting the assistant bridge until the client has hydrated so hooks run
 * under `AssistantRootProviders` (avoids RSC/SSR ordering issues with `useAssistant`).
 */
export function PortfolioAssistantGateClient({ payload }: { payload: PortfolioDashboardAssistantPayload }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  if (!hydrated) return null;
  return <PortfolioDashboardAssistantBridge payload={payload} />;
}
