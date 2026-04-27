/**
 * Visual grouping for DD questionnaire sections (question keys → cards/rows).
 * Does not affect validation or persistence — UI layout only.
 */

import type { DdSectionKey, QuestionDef } from '@/lib/questionnaire/types';
import {
  SPONSOR_ALIGNMENT_BUNDLE_KEYS,
  SPONSOR_ALIGNMENT_LAYOUT_SENTINEL,
} from '@/lib/questionnaire/sponsor-alignment-bundle';
import {
  SPONSOR_CONFLICTS_LEGAL_BUNDLE_KEYS,
  SPONSOR_CONFLICTS_LEGAL_LAYOUT_SENTINEL,
} from '@/lib/questionnaire/sponsor-conflicts-legal-bundle';

/** One row: one key (full width) or two keys (two columns). */
export type SectionLayoutRow = [string] | [string, string];

export type SectionLayoutGroup = {
  title: string;
  rows: SectionLayoutRow[];
};

export const DD_SECTION_LAYOUT: Record<DdSectionKey, SectionLayoutGroup[]> = {
  basic_info: [
    {
      title: 'Fund identity & geography',
      rows: [['fund_name', 'country_of_incorporation'], ['geographic_area_activity']],
    },
    {
      title: 'Capital & structure',
      rows: [['total_capital_commitment_usd']],
    },
    {
      title: 'Contact persons',
      rows: [['contact_persons']],
    },
  ],

  sponsor: [
    {
      title: 'Manager identity',
      rows: [['manager_name'], ['shareholders']],
    },
    {
      title: 'Team structure',
      rows: [
        ['investment_professionals'],
        ['support_staff'],
        ['outside_advisors'],
        ['office_locations'],
      ],
    },
    {
      title: 'Alignment & compensation',
      rows: [[SPONSOR_ALIGNMENT_LAYOUT_SENTINEL]],
    },
    {
      title: 'Conflicts & legal',
      rows: [[SPONSOR_CONFLICTS_LEGAL_LAYOUT_SENTINEL]],
    },
    {
      title: 'Track record & financials',
      rows: [['track_record_vc_pe'], ['financial_strength_evidence'], ['org_chart', 'financial_statements']],
    },
  ],

  deal_flow: [
    {
      title: 'Competitive landscape',
      rows: [['competitive_advantage', 'business_environment_dynamics']],
    },
    {
      title: 'Sourcing',
      rows: [['networking_assets', 'sourcing_strategy'], ['deal_flow_universe']],
    },
    {
      title: 'Pipeline',
      rows: [['pipeline_companies']],
    },
    {
      title: 'ESG',
      rows: [['esg_guidelines']],
    },
  ],

  portfolio_monitoring: [
    {
      title: 'Monitoring & confidentiality',
      rows: [['monitoring_procedures', 'confidential_information_policy'], ['it_platforms']],
    },
    {
      title: 'Management & valuation',
      rows: [['management_recruiting', 'valuation_guidelines']],
    },
    {
      title: 'Exits & audit',
      rows: [
        ['exit_identification'],
        ['fund_auditing_policy', 'portfolio_company_auditing_policy'],
        ['certifications'],
      ],
    },
  ],

  investment_strategy: [
    {
      title: 'Stage allocation',
      rows: [['stage_allocation']],
    },
    {
      title: 'Size parameters',
      rows: [['company_size_params'], ['investment_rounds']],
    },
    {
      title: 'Diversification',
      rows: [['sector_allocations', 'geographic_allocations'], ['jamaica_min_allocation_pct'], ['other_diversification_params'], ['other_investment_params']],
    },
    {
      title: 'Control & protection',
      rows: [['control_policy', 'protection_clauses']],
    },
    {
      title: 'Returns & horizon',
      rows: [['gross_irr_target_pct', 'net_irr_target_pct'], ['investment_horizon_years']],
    },
    {
      title: 'Instruments & fees',
      rows: [['investment_instruments'], ['charges_portfolio_fees', 'portfolio_fees_description']],
    },
    {
      title: 'Co-investment',
      rows: [['coinvestment_reliance', 'coinvestment_steps'], ['coinvestors']],
    },
    {
      title: 'Thesis & projections',
      rows: [['investment_thesis'], ['portfolio_projection_excel']],
    },
  ],

  governing_rules: [
    {
      title: 'Economics & waterfall',
      rows: [
        ['management_fee', 'fund_expenses'],
        ['capital_call_mechanics'],
        ['distribution_waterfall'],
        ['tax_liabilities'],
        ['investment_period_fund_life_extensions'],
        ['leverage_policy'],
      ],
    },
    {
      title: 'Governance & control',
      rows: [
        ['key_persons_obligations'],
        ['removal_of_manager', 'liquidation_process'],
        ['early_liquidation_triggers'],
        ['shareholder_meetings_voting'],
        ['investment_committee'],
        ['other_committees'],
        ['commitment_thresholds'],
      ],
    },
  ],

  investors_fundraising: [
    {
      title: 'Secured investors',
      rows: [['secured_investors']],
    },
    {
      title: 'Potential investors',
      rows: [['potential_investors']],
    },
    {
      title: 'Closing timeline',
      rows: [['first_closing_date', 'final_closing_date'], ['number_of_closings'], ['late_entrant_terms']],
    },
  ],

  legal: [
    {
      title: 'Legal documents register',
      rows: [['legal_documents_register']],
    },
    {
      title: 'Declarations',
      rows: [['legal_regulations_compliance', 'legal_litigation_summary']],
    },
  ],

  additional: [
    {
      title: 'Additional disclosures',
      rows: [['additional_context'], ['references_or_testimonials']],
    },
  ],
};

