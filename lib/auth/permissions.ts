/**
 * Application-level permission checks (fail closed).
 * Complements DB RLS — use for UX and coarse gates; enforce invariants in SQL too.
 *
 * File path: lib/auth/permissions.ts
 */

import type { Profile, VCRole } from '@/types/auth';

export type PermissionAction =
  | 'create:application'
  | 'score:assessment'
  | 'approve:deal'
  | 'approve:disbursement'
  | 'manage:users'
  | 'read:tenant'
  | 'write:applications'
  | 'write:deals'
  | 'write:investments'
  | 'write:disbursements'
  | 'write:dd_questionnaire'
  | 'create:assessment'
  | 'approve:pre_screening'
  | 'approve:due_diligence'
  | 'approve:investment'
  | 'update:approval_record'
  | 'manage:tenant_settings'
  | 'delete:records'
  | 'append:audit_log';

const WRITER_ROLES: VCRole[] = ['admin', 'analyst', 'officer', 'investment_officer', 'pctu_officer', 'portfolio_manager'];
const APPROVER_ROLES: VCRole[] = ['admin', 'officer', 'pctu_officer'];

const KNOWN: VCRole[] = [
  'admin',
  'it_admin',
  'pctu_officer',
  'investment_officer',
  'portfolio_manager',
  'panel_member',
  'senior_management',
  'analyst',
  'officer',
  'viewer',
  'fund_manager',
];

function isKnownRole(role: string): role is VCRole {
  return KNOWN.includes(role as VCRole);
}

/**
 * Returns true if the profile may perform the action. Unknown or inactive
 * profiles → false. Unrecognized role strings → false (fail closed).
 */
export function can(profile: Profile | null | undefined, action: PermissionAction): boolean {
  if (!profile || !profile.is_active) {
    return false;
  }

  const role = profile.role;
  if (!isKnownRole(role)) {
    return false;
  }

  if (role === 'fund_manager') {
    return action === 'read:tenant';
  }

  if (role === 'it_admin') {
    return action === 'read:tenant' || action === 'manage:users';
  }

  if (role === 'senior_management') {
    return action === 'read:tenant';
  }

  if (role === 'panel_member') {
    return action === 'read:tenant' || action === 'score:assessment';
  }

  if (role === 'viewer') {
    return action === 'read:tenant';
  }

  const isAdmin = role === 'admin';
  const isWriter = WRITER_ROLES.includes(role);
  const isApprover = APPROVER_ROLES.includes(role);

  switch (action) {
    case 'create:application':
      return true;

    case 'score:assessment':
      return role === 'admin' || role === 'analyst' || role === 'investment_officer';

    case 'approve:deal':
    case 'approve:disbursement':
      return role === 'admin' || role === 'officer' || role === 'pctu_officer';

    case 'manage:users':
      return isAdmin;

    case 'read:tenant':
      return true;

    case 'write:applications':
    case 'write:deals':
    case 'write:investments':
    case 'write:disbursements':
    case 'write:dd_questionnaire':
    case 'create:assessment':
    case 'append:audit_log':
      return isWriter;

    case 'approve:pre_screening':
      return isApprover;

    case 'approve:due_diligence':
    case 'approve:investment':
      return isApprover;

    case 'update:approval_record':
      return isAdmin;

    case 'manage:tenant_settings':
    case 'delete:records':
      return isAdmin;
  }

  return false;
}
