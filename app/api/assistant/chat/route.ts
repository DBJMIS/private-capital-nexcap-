import { NextResponse } from 'next/server';
import { z } from 'zod';

import { buildClassificationPrompt, buildSystemPrompt } from '@/lib/assistant/context-builder';
import {
  queryApplicationsPipeline,
  queryAssessments,
  queryCapitalCalls,
  queryComplianceSummary,
  queryDistributions,
  queryDivestments,
  queryFundManagers,
  queryFundPerformance,
  queryPortfolioFunds,
  queryWatchlist,
} from '@/lib/assistant/queries';
import { isAssistantPageId } from '@/lib/assistant/page-contexts';
import type { AssistantAnswerMode, AssistantMessage, PageContext, QueryType } from '@/lib/assistant/types';
import { isQueryType } from '@/lib/assistant/types';
import { apiError, logAndReturn } from '@/lib/api/errors';
import { getProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_SESSION_MESSAGES = 15;
const HISTORY_FOR_MODEL = 10;

const pageContextSchema: z.ZodType<PageContext> = z.object({
  pageId: z.string(),
  pageTitle: z.string(),
  userRole: z.string(),
  userId: z.string(),
  data: z.record(z.string(), z.unknown()),
  suggestedPrompts: z.array(z.string()),
});

const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.coerce.date(),
  pageId: z.string(),
  mode: z.enum(['page_context', 'live_query', 'knowledge', 'interpretation']).optional(),
  queryUsed: z.string().nullable().optional(),
  fetchedLiveData: z.boolean().optional(),
  streaming: z.boolean().optional(),
});

const classificationSchema = z.object({
  mode: z.enum(['page_context', 'live_query', 'knowledge', 'interpretation']),
  query_type: z.string().nullable().optional(),
  params: z.record(z.string(), z.string()).nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

function normalizeAssistantMessage(
  m: z.infer<typeof assistantMessageSchema>,
): AssistantMessage {
  const q = m.queryUsed;
  let queryUsed: QueryType | null | undefined;
  if (q === null) queryUsed = null;
  else if (q !== undefined && isQueryType(q)) queryUsed = q;
  else queryUsed = undefined;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    pageId: m.pageId,
    mode: m.mode,
    queryUsed,
    fetchedLiveData: m.fetchedLiveData,
    streaming: m.streaming,
  };
}

const bodySchema = z
  .object({
    message: z.string().trim().min(1).max(499),
    context: pageContextSchema,
    history: z.array(assistantMessageSchema),
    phase2Enabled: z.boolean().optional().default(true),
    phase2Step: z.enum(['classify', 'answer', 'full']).optional().default('full'),
    classification: classificationSchema.optional(),
  })
  .transform((d) => ({
    ...d,
    history: d.history.map(normalizeAssistantMessage),
  }));

function assertContextMatchesSession(context: PageContext, profileUserId: string, profileRole: string): boolean {
  if (context.userId !== profileUserId) return false;
  if (context.userRole !== profileRole) return false;
  return true;
}

type AnthropicContent = { type: string; text?: string };

type ClaudeApiRole = 'user' | 'assistant';

async function executeQuery(
  queryType: QueryType,
  params: Record<string, string> | null,
  tenantId: string,
): Promise<{ data: unknown; error: string | null }> {
  try {
    const fundId = params?.fund_id ?? undefined;
    const status = params?.status ?? undefined;

    switch (queryType) {
      case 'portfolio_funds':
        return { data: await queryPortfolioFunds(tenantId), error: null };
      case 'compliance_summary':
        return { data: await queryComplianceSummary(tenantId, fundId), error: null };
      case 'capital_calls':
        return { data: await queryCapitalCalls(tenantId, fundId, status), error: null };
      case 'distributions':
        return { data: await queryDistributions(tenantId, fundId), error: null };
      case 'fund_performance':
        return { data: await queryFundPerformance(tenantId, fundId), error: null };
      case 'watchlist':
        return { data: await queryWatchlist(tenantId), error: null };
      case 'assessments':
        return { data: await queryAssessments(tenantId, status, fundId), error: null };
      case 'applications_pipeline':
        return { data: await queryApplicationsPipeline(tenantId, status), error: null };
      case 'fund_managers':
        return { data: await queryFundManagers(tenantId), error: null };
      case 'divestments':
        return { data: await queryDivestments(tenantId, fundId), error: null };
      default:
        return { data: null, error: 'Unknown query type' };
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

async function callClaude(
  system: string,
  messages: Array<{ role: ClaudeApiRole; content: string }>,
  maxTokens: number,
): Promise<{ ok: boolean; text: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, text: '' };
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      content?: AnthropicContent[];
    };
    const text = (raw.content ?? [])
      .filter((x) => x.type === 'text' && typeof x.text === 'string')
      .map((x) => x.text as string)
      .join('\n');
    return { ok: response.ok, text };
  } catch {
    return { ok: false, text: '' };
  }
}

async function streamClaude(
  system: string,
  messages: Array<{ role: ClaudeApiRole; content: string }>,
  maxTokens: number,
): Promise<ReadableStream<Uint8Array> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'messages-2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        stream: true,
        system,
        messages,
      }),
    });

    if (!response.ok || !response.body) return null;
    return response.body;
  } catch {
    return null;
  }
}

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

