'use client';

import type { ReactNode } from 'react';

import { AssistantButton } from '@/components/assistant/AssistantButton';

/** Auth shell wrapper: assistant context lives in `AssistantRootProviders` (root layout). */
export function AssistantLayoutRoot({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AssistantButton />
    </>
  );
}
