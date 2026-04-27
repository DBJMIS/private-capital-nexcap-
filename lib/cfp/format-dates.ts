export function formatCfpDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCfpDateRange(openingDate: string, closingDate: string): string {
  return `${formatCfpDate(openingDate)} → ${formatCfpDate(closingDate)}`;
}
