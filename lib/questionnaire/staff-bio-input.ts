/**
 * Map StaffBioFormRow to StaffBioInput for API upserts.
 * File path: lib/questionnaire/staff-bio-input.ts
 */

import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import type { StaffBioInput } from '@/lib/questionnaire/validate';

export function staffBioFormRowToInput(b: StaffBioFormRow): StaffBioInput {
  return {
    id: b.id,
    full_name: b.full_name,
    work_phone: b.work_phone || null,
    email: b.email || null,
    date_of_birth: b.date_of_birth || null,
    nationality: b.nationality || null,
    education: b.education,
    work_experience: b.work_experience || null,
    fund_responsibilities: b.fund_responsibilities || null,
  };
}

export function newEmptyStaffBioForm(partial?: Partial<StaffBioFormRow>): StaffBioFormRow {
  return {
    full_name: partial?.full_name ?? '',
    work_phone: partial?.work_phone ?? '',
    email: partial?.email ?? '',
    date_of_birth: partial?.date_of_birth ?? '',
    nationality: partial?.nationality ?? '',
    education: partial?.education ?? [{ year: '', institution: '', degree: '' }],
    work_experience: partial?.work_experience ?? '',
    fund_responsibilities: partial?.fund_responsibilities ?? '',
    ...partial,
  };
}
