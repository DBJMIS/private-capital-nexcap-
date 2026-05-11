import type { QueryType } from '@/lib/assistant/types';

export interface QueryDefinition {
  id: QueryType;
  description: string;
  params: string[];
}

export const ASSISTANT_QUERIES: QueryDefinition[] = [
  {
    id: 'portfolio_funds',
    description: `All active portfolio funds — names, commitments, currencies, sectors, fund status, manager names, DBJ stake. Use for: listing funds, showing all funds, fund overview, commitment amounts.`,
    params: [],
  },
  {
    id: 'compliance_summary',
    description: `Full compliance picture per fund — total obligations, overdue count, accepted count, pending count, compliance rate, max days overdue. Use for: compliance status, which funds are behind, overdue reports, compliance rates, reporting obligations.`,
    params: ['fund_id'],
  },
  {
    id: 'capital_calls',
    description: `Capital call notices across all funds — notice number, amounts, dates, payment status, remaining commitment. Use for: outstanding calls, paid calls, capital deployment, call history.`,
    params: ['fund_id', 'status'],
  },
  {
    id: 'distributions',
    description: `Distribution payments made to DBJ from portfolio funds — amounts, dates, return type, cumulative totals. Use for: distributions made, returns received, income from funds.`,
    params: ['fund_id'],
  },
  {
    id: 'fund_performance',
    description: `Fund performance metrics — capital called, deployment percentage, NAV, IRR, DPI, TVPI where available. Use for: performance rankings, IRR comparison, deployment rates, NAV, which fund has highest/lowest metric.`,
    params: ['fund_id'],
  },
  {
    id: 'watchlist',
    description: `Funds currently on the watchlist — quarters on watchlist, escalation status, latest assessment scores. Use for: watchlist funds, underperforming funds, escalated funds, fund health concerns.`,
    params: [],
  },
  {
    id: 'assessments',
    description: `Quarterly fund assessments — scores by dimension, category rating, status, AI summary. Use for: assessment status, fund scores, in-progress assessments, pending approvals, fund health ratings.`,
    params: ['fund_id', 'status'],
  },
  {
    id: 'applications_pipeline',
    description: `Fund applications moving through the pipeline — status, submission date, commitment size, CFP link. Use for: pipeline status, applications in review, which CFP applications, application counts by stage.`,
    params: ['status'],
  },
  {
    id: 'fund_managers',
    description: `Fund manager firms and contacts — firm names, primary contacts, linked funds, portal access status. Use for: who manages which fund, contact information, manager directory, portal access.`,
    params: [],
  },
  {
    id: 'divestments',
    description: `Exit and divestment records — company name, exit type, proceeds, MOIC, full vs partial exit. Use for: exits made, proceeds received, divestment performance, MOIC on exits.`,
    params: ['fund_id'],
  },
];
