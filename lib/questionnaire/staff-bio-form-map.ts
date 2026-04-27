/**
 * Map vc_dd_staff_bios API rows to StaffBioFormRow (shared by section GET + panel).
 * File path: lib/questionnaire/staff-bio-form-map.ts
 */

import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';

export type StaffBioApiRow = {
  id: string;
  full_name: string;
  work_phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  education: unknown;
  work_experience: string | null;
  fund_responsibilities: string | null;
};

export function mapStaffBiosFromApi(rows: StaffBioApiRow[]): StaffBioFormRow[] {
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    work_phone: r.work_phone ?? '',
    email: r.email ?? '',
    date_of_birth: r.date_of_birth ?? '',
    nationality: r.nationality ?? '',
    education:
      Array.isArray(r.education) && r.education.length > 0
        ? (r.education as StaffBioFormRow['education'])
        : [{ year: '', institution: '', degree: '' }],
    work_experience: r.work_experience ?? '',
    fund_responsibilities: r.fund_responsibilities ?? '',
  }));
}