const LEGACY_ENDPOINT_ID_TO_QUERY: Record<string, QueryType> = {
  portfolio_funds_list: 'portfolio_funds',
  compliance_overdue: 'compliance_summary',
  capital_calls_summary: 'capital_calls',
  distributions_summary: 'distributions',
  watchlist: 'watchlist',
  fund_performance: 'fund_performance',
};

function stripJsonFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t);
  if (m?.[1]) return m[1].trim();
  return t;
}

function parseClassification(raw: string): z.infer<typeof classificationSchema> {
  const stripped = stripJsonFence(raw);
  try {
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    if (obj.query_type == null && typeof obj.endpoint_id === 'string') {
      const mapped = LEGACY_ENDPOINT_ID_TO_QUERY[obj.endpoint_id];
      if (mapped) obj.query_type = mapped;
    }
    const r = classificationSchema.safeParse(obj);
    if (r.success) return r.data;
  } catch {
    /* fall through */
  }
  return { mode: 'page_context', query_type: null, params: null, reasoning: undefined };
}

async function runClassification(
  message: string,
  context: PageContext,
): Promise<z.infer<typeof classificationSchema>> {
  const prompt = buildClassificationPrompt(message, context);
  const result = await callClaude(
    'You output JSON only. No markdown fences.',
    [{ role: 'user', content: prompt }],
    220,
  );
  if (!result.ok || !result.text.trim()) {
    return { mode: 'page_context', query_type: null, params: null, reasoning: undefined };
  }
  const parsed = parseClassification(result.text);
  console.info('[assistant/chat:classify]', {
    mode: parsed.mode,
    query_type: parsed.query_type ?? null,
  });
  return parsed;
}

function buildAnswerMessages(
  message: string,
  history: AssistantMessage[],
): Array<{ role: ClaudeApiRole; content: string }> {
  let tail = history.slice(-HISTORY_FOR_MODEL);
  while (tail.length > 0 && tail[0]?.role === 'assistant') {
    tail = tail.slice(1);
  }
  const claudeMessages: Array<{ role: ClaudeApiRole; content: string }> = tail.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  claudeMessages.push({ role: 'user', content: message });
  return claudeMessages;
}

async function runAnswerClaude(
  context: PageContext,
  mode: AssistantAnswerMode,
  message: string,
  history: AssistantMessage[],
): Promise<{ ok: boolean; text: string }> {
  const system = buildSystemPrompt(context, mode);
  return callClaude(system, buildAnswerMessages(message, history), 1000);
}

type Phase2AnswerOk = {
  ok: true;
  message: string;
  messageId: string;
  mode: AssistantAnswerMode;
  queryUsed: QueryType | null;
};

type Phase2AnswerErr = { ok: false; response: NextResponse };

type PreparedAnswerPhase = {
  pageContextForModel: PageContext;
  effectiveMode: AssistantAnswerMode;
  queryUsed: QueryType | null;
  liveStatus: string | null;
};

async function preparePhase2AnswerContext(args: {
  context: PageContext;
  classification: z.infer<typeof classificationSchema>;
  tenantId: string;
}): Promise<PreparedAnswerPhase> {
  const { context, classification, tenantId } = args;
  let effectiveMode: AssistantAnswerMode = classification.mode;
  let queryUsed: QueryType | null =
    classification.query_type && isQueryType(classification.query_type) ? classification.query_type : null;
  const ctxData: Record<string, unknown> = { ...context.data };
  let liveStatus: string | null = null;

  if (effectiveMode === 'live_query') {
    if (!classification.query_type || !isQueryType(classification.query_type)) {
      effectiveMode = 'page_context';
      queryUsed = null;
      ctxData.live_query_result = null;
      ctxData.live_query_failed = true;
    } else {
      liveStatus = 'Fetching live data...';
      const { data, error } = await executeQuery(classification.query_type, classification.params ?? null, tenantId);
      if (error != null) {
        effectiveMode = 'page_context';
        queryUsed = null;
        ctxData.live_query_result = null;
        ctxData.live_query_failed = true;
      } else {
        ctxData.live_query_result = data;
        ctxData.live_query_failed = false;
        queryUsed = classification.query_type;
      }
    }
  }

  const pageContextForModel: PageContext = {
    ...context,
    data: ctxData,
  };

  return { pageContextForModel, effectiveMode, queryUsed, liveStatus };
}

