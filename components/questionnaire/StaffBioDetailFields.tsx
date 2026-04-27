'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DocumentUpload, type DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import type { EducationRow, StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import { countWords } from '@/lib/questionnaire/word-count';
import { bioCompletionDots } from '@/lib/questionnaire/bio-completion';

function BioFieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-navy">
      {children}
    </label>
  );
}

type Props = {
  bio: StaffBioFormRow;
  onChange: (patch: Partial<StaffBioFormRow>) => void;
  disabled?: boolean;
  questionnaireId: string;
  sectionKey: string;
  documents: DdDocumentRow[];
  onListChanged?: () => void;
};

export function StaffBioDetailFields({
  bio,
  onChange,
  disabled,
  questionnaireId,
  sectionKey,
  documents,
  onListChanged,
}: Props) {
  const dots = bioCompletionDots(bio);
  const filled = dots.filter(Boolean).length;

  const updateEducation = (eduIdx: number, patch: Partial<EducationRow>) => {
    const edu = bio.education.map((e, j) => (j === eduIdx ? { ...e, ...patch } : e));
    onChange({ education: edu });
  };

  const addEducation = () => {
    onChange({ education: [...bio.education, { year: '', institution: '', degree: '' }] });
  };

  const removeEducation = (eduIdx: number) => {
    if (bio.education.length < 2) return;
    onChange({ education: bio.education.filter((_, j) => j !== eduIdx) });
  };

  const cvDoc = bio.id ? documents.find((d) => d.tag === 'staff_cv' && d.staff_bio_id === bio.id) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-sm font-medium text-navy">
          Bio completion: {filled} of 5 sections
        </span>
        <div className="flex gap-1" aria-hidden>
          {dots.map((on, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-teal' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contact & personal</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <BioFieldLabel htmlFor="sb-phone">Work phone</BioFieldLabel>
            <Input
              id="sb-phone"
              value={bio.work_phone ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ work_phone: e.target.value })}
            />
          </div>
          <div>
            <BioFieldLabel htmlFor="sb-email">Email</BioFieldLabel>
            <Input
              id="sb-email"
              type="email"
              value={bio.email ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ email: e.target.value })}
            />
          </div>
          <div>
            <BioFieldLabel htmlFor="sb-dob">Date of birth</BioFieldLabel>
            <Input
              id="sb-dob"
              type="date"
              value={bio.date_of_birth ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ date_of_birth: e.target.value })}
            />
          </div>
          <div>
            <BioFieldLabel htmlFor="sb-nat">Nationality</BioFieldLabel>
            <Input
              id="sb-nat"
              value={bio.nationality ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ nationality: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Education</p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={addEducation}>
            + Add education row
          </Button>
        </div>
        <div className="app-table-wrap">
          <table className="app-table min-w-[480px] [&_tbody_td]:h-auto [&_tbody_td]:px-2 [&_tbody_td]:py-1.5">
            <thead>
              <tr>
                <th>Year</th>
                <th>Institution</th>
                <th>Degree</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {bio.education.map((e, j) => (
                <tr key={j}>
                  <td>
                    <Input
                      value={e.year ?? ''}
                      disabled={disabled}
                      onChange={(ev) => updateEducation(j, { year: ev.target.value })}
                      className="h-9 text-[13px]"
                    />
                  </td>
                  <td>
                    <Input
                      value={e.institution ?? ''}
                      disabled={disabled}
                      onChange={(ev) => updateEducation(j, { institution: ev.target.value })}
                      className="h-9 text-[13px]"
                    />
                  </td>
                  <td>
                    <Input
                      value={e.degree ?? ''}
                      disabled={disabled}
                      onChange={(ev) => updateEducation(j, { degree: ev.target.value })}
                      className="h-9 text-[13px]"
                    />
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled || bio.education.length < 2}
                      onClick={() => removeEducation(j)}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between gap-2">
          <BioFieldLabel htmlFor="sb-we">Work experience</BioFieldLabel>
          <span className="text-[12px] text-gray-400">{countWords(bio.work_experience)} / 400</span>
        </div>
        <Textarea
          id="sb-we"
          rows={6}
          disabled={disabled}
          value={bio.work_experience}
          onChange={(e) => onChange({ work_experience: e.target.value })}
          className="min-h-[150px]"
        />
      </div>

      <div>
        <div className="mb-1 flex justify-between gap-2">
          <BioFieldLabel htmlFor="sb-fr">Fund responsibilities</BioFieldLabel>
          <span className="text-[12px] text-gray-400">{countWords(bio.fund_responsibilities)} / 300</span>
        </div>
        <Textarea
          id="sb-fr"
          rows={5}
          disabled={disabled}
          value={bio.fund_responsibilities}
          onChange={(e) => onChange({ fund_responsibilities: e.target.value })}
          className="min-h-[120px]"
        />
      </div>

      <div>
        <BioFieldLabel>CV (PDF/DOCX)</BioFieldLabel>
        <DocumentUpload
          questionnaireId={questionnaireId}
          sectionKey={sectionKey}
          tag="staff_cv"
          staffBioId={bio.id ?? null}
          existing={cvDoc}
          disabled={disabled || !bio.id}
          onListChanged={onListChanged}
          label={!bio.id ? 'Save details first to enable CV upload' : undefined}
        />
      </div>
    </div>
  );
}
