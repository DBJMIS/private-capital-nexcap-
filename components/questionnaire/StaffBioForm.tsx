'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DocumentUpload, type DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import { CountryNameSingleSelect } from '@/components/questionnaire/CountryNameSingleSelect';
import { countWords } from '@/lib/questionnaire/word-count';
import { cn } from '@/lib/utils';

export type EducationRow = { year?: string; institution?: string; degree?: string };

export type StaffBioFormRow = {
  id?: string;
  full_name: string;
  work_phone?: string;
  email?: string;
  date_of_birth?: string;
  nationality?: string;
  education: EducationRow[];
  work_experience: string;
  fund_responsibilities: string;
};

export type StaffBioFormProps = {
  questionnaireId: string;
  sectionKey: string;
  value: StaffBioFormRow[];
  documents: DdDocumentRow[];
  disabled?: boolean;
  onChange: (bios: StaffBioFormRow[]) => void;
  onDocumentsChanged?: () => void;
};

function newBio(): StaffBioFormRow {
  return {
    full_name: '',
    work_phone: '',
    email: '',
    date_of_birth: '',
    nationality: '',
    education: [{ year: '', institution: '', degree: '' }],
    work_experience: '',
    fund_responsibilities: '',
  };
}

function BioFieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[13px] font-medium normal-case leading-snug text-navy"
    >
      {children}
    </label>
  );
}

