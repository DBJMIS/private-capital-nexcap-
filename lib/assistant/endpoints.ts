export interface AssistantEndpoint {
  id: string;
  description: string;
  path: string;
  method: 'GET';
  /** Path template placeholders (e.g. id) and how the classifier should refer to them (e.g. fund_id). */
  pathParams?: Record<string, string>;
}

export const ASSISTANT_ENDPOINTS: AssistantEndpoint[] = [
  {
    id: 'portfolio_funds_list',
    description:
      'Get all portfolio funds with their basic details, commitment amounts, status, and fund manager info',
    path: '/api/portfolio/funds',
    method: 'GET',
  },
  {
    id: 'capital_calls_summary',
    description:
      'Get summary of all capital calls across the portfolio including total called, outstanding, and overdue amounts',
    path: '/api/portfolio/capital-calls/summary',
    method: 'GET',
  },
  {
    id: 'distributions_summary',
    description:
      'Get summary of all distributions across the portfolio including total distributed, DPI, and distribution history',
    path: '/api/portfolio/distributions/summary',
    method: 'GET',
  },
  {
    id: 'compliance_overdue',
    description: 'Get all overdue compliance obligations across the portfolio with fund names and days overdue',
    path: '/api/portfolio/compliance/overdue',
    method: 'GET',
  },
  {
    id: 'watchlist',
    description: 'Get all funds currently on the watchlist with reasons and watchlist date',
    path: '/api/portfolio/watchlist',
    method: 'GET',
  },
  {
    id: 'fund_performance',
    description: 'Get performance metrics for a specific fund including IRR, MOIC, DPI, TVPI',
    path: '/api/portfolio/funds/:id/performance',
    method: 'GET',
    pathParams: { id: 'fund_id' },
  },
];

export function resolveEndpointPath(endpoint: AssistantEndpoint, params: Record<string, string> | null): string {
  let path = endpoint.path;
  if (!params) return path;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  return path;
}
