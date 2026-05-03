import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { sseError } from '@/lib/api/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { assertQuestionnaireAccess } from '@/lib/questionnaire/assert-questionnaire-access';
import { createQuestionnaireDbClient } from '@/lib/questionnaire/db-client';
import { loadQuestionnaireForTenant } from '@/lib/questionnaire/load-questionnaire';
import { getSectionConfig, allSectionKeys } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import {
  DD_ASSIST_JSON_DELIMITER,
  DD_ASSIST_SYSTEM_PROMPT,
} from '@/lib/questionnaire/ai-assist-constants';
import { loadQuestionnaireAnswersSummary } from '@/lib/questionnaire/load-questionnaire-answers-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type ChatTurn = { role: 'user' | 'assistant'; content: string };

type IncomingBody = {
  section_key: string | null;
  question_key?: string | null;
  user_message: string;
  current_answers?: Record<string, unknown>;
  mode?: 'chat' | 'help_question' | 'review_answer' | 'section_gaps' | 'summarize_all';
  messages?: ChatTurn[];
  /** For "Review my answer" — text the user wants critiqued */
  pasted_answer?: string;
};

function truncateJson(obj: unknown, max = 20_000): string {
  const s = JSON.stringify(obj);
  return s.length <= max ? s : s.slice(0, max) + '…(truncated)';
}

function parseAssistSuffix(buffer: string): {
  conversational: string;
  suggestions: string[];
  identified_gaps: string[];
} {
  const i = buffer.indexOf(DD_ASSIST_JSON_DELIMITER);
  const conversational = (i === -1 ? buffer : buffer.slice(0, i)).trim();
  let suggestions: string[] = [];
  let identified_gaps: string[] = [];
  if (i !== -1) {
    const raw = buffer.slice(i + DD_ASSIST_JSON_DELIMITER.length).trim();
    try {
      const parsed = JSON.parse(raw) as { suggestions?: unknown; identified_gaps?: unknown };
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions.filter((x): x is string => typeof x === 'string').slice(0, 8);
      }
      if (Array.isArray(parsed.identified_gaps)) {
        identified_gaps = parsed.identified_gaps.filter((x): x is string => typeof x === 'string').slice(0, 12);
      }
    } catch {
      /* ignore */
    }
  }
  return { conversational, suggestions, identified_gaps };
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: questionnaireId } = await ctx.params;

  const supabaseAuth = createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createQuestionnaireDbClient(profile);
  const access = await assertQuestionnaireAccess(db, profile, user.id, questionnaireId);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  }
  if (!anthropicModel) {
    return NextResponse.json({ error: 'ANTHROPIC_MODEL is not configured' }, { status: 503 });
  }

  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userMessage = typeof body.user_message === 'string' ? body.user_message.trim() : '';
  if (!userMessage && body.mode !== 'summarize_all') {
    return NextResponse.json({ error: 'user_message required' }, { status: 400 });
  }

  const loaded = await loadQuestionnaireForTenant(db, profile.tenant_id, questionnaireId);
  if (loaded.error || !loaded.questionnaire) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: sections } = await db
    .from('vc_dd_sections')
    .select('section_key, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', questionnaireId);

  const completed =
    (sections ?? []).filter((s: { status: string }) => s.status === 'completed').length ?? 0;
  const total = 10;
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sectionKey = body.section_key;
  const keys = allSectionKeys();
  const validSection =
    sectionKey && keys.includes(sectionKey as DdSectionKey) ? (sectionKey as DdSectionKey) : null;
  const sectionConfig = validSection ? getSectionConfig(validSection) : null;

  const questionMeta =
    sectionConfig && body.question_key
      ? sectionConfig.questions.find((q) => q.key === body.question_key)
      : null;

  let fullSnapshot: Awaited<ReturnType<typeof loadQuestionnaireAnswersSummary>> | null = null;
  if (body.mode === 'summarize_all') {
    fullSnapshot = await loadQuestionnaireAnswersSummary(
      db,
      profile.tenant_id,
      questionnaireId,
    );
  }

  const questionsIndex =
    sectionConfig?.questions.map((q) => ({ key: q.key, label: q.label, type: q.type })) ?? [];

  const contextBlock = [
    `Questionnaire ID: ${questionnaireId}`,
    `Fund / application: ${loaded.application?.fund_name ?? 'Unknown'} (application_id=${loaded.questionnaire.application_id})`,
    `Overall DD section completion: ${completed} of ${total} sections marked complete (${overallPct}%).`,
    validSection ? `Current section key: ${validSection}` : 'Current view: questionnaire overview (no single section focused).',
    sectionConfig ? `Section title: ${sectionConfig.title}` : '',
    sectionConfig ? `DBJ / institutional guidance for this section:\n${sectionConfig.helper}` : '',
    body.question_key
      ? `Focused question_key: ${body.question_key}${questionMeta ? ` — ${questionMeta.label}` : ''}`
      : 'No specific question_key focus.',
    `Questions in this section (for orientation): ${truncateJson(questionsIndex, 8000)}`,
    `Current section answers (JSON, as submitted by client — may be partial): ${truncateJson(body.current_answers ?? {}, 12_000)}`,
    body.pasted_answer
      ? `User pasted draft to review (separate from field state):\n${body.pasted_answer.slice(0, 12_000)}`
      : '',
    fullSnapshot
      ? `Full questionnaire snapshot (all sections, for summarize mode only): ${truncateJson(fullSnapshot, 24_000)}`
      : '',
    `Interaction mode: ${body.mode ?? 'chat'}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const history = Array.isArray(body.messages) ? body.messages : [];
  const anthropicMessages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-16)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.slice(0, 16_000),
      })),
    {
      role: 'user',
      content: `${contextBlock}\n\n---\n\nUser message:\n${userMessage || '(Summarize the application so far based on the snapshot.)'}`,
    },
  ];

  const anthropic = new Anthropic({ apiKey });
  const stream = anthropic.messages.stream({
    model: anthropicModel,
    max_tokens: 8192,
    system: DD_ASSIST_SYSTEM_PROMPT,
    messages: anthropicMessages,
  });

  const encoder = new TextEncoder();
  let buffer = '';
  let emittedConv = 0;

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta' &&
            'text' in event.delta
          ) {
            const piece = event.delta.text;
            buffer += piece;
            const i = buffer.indexOf(DD_ASSIST_JSON_DELIMITER);
            const conv = i === -1 ? buffer : buffer.slice(0, i);
            if (conv.length > emittedConv) {
              send({ type: 'text', content: conv.slice(emittedConv) });
              emittedConv = conv.length;
            }
          }
        }

        const parsed = parseAssistSuffix(buffer);
        send({
          type: 'done',
          reply: parsed.conversational,
          suggestions: parsed.suggestions,
          identified_gaps: parsed.identified_gaps,
        });
      } catch (err) {
        console.error('[ai-assist/stream]', err);
        send(sseError('AI assistant encountered an error'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
