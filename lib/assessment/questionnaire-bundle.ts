import type { SupabaseClient } from '@supabase/supabase-js';

export type DdAnswerRow = {
  question_key: string;
  answer_text: string | null;
  answer_value: number | null;
  answer_boolean: boolean | null;
  answer_json: unknown;
};

export type DdSectionRow = {
  section_key: string;
  status: string;
  vc_dd_answers?: DdAnswerRow[];
};

export type QuestionnaireBundle = {
  id: string;
  status: string | null;
  sections: DdSectionRow[];
  investment_professionals: unknown[];
  pipeline_companies: unknown[];
  secured_investors: unknown[];
  potential_investors: unknown[];
  legal_documents: unknown[];
  investment_instruments: unknown[];
  investment_rounds: unknown[];
  sector_allocations: unknown[];
  geographic_allocations: unknown[];
  coinvestors: unknown[];
};

export const EMPTY_QUESTIONNAIRE_BUNDLE: QuestionnaireBundle = {
  id: '',
  status: null,
  sections: [],
  investment_professionals: [],
  pipeline_companies: [],
  secured_investors: [],
  potential_investors: [],
  legal_documents: [],
  investment_instruments: [],
  investment_rounds: [],
  sector_allocations: [],
  geographic_allocations: [],
  coinvestors: [],
};

export async function loadQuestionnaireBundle(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<QuestionnaireBundle | null> {
  const { data: q, error } = await supabase
    .from('vc_dd_questionnaires')
    .select(
      `
      id,
      status,
      vc_dd_sections (
        section_key,
        status,
        vc_dd_answers (
          question_key,
          answer_text,
          answer_value,
          answer_boolean,
          answer_json
        )
      )
    `,
    )
    .eq('id', questionnaireId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !q) return null;

  const base = q as {
    id: string;
    status: string | null;
    vc_dd_sections?: DdSectionRow[];
  };

  const [
    pros,
    pipes,
    secured,
    potential,
    legal,
    instruments,
    rounds,
    sectors,
    geos,
    coinv,
  ] = await Promise.all([
    supabase.from('vc_dd_investment_professionals').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_pipeline_companies').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_secured_investors').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_potential_investors').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_legal_documents').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_investment_instruments').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_investment_rounds').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_sector_allocations').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_geographic_allocations').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
    supabase.from('vc_dd_coinvestors').select('*').eq('tenant_id', tenantId).eq('questionnaire_id', questionnaireId),
  ]);

  const sections = Array.isArray(base.vc_dd_sections) ? base.vc_dd_sections : [];

  return {
    id: base.id,
    status: base.status,
    sections: sections.map((s) => ({
      ...s,
      vc_dd_answers: Array.isArray(s.vc_dd_answers) ? s.vc_dd_answers : [],
    })),
    investment_professionals: pros.data ?? [],
    pipeline_companies: pipes.data ?? [],
    secured_investors: secured.data ?? [],
    potential_investors: potential.data ?? [],
    legal_documents: legal.data ?? [],
    investment_instruments: instruments.data ?? [],
    investment_rounds: rounds.data ?? [],
    sector_allocations: sectors.data ?? [],
    geographic_allocations: geos.data ?? [],
    coinvestors: coinv.data ?? [],
  };
}
