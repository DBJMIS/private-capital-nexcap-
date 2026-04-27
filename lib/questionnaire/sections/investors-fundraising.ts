import type { SectionMeta } from '@/lib/questionnaire/types';

export const investorsFundraisingSection: SectionMeta = {
  key: 'investors_fundraising',
  order: 7,
  title: 'Section VII: Investors / Fundraising / Closing',
  helper:
    'List secured and potential investors with amounts and timelines. Set closing dates, number of closings, and late entrant terms.',
  questions: [
    {
      key: 'secured_investors',
      label: 'Secured investors',
      type: 'structured_list',
      listKind: 'secured_investors',
      required: false,
      addLabel: '+ Add Secured Investor',
      helper: 'Investors who have formally committed or confirmed investment.',
    },
    {
      key: 'potential_investors',
      label: 'Potential investors',
      type: 'structured_list',
      listKind: 'potential_investors',
      required: true,
      addLabel: '+ Add Potential Investor',
      helper: 'Investors you have approached or plan to approach.',
    },
    {
      key: 'first_closing_date',
      label: 'First closing date',
      type: 'text',
      required: true,
    },
    {
      key: 'final_closing_date',
      label: 'Final closing date',
      type: 'text',
      required: true,
    },
    {
      key: 'number_of_closings',
      label: 'Number of closings',
      type: 'number',
      required: true,
    },
    {
      key: 'late_entrant_terms',
      label: 'Late entrant terms',
      type: 'textarea',
      rows: 4,
      required: true,
    },
  ],
};