export function StaffBioForm({
  questionnaireId,
  sectionKey,
  value,
  documents,
  disabled,
  onChange,
  onDocumentsChanged,
}: StaffBioFormProps) {
  const bios = value.length ? value : [];
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => {
    setExpanded((s) => ({ ...s, [i]: !s[i] }));
  };

  const updateBio = (i: number, patch: Partial<StaffBioFormRow>) => {
    onChange(bios.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };

  const updateEducation = (bioIdx: number, eduIdx: number, patch: Partial<EducationRow>) => {
    const b = bios[bioIdx];
    const edu = b.education.map((e, j) => (j === eduIdx ? { ...e, ...patch } : e));
    updateBio(bioIdx, { education: edu });
  };

  const addEducation = (bioIdx: number) => {
    const b = bios[bioIdx];
    updateBio(bioIdx, { education: [...b.education, { year: '', institution: '', degree: '' }] });
  };

  const removeEducation = (bioIdx: number, eduIdx: number) => {
    const b = bios[bioIdx];
    if (b.education.length < 2) return;
    updateBio(bioIdx, { education: b.education.filter((_, j) => j !== eduIdx) });
  };

  const cvDoc = useCallback(
    (bioId?: string) => (bioId ? documents.find((d) => d.tag === 'staff_cv' && d.staff_bio_id === bioId) ?? null : null),
    [documents],
  );

  return (
    <div className="space-y-6">
      {bios.map((bio, i) => {
        const open = expanded[i] === true;
        const title = bio.full_name?.trim() || `Team member ${i + 1}`;
        return (
          <div key={bio.id ?? `new-${i}`} className="rounded-xl border border-[#E5E7EB] bg-white shadow-none">
            <div className="flex items-center gap-2 px-2 py-2 md:px-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[#f9fafb]"
                onClick={() => toggle(i)}
                aria-expanded={open}
              >
                {open ? <ChevronDown className="h-4 w-4 shrink-0 text-navy" /> : <ChevronRight className="h-4 w-4 shrink-0 text-navy" />}
                <span className="truncate text-[13px] font-semibold text-navy">{title}</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-teal"
                disabled={disabled}
                onClick={() => onChange(bios.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>

            {open && (
              <div className="border-t border-[#f1f3f5] px-5 pb-5 pt-4">
                <div className="space-y-5 border-l-2 border-navy pl-4 md:space-y-8">
                  <div className="grid gap-5 md:grid-cols-2 md:gap-x-8">
                    <div className="md:col-span-2">
                      <BioFieldLabel htmlFor={`bio-name-${i}`}>
                        Full name <span className="text-gold">*</span>
                      </BioFieldLabel>
                      <Input
                        id={`bio-name-${i}`}
                        value={bio.full_name}
                        disabled={disabled}
                        onChange={(e) => updateBio(i, { full_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <BioFieldLabel htmlFor={`bio-phone-${i}`}>Phone</BioFieldLabel>
                      <Input
                        id={`bio-phone-${i}`}
                        value={bio.work_phone ?? ''}
                        disabled={disabled}
                        onChange={(e) => updateBio(i, { work_phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <BioFieldLabel htmlFor={`bio-email-${i}`}>Email</BioFieldLabel>
                      <Input
                        id={`bio-email-${i}`}
                        type="email"
                        value={bio.email ?? ''}
                        disabled={disabled}
                        onChange={(e) => updateBio(i, { email: e.target.value })}
                      />
                    </div>
                    <div>
                      <BioFieldLabel htmlFor={`bio-dob-${i}`}>Date of birth</BioFieldLabel>
                      <Input
                        id={`bio-dob-${i}`}
                        type="date"
                        value={bio.date_of_birth ?? ''}
                        disabled={disabled}
                        onChange={(e) => updateBio(i, { date_of_birth: e.target.value })}
                      />
                    </div>
                    <div>
                      <CountryNameSingleSelect
                        id={`bio-nat-${i}`}
                        label="Nationality"
                        value={bio.nationality?.trim() ?? ''}
                        onChange={(name) => updateBio(i, { nationality: name })}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <BioFieldLabel>Education</BioFieldLabel>
                      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => addEducation(i)}>
                        Add row
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
                                  onChange={(ev) => updateEducation(i, j, { year: ev.target.value })}
                                  className="h-9 text-[13px]"
                                />
                              </td>
                              <td>
                                <Input
                                  value={e.institution ?? ''}
                                  disabled={disabled}
                                  onChange={(ev) => updateEducation(i, j, { institution: ev.target.value })}
                                  className="h-9 text-[13px]"
                                />
                              </td>
                              <td>
                                <Input
                                  value={e.degree ?? ''}
                                  disabled={disabled}
                                  onChange={(ev) => updateEducation(i, j, { degree: ev.target.value })}
                                  className="h-9 text-[13px]"
                                />
                              </td>
                              <td>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={disabled || bio.education.length < 2}
                                  onClick={() => removeEducation(i, j)}
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
                      <BioFieldLabel htmlFor={`bio-we-${i}`}>Work experience (max 400 words)</BioFieldLabel>
                      <span className="text-[12px] text-[#9ca3af]">{countWords(bio.work_experience)} / 400</span>
                    </div>
                    <Textarea
                      id={`bio-we-${i}`}
                      rows={6}
                      disabled={disabled}
                      value={bio.work_experience}
                      onChange={(e) => updateBio(i, { work_experience: e.target.value })}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between gap-2">
                      <BioFieldLabel htmlFor={`bio-fr-${i}`}>Fund responsibilities (max 300 words)</BioFieldLabel>
                      <span className="text-[12px] text-[#9ca3af]">{countWords(bio.fund_responsibilities)} / 300</span>
                    </div>
                    <Textarea
                      id={`bio-fr-${i}`}
                      rows={5}
                      disabled={disabled}
                      value={bio.fund_responsibilities}
                      onChange={(e) => updateBio(i, { fund_responsibilities: e.target.value })}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <BioFieldLabel>CV (PDF/DOCX)</BioFieldLabel>
                    <DocumentUpload
                      questionnaireId={questionnaireId}
                      sectionKey={sectionKey}
                      tag="staff_cv"
                      staffBioId={bio.id ?? null}
                      existing={cvDoc(bio.id)}
                      disabled={disabled || !bio.id}
                      onListChanged={onDocumentsChanged}
                      label={!bio.id ? 'Save bio first to enable CV upload' : undefined}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange([...bios, newBio()])}>
        Add team member
      </Button>
    </div>
  );
}
