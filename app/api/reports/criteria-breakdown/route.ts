import { NextResponse } from 'next/server';

import { loadReportFilterContext } from '@/lib/reports/api-load';
import { reportsJson } from '@/lib/reports/http';
import { getCriteriaBreakdown } from '@/lib/reports/queries';

export const revalidate = 60;

export async function GET(request: Request) {
  const ctx = await loadReportFilterContext(request);
  if (ctx instanceof NextResponse) return ctx;

  const criteria = await getCriteriaBreakdown(ctx.supabase, ctx.tenantId, ctx.filterApps);
  return reportsJson({ criteria });
}
