import type { SectionMeta } from '@/lib/questionnaire/types';

export const portfolioMonitoringSection: SectionMeta = {
  key: 'portfolio_monitoring',
  order: 4,
  title: 'Section IV: Portfolio Monitoring & Exit Execution',
  helper:
    'Describe monitoring cadence, confidentiality, systems, talent, valuation, exits, and audit policies for fund and portfolio companies.',
  questions: [
    {
      key: 'monitoring_procedures',
      label: 'Monitoring procedures (contact frequency, report types, who reviews)',
      type: 'textarea',
      rows: 5,
      required: true,
    },
    {
      key: 'confidential_information_policy',
      label: 'Confidential information policy',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'it_platforms',
      label: 'IT platforms used',
      type: 'textarea',
      rows: 3,
      required: true,
    },
    {
      key: 'management_recruiting',
      label: 'Management recruiting approach',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'valuation_guidelines',
      label: 'Valuation guidelines',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'exit_identification',
      label: 'Exit identification process',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'fund_auditing_policy',
      label: 'Fund auditing policy',
      type: 'textarea',
      rows: 3,
      required: true,
    },
    {
      key: 'portfolio_company_auditing_policy',
      label: 'Portfolio company auditing policy',
      type: 'textarea',
      rows: 3,
      required: true,
    },
    {
      key: 'certifications',
      label: 'Certifications',
      type: 'textarea',
      rows: 3,
      required: false,
    },
  ],
};
