import type { SectionMeta } from '@/lib/questionnaire/types';

export const basicInfoSection: SectionMeta = {
  key: 'basic_info',
  order: 1,
  title: 'Section I: Basic Information',
  helper:
    'Provide legal fund identity and primary contacts. At least two contact persons with full details are required before marking this section complete.',
  questions: [
    { key: 'fund_name', label: 'Name of Fund', type: 'text', required: true },
    {
      key: 'contact_persons',
      label: 'Contact persons',
      type: 'contact_persons',
      required: true,
    },
    {
      key: 'country_of_incorporation',
      label: 'Country of Incorporation',
      type: 'select',
      required: true,
      optionsSource: 'countries',
    },
    {
      key: 'geographic_area_activity',
      label: 'Geographic Area of Activity',
      type: 'multi_select',
      optionsSource: 'countries',
      required: true,
      helper: 'Please mention the country in which The Fund is / will be allowed to invest',
    },
    {
      key: 'total_capital_commitment_usd',
      label: 'Total capital commitment (USD)',
      type: 'currency',
      required: true,
    },
  ],
};
