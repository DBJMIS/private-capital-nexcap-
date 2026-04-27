'use client';

import { useSession } from 'next-auth/react';

import type { VCRole } from '@/types/auth';

export function useAuth() {
  const { data, status } = useSession();
  const user = data?.user ?? null;

  return {
    user,
    role: (user?.role ?? null) as VCRole | null,
    tenant_id: user?.tenant_id ?? null,
    isLoading: status === 'loading',
  };
}
