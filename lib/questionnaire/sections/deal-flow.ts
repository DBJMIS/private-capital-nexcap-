import type { SectionMeta } from '@/lib/questionnaire/types';

export const dealFlowSection: SectionMeta = {
  key: 'deal_flow',
  order: 3,
  title: 'Section III: Presence & Deal Flow',
  helper:
    'Explain sourcing edge, environment, and pipeline discipline. Add pipeline companies you have approached or plan to approach. Summarise ESG integration.',
  questions: [
    {
      key: 'competitive_advantage',
      label: 'Competitive advantage and competitive landscape',
      type: 'textarea',
      rows: 5,
      required: true,
    },
    {
      key: 'business_environment_dynamics',
      label: 'Business environment dynamics',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'networking_assets',
      label: 'Networking assets',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'sourcing_strategy',
      label: 'Sourcing strategy and pipeline management',
      type: 'textarea',
      rows: 5,
      required: true,
    },
    {
      key: 'deal_flow_universe',
      label: 'Deal flow — universe size and sources',
      type: 'textarea',
      rows: 4,
      required: true,
    },
    {
      key: 'pipeline_companies',
      label: 'Pipeline',
      type: 'pipeline_companies',
      required: true,
      helper:
        'Add companies with expected investment, negotiation status, exit type, and rationale. At least one company is required to complete the section.',
    },
    {
      key: 'esg_guidelines',
      label: 'ESG guidelines',
      type: 'textarea',
      rows: 5,
      required: true,
    },
  ],
};
