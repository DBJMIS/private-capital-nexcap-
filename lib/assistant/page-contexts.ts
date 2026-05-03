export const ASSISTANT_PAGE_IDS = [
  'portfolio-dashboard',
  'fund-detail',
  'capital-calls',
  'distributions',
  'general',
] as const;

export type AssistantPageId = (typeof ASSISTANT_PAGE_IDS)[number];

export function isAssistantPageId(id: string): id is AssistantPageId {
  return (ASSISTANT_PAGE_IDS as readonly string[]).includes(id);
}

export const PAGE_SUGGESTED_PROMPTS: Record<AssistantPageId, string[]> = {
  'portfolio-dashboard': [
    'Which funds have overdue compliance obligations?',
    'Is our capital deployment rate healthy?',
    'What does DPI mean and how are we performing?',
  ],
  'fund-detail': [
    'How does this fund compare to regional benchmarks?',
    "Should I be concerned about this fund's performance?",
    'What compliance obligations are coming up?',
  ],
  'capital-calls': [
    'Which funds have the most outstanding calls?',
    'Is our call cadence normal for this stage?',
    'What is a capital call and how does it work?',
  ],
  'distributions': [
    'How does our DPI compare to Caribbean PE benchmarks?',
    'Which fund has returned the most capital?',
    'Is it concerning that we have no exits yet?',
  ],
  general: [
    'What is IRR and how is it calculated?',
    'Explain the difference between DPI and TVPI',
    'What is a capital call and when does it happen?',
  ],
};
