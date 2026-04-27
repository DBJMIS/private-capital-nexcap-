import Anthropic from '@anthropic-ai/sdk';

const MAX_TOKENS = 1000;

export async function callClaudeJson(options: {
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  /** Optional PDF document (base64) */
  pdfBase64?: { mediaType: 'application/pdf'; data: string };
  /** Override max output tokens (default 1000). */
  maxTokens?: number;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { apiKey, model, system, userText, pdfBase64, maxTokens } = options;
  try {
    const anthropic = new Anthropic({ apiKey });
    const userContent: unknown[] = [];
    if (pdfBase64) {
      userContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: pdfBase64.mediaType,
          data: pdfBase64.data,
        },
      });
    }
    userContent.push({ type: 'text', text: userText });
    const msg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens ?? MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userContent }],
    } as never);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text' && 'text' in b)
      .map((b) => b.text)
      .join('')
      .trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Claude request failed' };
  }
}
