/**
 * Server-only session/profile helpers for NextAuth.
 *
 * File path: lib/auth/session.ts
 */

import 'server-only';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth-options';
import type { Profile, Session, VCRole } from '@/types/auth';

function isVCRole(r: string | null | undefined): r is VCRole {
  if (!r) return false;
  return (
    r === 'admin' ||
    r === 'it_admin' ||
    r === 'pctu_officer' ||
    r === 'investment_officer' ||
    r === 'portfolio_manager' ||
    r === 'panel_member' ||
    r === 'senior_management' ||
    r === 'analyst' ||
    r === 'officer' ||
    r === 'viewer' ||
    r === 'fund_manager'
  );
}

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function getProfile(): Promise<Profile | null> {
  const session = await getSession();
  const user = session?.user;
  if (!user || !user.tenant_id || !user.profile_id || !isVCRole(user.role)) {
    return null;
  }

  return {
    id: user.id,
    profile_id: user.profile_id,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email ?? '',
    name: user.name ?? '',
    user_id: user.user_id,
    full_name: user.full_name,
    is_active: user.is_active,
  };
}

export async function requireAuth(): Promise<NonNullable<Session['user']>> {
  const session = await getSession();
  if (!session?.user) {
    redirect('/login');
  }
  return session.user;
}

export class ForbiddenError extends Error {
  status = 403;

  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function requireRole(role: VCRole): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || profile.role !== role) {
    throw new ForbiddenError('Forbidden');
  }
  return profile;
}