function isWideQuestion(q: QuestionDef | undefined): boolean {
  if (!q) return true;
  if (
    q.type === 'textarea' ||
    q.type === 'file' ||
    q.type === 'pipeline_companies' ||
    q.type === 'legal_documents_table' ||
    q.type === 'legal_documents_list' ||
    q.type === 'contact_persons' ||
    q.type === 'structured_list' ||
    q.type === 'multi_select' ||
    q.type === 'stage_allocation' ||
    q.type === 'company_size_params'
  )
    return true;
  if (q.type === 'text' && (q as { maxWords?: number }).maxWords) return true;
  return false;
}

/**
 * Expand a 2-key row to two full-width rows if either question is "wide",
 * so pipeline tables and long text never get squeezed into half width.
 */
export function normalizeLayoutRows(groups: SectionLayoutGroup[], questions: QuestionDef[]): SectionLayoutGroup[] {
  const qmap = new Map(questions.map((q) => [q.key, q]));
  return groups.map((g) => ({
    title: g.title,
    rows: g.rows.flatMap((row) => {
      if (row.length === 1) return [row];
      const [a, b] = row;
      const qa = qmap.get(a);
      const qb = qmap.get(b);
      if (isWideQuestion(qa) || isWideQuestion(qb)) {
        return [[a] as SectionLayoutRow, [b] as SectionLayoutRow];
      }
      return [row];
    }),
  }));
}

export function getSectionLayoutGroups(sectionKey: DdSectionKey, questions: QuestionDef[]): SectionLayoutGroup[] {
  const defined = DD_SECTION_LAYOUT[sectionKey];
  if (!defined?.length) {
    return [{ title: '', rows: questions.map((q) => [q.key] as SectionLayoutRow) }];
  }

  const normalized = normalizeLayoutRows(defined, questions);
  const used = new Set<string>();
  for (const g of normalized) {
    for (const row of g.rows) {
      for (const k of row) {
        if (sectionKey === 'sponsor' && k === SPONSOR_ALIGNMENT_LAYOUT_SENTINEL) {
          for (const bk of SPONSOR_ALIGNMENT_BUNDLE_KEYS) used.add(bk);
        } else if (sectionKey === 'sponsor' && k === SPONSOR_CONFLICTS_LEGAL_LAYOUT_SENTINEL) {
          for (const bk of SPONSOR_CONFLICTS_LEGAL_BUNDLE_KEYS) used.add(bk);
        } else {
          used.add(k);
        }
      }
    }
  }
  const missing = questions.filter((q) => !used.has(q.key));
  if (!missing.length) return normalized;

  return [
    ...normalized,
    {
      title: 'Additional fields',
      rows: missing.map((q) => [q.key] as SectionLayoutRow),
    },
  ];
}
