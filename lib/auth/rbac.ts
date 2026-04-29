/**
 * Route and UI access helpers for platform RBAC.
 *
 * File path: lib/auth/rbac.ts
 */

import type { VCRole } from '@/types/auth';
import { ROLE_LABELS } from '@/lib/auth/role-labels';

export const USER_ROLE_CACHE_HEADER = 'x-vc-effective-role';

/** Set by middleware for server layouts (pathname in edge). */
export const VC_PATHNAME_HEADER = 'x-vc-pathname';

/** Roles stored in `vc_user_roles` / invitations (excludes legacy aliases). */
export const ASSIGNABLE_INVITE_ROLES = [
  'pctu_officer',
  'portfolio_manager',
  'investment_officer',
  'panel_member',
  'it_admin',
  'senior_management',
] as const;

export type AssignableInviteRole = (typeof ASSIGNABLE_INVITE_ROLES)[number];

/** Zod / forms: tuple for `z.enum(...)` */
export const ASSIGNABLE_INVITE_ROLES_TUPLE = ASSIGNABLE_INVITE_ROLES as unknown as [string, ...string[]];

const LEGACY_PIPELINE: VCRole[] = ['analyst', 'officer'];

/** Map session role to a canonical role key used by route checks. */
export function canonicalRoleForAccess(role: string | null | undefined): string | null {
  if (!role) return null;
  if (role === 'analyst' || role === 'officer') return 'investment_officer';
  return role;
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'it_admin';
}

export function roleDisplayLabel(role: string): string {
  if (role in ROLE_LABELS) return ROLE_LABELS[role]!;
  if (role === 'analyst') return 'Analyst';
  if (role === 'officer') return 'Officer';
  if (role === 'viewer') return 'Viewer';
  if (role === 'fund_manager') return 'Fund Manager';
  return role;
}

/**
 * Whether the given role may access a pathname (middleware / coarse gates).
 * `admin` always passes before this is called.
 */
export function pathnameAllowedForRole(pathname: string, role: string): boolean {
  if (pathname === '/unauthorized' || pathname.startsWith('/unauthorized/')) {
    return true;
  }
  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return true;
  }

  const r = canonicalRoleForAccess(role) ?? role;

  if (r === 'fund_manager') {
    return pathname.startsWith('/onboarding') || pathname.startsWith('/application-status');
  }

  const isPortfolioExecutive =
    pathname === '/portfolio/executive' || pathname.startsWith('/portfolio/executive/');

  const pipelinePaths =
    pathname === '/dashboard' ||
    pathname === '/' ||
    pathname.startsWith('/dashboard/') ||
    pathname.startsWith('/cfp') ||
    pathname.startsWith('/fund-applications') ||
    pathname.startsWith('/dd-questionnaires') ||
    pathname.startsWith('/questionnaires') ||
    pathname.startsWith('/applications');

  const assessmentsPaths = pathname.startsWith('/assessments');

  const settingsPaths = pathname.startsWith('/settings');

  const legacyStaffExtras =
    pathname.startsWith('/deals') ||
    pathname.startsWith('/investments') ||
    pathname.startsWith('/disbursements') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/approvals') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/investors') ||
    pathname.startsWith('/commitments') ||
    pathname.startsWith('/portfolio-companies') ||
    pathname.startsWith('/monitoring-reports');

  if (r === 'panel_member') {
    return assessmentsPaths;
  }

  if (r === 'senior_management') {
    return isPortfolioExecutive;
  }

  if (r === 'it_admin') {
    return settingsPaths;
  }

  if (r === 'pctu_officer') {
    if (pathname.startsWith('/portfolio')) return true;
    return false;
  }

  if (r === 'portfolio_manager') {
    if (pathname.startsWith('/settings')) return false;
    if (pathname.startsWith('/assessments')) return false;
    if (pathname.startsWith('/dd-questionnaires') || pathname.startsWith('/questionnaires')) return false;
    if (pathname.startsWith('/portfolio')) return true;
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/fund-applications') || pathname.startsWith('/cfp')) {
      return true;
    }
    return false;
  }

  if (r === 'investment_officer' || LEGACY_PIPELINE.includes(role as VCRole)) {
    if (pathname.startsWith('/portfolio')) return false;
    if (settingsPaths) return false;
    if (pipelinePaths || assessmentsPaths || legacyStaffExtras) return true;
    return false;
  }

  if (role === 'viewer') {
    return assessmentsPaths;
  }

  if (role === 'admin') {
    return true;
  }

  return false;
}
