import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { logAndReturn, sseError } from '@/lib/api/errors';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { ONBOARDING_JSON_DELIMITER, ONBOARDING_SYSTEM_PROMPT } from '@/lib/onboarding/constants';
import { followUpsFromPayload, parseOnboardingAssistantBuffer } from '@/lib/onboarding/extract';
import type { ChatMessage } from '@/types/onboarding';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type IncomingBody = {
  messages: ChatMessage[];
  current_application: Record<string, unknown>;
  application_id?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabaseAuth = createServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
    }
    if (!anthropicModel) {
      return NextResponse.json({ error: 'ANTHROPIC_MODEL is not configured' }, { status: 503 });
    }

    const body = (await req.json()) as IncomingBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const current_application = body.current_application && typeof body.current_application === 'object' ? body.current_application : {};

    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    const anthropicMessages = messages
      .filter((m): m is ChatMessage => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-24)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.slice(0, 24_000),
      }));

    const anthropic = new Anthropic({ apiKey });
    const stream = anthropic.messages.stream({
      model: anthropicModel,
      max_tokens: 8192,
      system: `${ONBOARDING_SYSTEM_PROMPT}

Known application state (JSON, may be partial — merge updates into extracted_fields):
${JSON.stringify(current_application)}`,
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
              const i = buffer.indexOf(ONBOARDING_JSON_DELIMITER);
              const conv = i === -1 ? buffer : buffer.slice(0, i);
              if (conv.length > emittedConv) {
                send({ type: 'text', content: conv.slice(emittedConv) });
                emittedConv = conv.length;
              }
            }
          }

          const { conversational, payload } = parseOnboardingAssistantBuffer(buffer);
          send({
            type: 'done',
            reply: payload?.reply ?? conversational,
            extracted_fields: payload?.extracted_fields ?? {},
            follow_up_questions: followUpsFromPayload(payload),
            missing_fields: payload?.missing_fields ?? [],
          });
        } catch (err) {
          console.error('[onboarding/chat/stream]', err);
          send(sseError('Chat assistant encountered an error'));
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
  } catch (e) {
    return logAndReturn(
      e,
      'onboarding/chat',
      'INTERNAL_ERROR',
      'Chat service unavailable — please try again',
      500,
    );
  }
}
