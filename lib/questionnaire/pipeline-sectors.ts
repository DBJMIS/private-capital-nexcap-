/** Pipeline company sector options (aligned with Section V-style sector list). */
export const PIPELINE_SECTOR_OPTIONS = [
  { value: 'technology', label: 'Technology' },
  { value: 'financial_services', label: 'Financial Services' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'energy', label: 'Energy' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'tourism', label: 'Tourism' },
  { value: 'retail', label: 'Retail' },
  { value: 'construction', label: 'Construction' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'media', label: 'Media' },
  { value: 'other', label: 'Other' },
] as const;

export type PipelineSectorValue = (typeof PIPELINE_SECTOR_OPTIONS)[number]['value'];

export function pipelineSectorLabel(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const hit = PIPELINE_SECTOR_OPTIONS.find((o) => o.value === v);
  return hit?.label ?? v.replace(/_/g, ' ');
}
