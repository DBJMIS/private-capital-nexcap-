/**
 * Shared role colors / labels for user management and chrome.
 *
 * File path: lib/settings/role-visual.ts
 */

import { ROLE_COLORS, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/role-labels';
import { roleDisplayLabel } from '@/lib/auth/rbac';

export { roleDisplayLabel };

export function roleAvatarClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-[#0B1F45] text-white';
    case 'it_admin':
      return 'bg-purple-600 text-white';
    case 'pctu_officer':
      return 'bg-[#0F8A6E] text-white';
    case 'investment_officer':
      return 'bg-blue-600 text-white';
    case 'portfolio_manager':
      return 'bg-indigo-600 text-white';
    case 'panel_member':
      return 'bg-amber-500 text-white';
    case 'senior_management':
      return 'bg-gray-600 text-white';
    default:
      return 'bg-gray-400 text-white';
  }
}

export function roleBadgeClass(role: string): string {
  if (role in ROLE_COLORS) return ROLE_COLORS[role]!;
  return 'bg-gray-100 text-gray-700 border border-gray-200';
}

export type AccessLine = { ok: boolean; text: string };

export function accessPreviewForRole(role: string): AccessLine[] {
  switch (role) {
    case 'pctu_officer':
      return [
        { ok: true, text: 'Portfolio Dashboard' },
        { ok: true, text: 'Fund Monitoring' },
        { ok: true, text: 'Reporting Calendar' },
        { ok: true, text: 'Compliance Dashboard' },
        { ok: true, text: 'Capital Calls' },
        { ok: true, text: 'Distributions' },
        { ok: false, text: 'Pipeline / Applications' },
        { ok: false, text: 'User Management' },
      ];
    case 'investment_officer':
      return [
        { ok: true, text: 'Pipeline Dashboard' },
        { ok: true, text: 'Fund Applications' },
        { ok: true, text: 'Calls for Proposals' },
        { ok: true, text: 'Assessments & Scoring' },
        { ok: false, text: 'Portfolio / PCTU' },
        { ok: false, text: 'User Management' },
      ];
    case 'portfolio_manager':
      return [
        { ok: true, text: 'Portfolio Dashboard' },
        { ok: true, text: 'Fund Monitoring' },
        { ok: true, text: 'Reporting Calendar' },
        { ok: true, text: 'Compliance Dashboard' },
        { ok: true, text: 'Capital Calls' },
        { ok: true, text: 'Distributions' },
        { ok: true, text: 'Executive View' },
        { ok: true, text: 'Pipeline Dashboard' },
        { ok: true, text: 'Fund Applications' },
        { ok: true, text: 'Calls for Proposals' },
        { ok: false, text: 'DD Questionnaires' },
        { ok: false, text: 'Assessments & Scoring' },
        { ok: false, text: 'User Management' },
      ];
    case 'panel_member':
      return [
        { ok: true, text: 'Assigned assessments (read)' },
        { ok: true, text: 'Panel evaluation scores' },
        { ok: false, text: 'Portfolio' },
        { ok: false, text: 'Pipeline' },
        { ok: false, text: 'User Management' },
      ];
    case 'it_admin':
      return [
        { ok: true, text: 'User Management' },
        { ok: true, text: 'Settings' },
        { ok: false, text: 'Portfolio data' },
        { ok: false, text: 'Pipeline data' },
      ];
    case 'senior_management':
      return [
        { ok: true, text: 'Executive portfolio view (read-only)' },
        { ok: false, text: 'Operational portfolio tools' },
        { ok: false, text: 'Pipeline' },
        { ok: false, text: 'User Management' },
      ];
    default:
      return [];
  }
}

export function roleDescription(role: string): string {
  return ROLE_DESCRIPTIONS[role] ?? '';
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? roleDisplayLabel(role);
}
