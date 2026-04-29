/**
 * SSO and bookmarks often use "/" or "/dashboard" as callbackUrl. Edge middleware
 * runs before app/page.tsx — map roles to a safe first-hop URL.
 *
 * File path: lib/auth/role-root-landing.ts
 */

export const ROLE_ROOT_LANDING_PATH: Readonly<Record<string, string>> = {
  portfolio_manager: '/dashboard',
  panel_member: '/assessments',
  senior_management: '/portfolio/executive',
} as const;

export function rootLandingRedirectTarget(role: string): string | null {
  const path = ROLE_ROOT_LANDING_PATH[role];
  return path ?? null;
}
