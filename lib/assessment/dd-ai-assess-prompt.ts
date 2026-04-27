import { ASSESSMENT_CRITERIA } from '@/lib/scoring/config';

import type { QuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';

export const DD_AI_ASSESS_SYSTEM = `You are a senior investment analyst at the Development Bank of Jamaica evaluating a fund manager's Due Diligence Questionnaire submission.

You must assess the fund manager across 7 weighted criteria based ONLY on the evidence in their questionnaire responses. Cite specific evidence from their answers. Do not make assumptions about information not provided.

Scoring scale per subcriteria: 0 to max_points
Be rigorous but fair. A score of 0 means completely absent or inadequate. Max score means exceptional and fully evidenced.

Return valid JSON only. No other text.`;

function formatAnswer(a: {
  answer_text: string | null;
  answer_value: number | null;
  answer_boolean: boolean | null;
  answer_json: unknown;
}): string {
  if (a.answer_text != null && String(a.answer_text).trim()) return String(a.answer_text).trim();
  if (a.answer_boolean != null) return a.answer_boolean ? 'Yes' : 'No';
  if (a.answer_value != null && !Number.isNaN(Number(a.answer_value))) return String(a.answer_value);
  if (a.answer_json != null) {
    try {
      return JSON.stringify(a.answer_json);
    } catch {
      return String(a.answer_json);
    }
  }
  return '';
}

export function bundleToStructuredText(bundle: QuestionnaireBundle): string {
  const lines: string[] = [];
  for (const sec of bundle.sections) {
    lines.push(`\n## Section: ${sec.section_key} (status: ${sec.status})`);
    const answers = sec.vc_dd_answers ?? [];
    for (const a of answers) {
      const v = formatAnswer(a);
      if (!v) continue;
      lines.push(`- ${a.question_key}: ${v.slice(0, 4000)}`);
    }
  }
  lines.push('\n## Investment professionals (structured)');
  lines.push(JSON.stringify(bundle.investment_professionals, null, 2).slice(0, 20000));
  lines.push('\n## Pipeline companies (structured)');
  lines.push(JSON.stringify(bundle.pipeline_companies, null, 2).slice(0, 20000));
  lines.push('\n## Secured investors (structured)');
  lines.push(JSON.stringify(bundle.secured_investors, null, 2).slice(0, 20000));
  lines.push('\n## Potential investors (structured)');
  lines.push(JSON.stringify(bundle.potential_investors, null, 2).slice(0, 20000));
  lines.push('\n## Legal documents register (structured)');
  lines.push(JSON.stringify(bundle.legal_documents, null, 2).slice(0, 12000));
  lines.push('\n## Investment instruments (structured)');
  lines.push(JSON.stringify(bundle.investment_instruments, null, 2).slice(0, 12000));
  lines.push('\n## Investment rounds / company size (structured)');
  lines.push(JSON.stringify(bundle.investment_rounds, null, 2).slice(0, 12000));
  lines.push('\n## Sector allocations (structured)');
  lines.push(JSON.stringify(bundle.sector_allocations, null, 2).slice(0, 12000));
  lines.push('\n## Geographic allocations (structured)');
  lines.push(JSON.stringify(bundle.geographic_allocations, null, 2).slice(0, 12000));
  lines.push('\n## Co-investors / network (structured)');
  lines.push(JSON.stringify(bundle.coinvestors, null, 2).slice(0, 12000));
  return lines.join('\n');
}

function criteriaKeySpecLines(): string {
  const lines: string[] = [];
  for (const c of ASSESSMENT_CRITERIA) {
    const max = c.subcriteria.reduce((s, x) => s + x.maxPoints, 0);
    const subs = c.subcriteria.map((sc) => `${sc.key} (max ${sc.maxPoints})`).join(', ');
    lines.push(`- criteria.${c.key}: total_suggested number, max ${max}, subcriteria objects: ${subs}`);
  }
  return lines.join('\n');
}

export function buildDdAiAssessUserPrompt(params: {
  fundName: string;
  managerName: string;
  country: string;
  geography: string;
  capitalUsd: number | null;
  bundle: QuestionnaireBundle;
}): string {
  const body = bundleToStructuredText(params.bundle);
  return `Fund Manager: ${params.managerName}
Fund Name: ${params.fundName}

SECTION I — BASIC INFORMATION (from application + questionnaire):
Country of incorporation: ${params.country}
Geographic area: ${params.geography}
Total capital commitment (USD): ${params.capitalUsd ?? '—'}

QUESTIONNAIRE RESPONSES (all sections + structured lists):

${body}

Now assess this fund manager across these criteria. For each subcriteria, provide:
- suggested_score: number (0 to max_points)
- evidence: specific quote or reference from the questionnaire responses above that justifies score
- reasoning: 1-2 sentences explaining the score

Return a single JSON object with:
- fund_name, overall_assessment (string)
- criteria: object with keys ${ASSESSMENT_CRITERIA.map((c) => c.key).join(', ')}
  Each criteria value: { total_suggested, max, subcriteria: { SUBKEY: { suggested_score, max_points, evidence, reasoning } } }
  Required subcriteria keys per criterion:
${criteriaKeySpecLines()}
- strengths: string array
- concerns: string array
- suggested_recommendation: "approve" | "approve_with_conditions" | "reject"
- suggested_recommendation_reasoning: string`;
}

export type AiSubcriteriaEntry = {
  suggested_score: number;
  max_points: number;
  evidence: string;
  reasoning: string;
};

export type AiCriteriaBlock = {
  total_suggested?: number;
  max?: number;
  subcriteria: Record<string, AiSubcriteriaEntry>;
};

export type AiDdAssessmentPayload = {
  fund_name?: string;
  overall_assessment?: string;
  criteria: Record<string, AiCriteriaBlock>;
  strengths?: string[];
  concerns?: string[];
  suggested_recommendation?: string;
  suggested_recommendation_reasoning?: string;
};

export function parseAiDdAssessmentJson(text: string): { ok: true; data: AiDdAssessmentPayload } | { ok: false; error: string } {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: 'No JSON object in model response' };
  }
  try {
    const data = JSON.parse(trimmed.slice(start, end + 1)) as AiDdAssessmentPayload;
    if (!data || typeof data !== 'object' || !data.criteria || typeof data.criteria !== 'object') {
      return { ok: false, error: 'Invalid AI payload: missing criteria' };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'JSON parse failed' };
  }
}

