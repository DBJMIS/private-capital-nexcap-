/**
 * Object keys for `portfolio-reports` must start with `tenant_id/` (storage RLS).
 */
export function portfolioReportObjectPath(
  tenantId: string,
  fundId: string,
  periodLabel: string,
  reportType: string,
  ext: string,
): string {
  const safePeriod = periodLabel.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80);
  const safeType = reportType.replace(/[^a-z0-9_]/gi, '_');
  const e = ext.startsWith('.') ? ext : `.${ext}`;
  return `${tenantId}/${fundId}/${safeType}_${safePeriod}${e}`;
}
