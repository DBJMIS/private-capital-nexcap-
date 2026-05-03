export type AssistantAnswerMode = 'page_context' | 'live_query' | 'knowledge' | 'interpretation';

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
  endpointUsed?: string | null;
  fetchedLiveData?: boolean;
}

export interface AssistantSession {
  messages: AssistantMessage[];
  startedAt: Date;
}
