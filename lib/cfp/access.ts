import { can } from '@/lib/auth/permissions';
import type { Profile } from '@/types/auth';

/** Staff (non–fund manager) may view CFP data. */
export function canViewCfpModule(profile: Profile | null | undefined): boolean {
  if (!profile?.is_active || profile.role === 'fund_manager') return false;
  return can(profile, 'read:tenant');
}

export function canMutateCfp(profile: Profile | null | undefined): boolean {
  return !!profile?.is_active && can(profile, 'write:applications');
}
