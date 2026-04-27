/**
 * Auth-related TypeScript types for the DBJ VC platform (NextAuth + Azure AD).
 *
 * File path: types/auth.ts
 */

import type { Session as NextAuthSession } from 'next-auth';

/** Legacy + RBAC platform roles. */
export type VCRole =
  | 'admin'
  | 'it_admin'
  | 'pctu_officer'
  | 'investment_officer'
  | 'portfolio_manager'
  | 'panel_member'
  | 'senior_management'
  | 'analyst'
  | 'officer'
  | 'viewer'
  | 'fund_manager';

/**
 * Requested canonical identity shape for VC profile/session.
 */
export type VCProfile = {
  id: string;
  email: string;
  name: string;
  role: VCRole | null;
  tenant_id: string | null;
  profile_id: string | null;
};

/**
 * Backward-compatible profile shape used across existing API/routes.
 */
export type Profile = VCProfile & {
  role: VCRole;
  tenant_id: string;
  profile_id: string;
  full_name: string;
  user_id: string;
  is_active: boolean;
};

export type Session = NextAuthSession;
