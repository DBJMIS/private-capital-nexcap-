/**
 * Bio completion scoring for sponsor personnel list + modal (5 sections).
 * File path: lib/questionnaire/bio-completion.ts
 */

import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import { countWords } from '@/lib/questionnaire/word-count';
import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Five dots: personal, education, experience, responsibilities, contact (phone+email). */
export function bioCompletionDots(bio: StaffBioFormRow | null | undefined): boolean[] {
  if (!bio) return [false, false, false, false, false];
  const personal =
    str(bio.work_phone) ||
    str(bio.email) ||
    str(bio.date_of_birth) ||
    str(bio.nationality);
  const eduOk = (bio.education ?? []).some((e) => str(e.institution) && str(e.degree));
  const wx = countWords(bio.work_experience ?? '') > 0;
  const fr = countWords(bio.fund_responsibilities ?? '') > 0;
  const contact = str(bio.work_phone) && str(bio.email);
  return [!!personal, eduOk, wx, fr, !!contact];
}

export function bioCompletionPct(bio: StaffBioFormRow | null | undefined): number {
  const dots = bioCompletionDots(bio);
  return Math.round((dots.filter(Boolean).length / 5) * 100);
}

export function bioHasCv(documents: DdDocumentRow[], bioId: string | undefined): boolean {
  if (!bioId) return false;
  return documents.some((d) => d.tag === 'staff_cv' && d.staff_bio_id === bioId);
}

/** True if linked bio has CV, education rows, narrative fields, or contact/personal fields filled. */
export function staffBioHasSubstantiveContent(
  bio: StaffBioFormRow | null | undefined,
  documents: DdDocumentRow[],
  bioId: string | undefined,
): boolean {
  if (bioId && bioHasCv(documents, bioId)) return true;
  if (!bio) return false;
  if (bioCompletionPct(bio) > 0) return true;
  if (str(bio.work_phone) || str(bio.email) || str(bio.date_of_birth) || str(bio.nationality)) return true;
  if (countWords(bio.work_experience ?? '') > 0 || countWords(bio.fund_responsibilities ?? '') > 0) return true;
  const edu = bio.education ?? [];
  if (edu.some((e) => str(e.institution) || str(e.degree) || str(e.year))) return true;
  return false;
}

/** Optional sixth signal for future; currently completion uses 5 dots only. */
export function bioCompletionLabel(
  pct: number,
  variant: 'employee' | 'vacant',
): { text: string; className: string } {
  if (variant === 'vacant') return { text: 'N/A', className: 'bg-gray-100 text-gray-500' };
  if (pct <= 0) return { text: 'Bio required', className: 'bg-red-50 text-red-700' };
  if (pct < 100) return { text: `Bio ${pct}%`, className: 'bg-amber-50 text-amber-800' };
  return { text: 'Bio ✓', className: 'bg-teal/10 text-teal' };
}
