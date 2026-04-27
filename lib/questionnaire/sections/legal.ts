import type { SectionMeta } from '@/lib/questionnaire/types';

export const legalSection: SectionMeta = {
  key: 'legal',
  order: 8,
  title: 'Section VIII: Legal Issues & Documentation',
  helper:
    'Maintain a register of legal documents with status. Upload supporting files. Repeat regulations and litigation summary if not fully covered in Section 2.',
  questions: [
    {
      key: 'legal_documents_register',
      label: 'Legal documents register',
      type: 'legal_documents_list',
      required: true,
      helper: 'Add each document required to constitute and regulate the Fund and Manager.',
    },
    {
      key: 'legal_regulations_compliance',
      label: 'Applicable regulations and compliance status',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'legal_litigation_summary',
      label: 'Legal status — litigation summary',
      type: 'textarea',
      rows: 4,
      required: true,
    },
  ],
};
