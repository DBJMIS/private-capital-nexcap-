import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ASSISTANT_ENDPOINTS, resolveEndpointPath } from '@/lib/assistant/endpoints';
import { buildClassificationPrompt, buildSystemPrompt } from '@/lib/assistant/context-builder';
import { isAssistantPageId } from '@/lib/assistant/page-contexts';
import type { AssistantAnswerMode, AssistantMessage, PageContext } from '@/lib/assistant/types';
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

const assistantMessageSchema: z.ZodType<AssistantMessage> = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.coerce.date(),
  pageId: z.string(),
  mode: z.enum(['page_context', 'live_query', 'knowledge', 'interpretation']).optional(),
  endpointUsed: z.string().nullable().optional(),
  fetchedLiveData: z.boolean().optional(),
});

const classificationSchema = z.object({
  mode: z.enum(['page_context', 'live_query', 'knowledge', 'interpretation']),
  endpoint_id: z.string().nullable().optional(),
  params: z.record(z.string(), z.string()).nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

const bodySchema = z.object({
  message: z.string().trim().min(1).max(499),
  context: pageContextSchema,
  history: z.array(assistantMessageSchema),
  phase2Enabled: z.boolean().optional().default(true),
  phase2Step: z.enum(['classify', 'answer', 'full']).optional().default('full'),
  classification: classificationSchema.optional(),
});

function assertContextMatchesSession(context: PageContext, profileUserId: string, profileRole: string): boolean {
  if (context.userId !== profileUserId) return false;
  if (context.userRole !== profileRole) return false;
  return true;
}

type AnthropicContent = { type: string; text?: string };

type ClaudeApiRole = 'user' | 'assistant';

function getInternalBaseUrl(req: Request): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith('http://') || fromEnv.startsWith('https://')) return fromEnv.replace(/\/$/, '');
    return `https://${fromEnv.replace(/\/$/, '')}`;
  }
  const host = req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

async function fetchEndpointData(path: string, sessionCookie: string, req: Request): Promise<unknown | null> {
  try {
    const baseUrl = getInternalBaseUrl(req);
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Cookie: sessionCookie,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
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

function stripJsonFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t);
  if (m?.[1]) return m[1].trim();
  return t;
}

function parseClassification(raw: string): z.infer<typeof classificationSchema> {
  const stripped = stripJsonFence(raw);
  try {
    const obj = JSON.parse(stripped) as unknown;
    const r = classificationSchema.safeParse(obj);
    if (r.success) return r.data;
  } catch {
    /* fall through */
  }
  return { mode: 'page_context', endpoint_id: null, params: null, reasoning: undefined };
}

async function runClassification(
  message: string,
  context: PageContext,
): Promise<z.infer<typeof classificationSchema>> {
  const prompt = buildClassificationPrompt(message, context, ASSISTANT_ENDPOINTS);
  const result = await callClaude(
    'You output JSON only. No markdown fences.',
    [{ role: 'user', content: prompt }],
    512,
  );
  if (!result.ok || !result.text.trim()) {
    return { mode: 'page_context', endpoint_id: null, params: null, reasoning: undefined };
  }
  const parsed = parseClassification(result.text);
  console.info('[assistant/chat:classify]', {
    mode: parsed.mode,
    endpoint_id: parsed.endpoint_id ?? null,
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
  endpointUsed: string | null;
};

type Phase2AnswerErr = { ok: false; response: NextResponse };

async function executePhase2AnswerPipeline(args: {
  message: string;
  context: PageContext;
  history: AssistantMessage[];
  classification: z.infer<typeof classificationSchema>;
  sessionCookie: string;
  req: Request;
}): Promise<Phase2AnswerOk | Phase2AnswerErr> {
  const { message, context, history, sessionCookie, req } = args;
  const classification = args.classification;
  let effectiveMode: AssistantAnswerMode = classification.mode;
  let endpointUsed: string | null = classification.endpoint_id ?? null;
  const ctxData: Record<string, unknown> = { ...context.data };

  if (effectiveMode === 'live_query') {
    if (!classification.endpoint_id) {
      effectiveMode = 'page_context';
      endpointUsed = null;
      ctxData.live_query_result = null;
      ctxData.live_query_failed = true;
    } else {
      const ep = ASSISTANT_ENDPOINTS.find((e) => e.id === classification.endpoint_id);
      if (!ep) {
        effectiveMode = 'page_context';
        endpointUsed = null;
        ctxData.live_query_result = null;
        ctxData.live_query_failed = true;
      } else {
        const rawParams = classification.params ?? null;
        const pathParams =
          ep.id === 'fund_performance' && rawParams?.fund_id != null && rawParams.id == null
            ? { ...rawParams, id: rawParams.fund_id }
            : rawParams;
        const path = resolveEndpointPath(ep, pathParams);
        const data = await fetchEndpointData(path, sessionCookie, req);
        if (data == null) {
          effectiveMode = 'page_context';
          endpointUsed = null;
          ctxData.live_query_result = null;
          ctxData.live_query_failed = true;
        } else {
          ctxData.live_query_result = data;
          ctxData.live_query_failed = false;
        }
      }
    }
  }

  const pageContextForModel: PageContext = {
    ...context,
    data: ctxData,
  };

  const result = await runAnswerClaude(pageContextForModel, effectiveMode, message, history);
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
    mode: effectiveMode,
    endpointUsed,
  };
}

export async function POST(req: Request) {
  try {
    const profile = await getProfile();
    if (!profile) {
      return NextResponse.json({ error: 'UNAUTHORISED', message: 'Not signed in' }, { status: 401 });
    }

    const sessionCookie = req.headers.get('cookie') ?? '';

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
        endpointUsed: null,
      });
    }

    if (phase2Step === 'classify') {
      const cls = await runClassification(message, context);
      return NextResponse.json({
        mode: cls.mode,
        endpointId: cls.endpoint_id ?? null,
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
        sessionCookie,
        req,
      });
      if (!out.ok) return out.response;
      return NextResponse.json({
        message: out.message,
        messageId: out.messageId,
        mode: out.mode,
        endpointUsed: out.endpointUsed,
      });
    }

    const cls = await runClassification(message, context);
    const merged = await executePhase2AnswerPipeline({
      message,
      context,
      history,
      classification: cls,
      sessionCookie,
      req,
    });
    if (!merged.ok) return merged.response;
    return NextResponse.json({
      message: merged.message,
      messageId: merged.messageId,
      mode: merged.mode,
      endpointUsed: merged.endpointUsed,
    });
  } catch (e) {
    return logAndReturn(e, 'assistant/chat', 'INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
