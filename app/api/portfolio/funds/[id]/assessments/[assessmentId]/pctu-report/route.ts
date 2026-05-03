import { NextResponse } from 'next/server';
import type { Browser } from 'puppeteer-core';

import { logAndReturn } from '@/lib/api/errors';
import { assemblePctuReportData } from '@/lib/portfolio/pctu-report-data';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; assessmentId: string }> };

function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = (req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')).split(',')[0]?.trim() || 'https';
  return `${proto}://${host}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'Fund';
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !can(profile, 'read:tenant')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: fundId, assessmentId } = await ctx.params;
    let payload;
    try {
      payload = await assemblePctuReportData(profile.tenant_id, fundId, assessmentId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to build report';
      if (msg.includes('approved')) {
        return logAndReturn(
          e,
          'pctu-report/build',
          'VALIDATION_ERROR',
          'Report cannot be generated — assessment not in approved state',
          400,
        );
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const cookie = req.headers.get('cookie') ?? '';
    if (!cookie) {
      return NextResponse.json({ error: 'Missing session cookie' }, { status: 401 });
    }

    const origin = requestOrigin(req);
    const previewPath = `/portfolio/funds/${fundId}/assessments/${assessmentId}/pctu-preview`;
    const previewUrl = `${origin}${previewPath}`;

    const fundPart = safeFilenamePart(payload.header.fund_name);
    const periodPart = safeFilenamePart(payload.header.period_label);
    const filename = `PCTU-Report-${fundPart}-${periodPart}.pdf`;

    const footerText = `${escHtml(payload.header.fund_name)} · ${escHtml(payload.header.period_label)} · CONFIDENTIAL — DBJ Private Capital Technical Unit`;
    const footerTemplate = `<div style="width:100%;font-size:9px;color:#444;text-align:center;font-family:Georgia,serif;padding:0 12px;"><span class="pageNumber"></span> / <span class="totalPages"></span> · ${footerText}</div>`;

    const isProd = process.env.NODE_ENV === 'production';

    let browser: Browser | undefined;
    try {
      if (isProd) {
        const chromium = (await import('@sparticuz/chromium')).default;
        const puppeteerCore = await import('puppeteer-core');
        browser = await puppeteerCore.default.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      } else {
        const puppeteer = await import('puppeteer');
        browser = await puppeteer.default.launch({ headless: true });
      }

      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ Cookie: cookie });
      await page.goto(previewUrl, { waitUntil: 'networkidle0', timeout: 120_000 });
      await page.emulateMediaType('print');

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate,
        margin: { top: '18mm', bottom: '22mm', left: '18mm', right: '18mm' },
      });

      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  } catch (e) {
    return logAndReturn(e, 'pctu-report/pdf-generation', 'PDF_ERROR', 'PDF generation failed — please try again', 500);
  }
}
