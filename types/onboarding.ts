/**
 * Fund application onboarding (AI-assisted wizard).
 * File path: types/onboarding.ts
 */

/** Core columns on vc_fund_applications (DB). */
export type FundApplicationCore = {
  fund_name: string;
  manager_name: string;
  country_of_incorporation: string;
  geographic_area: string;
  total_capital_commitment_usd: number;
};

/** Extended intake fields stored in onboarding_metadata jsonb. */
export type FundApplicationExtended = {
  investment_stage?: string;
  primary_sector?: string;
  fund_life_years?: number;
  investment_period_years?: number;
};

/** Full form state used in the wizard + API. */
export type FundApplicationForm = FundApplicationCore & FundApplicationExtended;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

/** Parsed tail JSON from Claude (after delimiter). */
export type OnboardingAiPayload = {
  reply: string;
  extracted_fields: Partial<FundApplicationForm>;
  missing_fields: string[];
  next_question: string | null;
};

/** Non-streaming shape (legacy); streaming uses SSE events. */
export type OnboardingChatResponse = {
  reply: string;
  extracted_fields: Partial<FundApplicationForm>;
  follow_up_questions: string[];
};
