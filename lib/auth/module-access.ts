export const MODULE_ROUTE_MAP: Record<string, string> = {
  portfolio_dashboard: '/portfolio',
  fund_monitoring: '/portfolio/funds',
  reporting_calendar: '/portfolio/calendar',
  compliance: '/portfolio/compliance',
  capital_calls: '/portfolio/capital-calls',
  distributions: '/portfolio/distributions',
  watchlist: '/portfolio/watchlist',
  divestment: '/portfolio/divestment',
  executive_view: '/portfolio/executive',
  pipeline_dashboard: '/dashboard',
  fund_applications: '/fund-applications',
  cfp: '/cfp',
  dd_questionnaires: '/dd-questionnaires',
  assessments: '/assessments',
  settings: '/settings',
  user_management: '/settings/users',
};

export const ALL_MODULE_IDS = Object.keys(MODULE_ROUTE_MAP);

export type AccessLevel = 'full' | 'read_only' | 'none';

