/**
 * Extract first JSON object from a model response string.
 */
export function extractJsonObject(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { ok: false, error: 'No JSON object found in model response' };
  }
  try {
    return { ok: true, value: JSON.parse(t.slice(start, end + 1)) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}
