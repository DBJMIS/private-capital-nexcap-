/**
 * Central role presentation metadata (labels, descriptions, color tokens).
 */

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  it_admin: 'IT Admin',
  pctu_officer: 'PCTU Officer',
  investment_officer: 'Investment Officer',
  portfolio_manager: 'Portfolio Manager',
  panel_member: 'Panel Member',
  senior_management: 'Senior Management',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Full access to everything',
  it_admin: 'User management only',
  pctu_officer: 'Full portfolio monitoring access',
  investment_officer: 'Full pipeline management access',
  portfolio_manager: 'Portfolio monitoring and pipeline access',
  panel_member: 'Assigned assessments only',
  senior_management: 'Executive dashboard read-only',
};

export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-[#0B1F45] text-white',
  it_admin: 'bg-purple-50 text-purple-700 border border-purple-200',
  pctu_officer: 'bg-teal-50 text-teal-700 border border-teal-200',
  investment_officer: 'bg-blue-50 text-blue-700 border border-blue-200',
  portfolio_manager: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  panel_member: 'bg-amber-50 text-amber-700 border border-amber-200',
  senior_management: 'bg-gray-100 text-gray-600',
};

