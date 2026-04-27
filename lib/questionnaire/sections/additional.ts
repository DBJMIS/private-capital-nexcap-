import type { SectionMeta } from '@/lib/questionnaire/types';

export const additionalInformationSection: SectionMeta = {
  key: 'additional',
  order: 9,
  title: 'Section IX: Additional Information',
  helper:
    'Provide any other material information not captured in prior sections (risks, partnerships, prior funds, references).',
  questions: [
    {
      key: 'additional_context',
      label: 'Additional context for DBJ reviewers',
      type: 'textarea',
      rows: 8,
      required: false,
      helper: 'Optional but encouraged if you have disclosures, constraints, or context that affect evaluation.',
    },
    {
      key: 'references_or_testimonials',
      label: 'References or testimonials (names, organisations, contact if permitted)',
      type: 'textarea',
      rows: 5,
      required: false,
    },
  ],
};
