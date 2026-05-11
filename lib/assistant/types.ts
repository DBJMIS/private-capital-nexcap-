export type AssistantAnswerMode = 'page_context' | 'live_query' | 'knowledge' | 'interpretation';

export const ASSISTANT_QUERY_TYPES = [
  'portfolio_funds',
  'compliance_summary',
  'capital_calls',
  'distributions',
  'fund_performance',
  'watchlist',
  'assessments',
  'applications_pipeline',
  'fund_managers',
  'divestments',
] as const;

export type QueryType = (typeof ASSISTANT_QUERY_TYPES)[number];

export function isQueryType(value: string): value is QueryType {
  return (ASSISTANT_QUERY_TYPES as readonly string[]).includes(value);
}

export interface PageContext {
  pageId: string;
  pageTitle: string;
  userRole: string;
  userId: string;
  data: Record<string, unknown>;
  suggestedPrompts: string[];
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  pageId: string;
  mode?: AssistantAnswerMode;
  /** Which assistant query supplied live data for this turn (if any). */
  queryUsed?: QueryType | null;
  fetchedLiveData?: boolean;
  /** True while SSE chunks are still arriving for this assistant message */
  streaming?: boolean;
}

export interface AssistantSession {
  messages: AssistantMessage[];
  startedAt: Date;
}
