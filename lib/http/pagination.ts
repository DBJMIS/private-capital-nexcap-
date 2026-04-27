/**
 * Parse limit/offset from query string for list endpoints.
 * File path: lib/http/pagination.ts
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export type ParsedPagination = { limit: number; offset: number };

export function parsePagination(req: Request, opts?: { defaultLimit?: number; maxLimit?: number }): ParsedPagination {
  const url = new URL(req.url);
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = opts?.maxLimit ?? MAX_LIMIT;
  const rawLimit = Number(url.searchParams.get('limit'));
  const rawOffset = Number(url.searchParams.get('offset'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}