async function executePhase2AnswerPipeline(args: {
  message: string;
  context: PageContext;
  history: AssistantMessage[];
  classification: z.infer<typeof classificationSchema>;
  tenantId: string;
}): Promise<Phase2AnswerOk | Phase2AnswerErr> {
  const { message, context, history, tenantId } = args;
  const classification = args.classification;

  const prepared = await preparePhase2AnswerContext({
    context,
    classification,
    tenantId,
  });

  const result = await runAnswerClaude(prepared.pageContextForModel, prepared.effectiveMode, message, history);
  if (!result.ok || !result.text.trim()) {
    return {
      ok: false,
      response: logAndReturn(
        new Error('Claude request failed or empty response'),
        'assistant/chat',
        'UPSTREAM_ERROR',
        'Assistant is temporarily unavailable',
        502,
      ),
    };
  }

  return {
    ok: true,
    message: result.text.trim(),
    messageId: crypto.randomUUID(),
    mode: prepared.effectiveMode,
    queryUsed: prepared.queryUsed,
  };
}

export async function POST(req: Request) {
  try {
    const profile = await getProfile();
    if (!profile) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Not signed in' }, { status: 401 });
    }

    const tenantId = profile.tenant_id;

    const bodyRaw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid request' }, { status: 400 });
    }

    const { message, context, history, phase2Enabled, phase2Step, classification: classificationFromBody } =
      parsed.data;

    if (!isAssistantPageId(context.pageId)) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Unsupported page' }, { status: 400 });
    }

    if (!assertContextMatchesSession(context, profile.user_id, profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Context does not match session' }, { status: 403 });
    }

    if (history.length >= MAX_SESSION_MESSAGES) {
      return apiError('RATE_LIMIT', 'Session message limit reached. Please start a new session to continue.', 429);
    }

    if (!phase2Enabled) {
      const system = buildSystemPrompt(context, 'page_context');
      let tail = history.slice(-HISTORY_FOR_MODEL);
      while (tail.length > 0 && tail[0]?.role === 'assistant') {
        tail = tail.slice(1);
      }
      const claudeMessages: Array<{ role: ClaudeApiRole; content: string }> = tail.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      claudeMessages.push({ role: 'user', content: message });
      const result = await callClaude(system, claudeMessages, 1000);
      if (!result.ok || !result.text.trim()) {
        return logAndReturn(
          new Error('Claude request failed or empty response'),
          'assistant/chat',
          'UPSTREAM_ERROR',
          'Assistant is temporarily unavailable',
          502,
        );
      }
      return NextResponse.json({
        message: result.text.trim(),
        messageId: crypto.randomUUID(),
        mode: 'page_context' as const,
        queryUsed: null,
      });
    }

    if (phase2Step === 'classify') {
      const cls = await runClassification(message, context);
      return NextResponse.json({
        mode: cls.mode,
        queryType: cls.query_type ?? null,
        params: cls.params ?? null,
        reasoning: cls.reasoning ?? null,
      });
    }

    if (phase2Step === 'answer') {
      const cls = classificationFromBody;
      if (!cls) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Missing classification' }, { status: 400 });
      }
      const out = await executePhase2AnswerPipeline({
        message,
        context,
        history,
        classification: cls,
        tenantId,
      });
      if (!out.ok) return out.response;
      return NextResponse.json({
        message: out.message,
        messageId: out.messageId,
        mode: out.mode,
        queryUsed: out.queryUsed,
      });
    }

    const cls = await runClassification(message, context);
    const prepared = await preparePhase2AnswerContext({
      context,
      classification: cls,
      tenantId,
    });

    const messageId = crypto.randomUUID();
    const systemPrompt = buildSystemPrompt(prepared.pageContextForModel, prepared.effectiveMode);
    const answerMessages = buildAnswerMessages(message, history);

    const upstreamBody = await streamClaude(systemPrompt, answerMessages, 1000);
    if (!upstreamBody) {
      const fallback = await callClaude(systemPrompt, answerMessages, 1000);
      if (!fallback.ok || !fallback.text.trim()) {
        return logAndReturn(
          new Error('Claude answer failed or empty response'),
          'assistant/chat',
          'UPSTREAM_ERROR',
          'Assistant is temporarily unavailable',
          502,
        );
      }
      return NextResponse.json({
        message: fallback.text.trim(),
        messageId,
        mode: prepared.effectiveMode,
        queryUsed: prepared.queryUsed,
      });
    }

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          sseEvent({
            type: 'meta',
            messageId,
            mode: prepared.effectiveMode,
            queryUsed: prepared.queryUsed,
            status: prepared.liveStatus,
          }),
        );

        const reader = upstreamBody.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;

              try {
                const event = JSON.parse(raw) as {
                  type?: string;
                  delta?: { type?: string; text?: string };
                };

                if (
                  event.type === 'content_block_delta' &&
                  event.delta?.type === 'text_delta' &&
                  typeof event.delta.text === 'string'
                ) {
                  controller.enqueue(sseEvent({ type: 'delta', text: event.delta.text }));
                }
              } catch {
                /* skip malformed SSE JSON */
              }
            }
          }
        } catch {
          controller.enqueue(sseEvent({ type: 'error', message: 'Stream interrupted' }));
        } finally {
          reader.releaseLock();
          controller.enqueue(sseEvent({ type: 'done' }));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e) {
    return logAndReturn(e, 'assistant/chat', 'INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
