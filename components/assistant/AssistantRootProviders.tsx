'use client';

import type { ReactNode } from 'react';

import { AssistantProvider } from '@/contexts/AssistantContext';

/** Mounts once at the app root so all client subtrees (including RSC page slots) share the same assistant context. */
export function AssistantRootProviders({ children }: { children: ReactNode }) {
  return <AssistantProvider>{children}</AssistantProvider>;
}