export function evidenceForCriteria(criteriaKey: string, bundle: QuestionnaireBundle | null): Array<{ label: string; value: string }> {
  if (!bundle) return [];
  const sectionKeys: Record<string, string[]> = {
    firm: ['sponsor', 'basic_info'],
    fundraising: ['investors_fundraising', 'sponsor'],
    team: ['sponsor'],
    investment_strategy: ['investment_strategy'],
    investment_process: ['deal_flow', 'portfolio_monitoring'],
    representative_pipeline: ['deal_flow'],
    governance: ['governing_rules', 'legal', 'sponsor'],
  };
  const want = new Set(sectionKeys[criteriaKey] ?? []);
  const out: Array<{ label: string; value: string }> = [];
  for (const sec of bundle.sections) {
    if (!want.has(sec.section_key)) continue;
    for (const a of sec.vc_dd_answers ?? []) {
      const v = formatAnswer(a);
      if (!v) continue;
      out.push({
        label: `${sec.section_key} · ${a.question_key}`,
        value: v.length > 1200 ? `${v.slice(0, 1200)}…` : v,
      });
    }
  }
  if (criteriaKey === 'team' && bundle.investment_professionals.length) {
    out.push({
      label: 'STRUCTURED · Investment professionals',
      value: JSON.stringify(bundle.investment_professionals, null, 2).slice(0, 2500),
    });
  }
  if ((criteriaKey === 'representative_pipeline' || criteriaKey === 'investment_process') && bundle.pipeline_companies.length) {
    out.push({
      label: 'STRUCTURED · Pipeline companies',
      value: JSON.stringify(bundle.pipeline_companies, null, 2).slice(0, 4000),
    });
  }
  if (criteriaKey === 'fundraising' && bundle.secured_investors.length) {
    out.push({
      label: 'STRUCTURED · Secured investors',
      value: JSON.stringify(bundle.secured_investors, null, 2).slice(0, 3000),
    });
  }
  if (criteriaKey === 'fundraising' && bundle.potential_investors.length) {
    out.push({
      label: 'STRUCTURED · Potential investors',
      value: JSON.stringify(bundle.potential_investors, null, 2).slice(0, 3000),
    });
  }
  if (criteriaKey === 'firm' && bundle.coinvestors.length) {
    out.push({
      label: 'STRUCTURED · Co-investors / network',
      value: JSON.stringify(bundle.coinvestors, null, 2).slice(0, 2000),
    });
  }
  if (criteriaKey === 'investment_strategy' && bundle.investment_instruments.length) {
    out.push({
      label: 'STRUCTURED · Investment instruments',
      value: JSON.stringify(bundle.investment_instruments, null, 2).slice(0, 2000),
    });
  }
  if (criteriaKey === 'investment_strategy' && bundle.sector_allocations.length) {
    out.push({
      label: 'STRUCTURED · Sector allocations',
      value: JSON.stringify(bundle.sector_allocations, null, 2).slice(0, 2000),
    });
  }
  if (criteriaKey === 'investment_strategy' && bundle.geographic_allocations.length) {
    out.push({
      label: 'STRUCTURED · Geographic allocations',
      value: JSON.stringify(bundle.geographic_allocations, null, 2).slice(0, 2000),
    });
  }
  if (criteriaKey === 'investment_strategy' && bundle.investment_rounds.length) {
    out.push({
      label: 'STRUCTURED · Investment rounds (size/stage)',
      value: JSON.stringify(bundle.investment_rounds, null, 2).slice(0, 2000),
    });
  }
  if (criteriaKey === 'governance' && bundle.legal_documents.length) {
    out.push({
      label: 'STRUCTURED · Legal documents',
      value: JSON.stringify(bundle.legal_documents, null, 2).slice(0, 3000),
    });
  }
  return out.slice(0, 40);
}
