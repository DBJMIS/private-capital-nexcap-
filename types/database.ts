/**
 * Supabase-generated database types (scaffold).
 *
 * Regenerate with the Supabase CLI after schema changes, e.g.:
 *   npx supabase gen types typescript --project-id <ref> > types/database.ts
 *
 * File path: types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Matches `public.cfp_status` (Epic 2). */
export type CfpStatus = 'draft' | 'active' | 'closed' | 'archived';

/** Matches `public.panel_member_type` (Epic 2). */
export type PanelMemberType = 'voting' | 'observer';

/** Matches `public.dd_recommendation` (Epic 2). */
export type DdRecommendation = 'full_dd' | 'conditional_dd' | 'no_dd';

export type Database = {
  public: {
    Tables: {
      vc_tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_profiles: {
        Row: {
          id: string;
          user_id: string;
          tenant_id: string;
          full_name: string;
          email: string;
          role: string;
          department: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tenant_id: string;
          full_name: string;
          email: string;
          role: string;
          department?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tenant_id?: string;
          full_name?: string;
          email?: string;
          role?: string;
          department?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_fund_applications: {
        Row: {
          id: string;
          tenant_id: string;
          fund_name: string;
          manager_name: string;
          country_of_incorporation: string;
          geographic_area: string;
          total_capital_commitment_usd: number;
          status: string;
          submitted_at: string | null;
          deleted_at: string | null;
          rejection_reason: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          onboarding_metadata: Json;
          pipeline_metadata: Json;
          cfp_id: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_name: string;
          manager_name: string;
          country_of_incorporation: string;
          geographic_area: string;
          total_capital_commitment_usd: number;
          status?: string;
          submitted_at?: string | null;
          deleted_at?: string | null;
          rejection_reason?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          onboarding_metadata?: Json;
          pipeline_metadata?: Json;
          cfp_id?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_name?: string;
          manager_name?: string;
          country_of_incorporation?: string;
          geographic_area?: string;
          total_capital_commitment_usd?: number;
          status?: string;
          submitted_at?: string | null;
          deleted_at?: string | null;
          rejection_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          onboarding_metadata?: Json;
          cfp_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['cfp_id'];
            isOneToOne: false;
            referencedRelation: 'vc_cfps';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_cfps: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          description: string | null;
          opening_date: string;
          closing_date: string;
          status: CfpStatus;
          investment_criteria: Json;
          timeline_milestones: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          description?: string | null;
          opening_date: string;
          closing_date: string;
          status?: CfpStatus;
          investment_criteria?: Json;
          timeline_milestones?: Json;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          title?: string;
          description?: string | null;
          opening_date?: string;
          closing_date?: string;
          status?: CfpStatus;
          investment_criteria?: Json;
          timeline_milestones?: Json;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_panel_members: {
        Row: {
          id: string;
          tenant_id: string;
          cfp_id: string;
          investor_id: string | null;
          member_name: string;
          member_organisation: string | null;
          member_email: string | null;
          member_type: PanelMemberType;
          nda_signed: boolean;
          nda_signed_date: string | null;
          is_fund_manager: boolean;
          excluded_application_ids: string[];
          invited_at: string | null;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          cfp_id: string;
          investor_id?: string | null;
          member_name: string;
          member_organisation?: string | null;
          member_email?: string | null;
          member_type?: PanelMemberType;
          nda_signed?: boolean;
          nda_signed_date?: string | null;
          is_fund_manager?: boolean;
          excluded_application_ids?: string[];
          invited_at?: string | null;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          cfp_id?: string;
          investor_id?: string | null;
          member_name?: string;
          member_organisation?: string | null;
          member_email?: string | null;
          member_type?: PanelMemberType;
          nda_signed?: boolean;
          nda_signed_date?: string | null;
          is_fund_manager?: boolean;
          excluded_application_ids?: string[];
          invited_at?: string | null;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['cfp_id'];
            isOneToOne: false;
            referencedRelation: 'vc_cfps';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_presentations: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string;
          cfp_id: string;
          scheduled_date: string | null;
          actual_date: string | null;
          status: string;
          recording_url: string | null;
          presentation_file_path: string | null;
          attendees: Json;
          notes: string | null;
          presentation_type: string;
          location: string | null;
          teams_meeting_id: string | null;
          teams_join_url: string | null;
          teams_recording_url: string | null;
          auto_completed: boolean;
          invite_sent: boolean;
          invite_sent_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id: string;
          cfp_id: string;
          scheduled_date?: string | null;
          actual_date?: string | null;
          status?: string;
          recording_url?: string | null;
          presentation_file_path?: string | null;
          attendees?: Json;
          notes?: string | null;
          presentation_type?: string;
          location?: string | null;
          teams_meeting_id?: string | null;
          teams_join_url?: string | null;
          teams_recording_url?: string | null;
          auto_completed?: boolean;
          invite_sent?: boolean;
          invite_sent_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string;
          cfp_id?: string;
          scheduled_date?: string | null;
          actual_date?: string | null;
          status?: string;
          recording_url?: string | null;
          presentation_file_path?: string | null;
          attendees?: Json;
          notes?: string | null;
          presentation_type?: string;
          location?: string | null;
          teams_meeting_id?: string | null;
          teams_join_url?: string | null;
          teams_recording_url?: string | null;
          auto_completed?: boolean;
          invite_sent?: boolean;
          invite_sent_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'vc_fund_applications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['cfp_id'];
            isOneToOne: false;
            referencedRelation: 'vc_cfps';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_panel_evaluations: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string;
          cfp_id: string;
          panel_member_id: string;
          status: string;
          dd_vote: DdRecommendation | null;
          conditions: string | null;
          general_notes: string | null;
          submitted_at: string | null;
          ai_recommendation: Json | null;
          ai_recommended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id: string;
          cfp_id: string;
          panel_member_id: string;
          status?: string;
          dd_vote?: DdRecommendation | null;
          conditions?: string | null;
          general_notes?: string | null;
          submitted_at?: string | null;
          ai_recommendation?: Json | null;
          ai_recommended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string;
          cfp_id?: string;
          panel_member_id?: string;
          status?: string;
          dd_vote?: DdRecommendation | null;
          conditions?: string | null;
          general_notes?: string | null;
          submitted_at?: string | null;
          ai_recommendation?: Json | null;
          ai_recommended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'vc_fund_applications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['cfp_id'];
            isOneToOne: false;
            referencedRelation: 'vc_cfps';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['panel_member_id'];
            isOneToOne: false;
            referencedRelation: 'vc_panel_members';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_panel_evaluation_scores: {
        Row: {
          id: string;
          tenant_id: string;
          evaluation_id: string;
          category: string;
          criterion_key: string;
          rating: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          evaluation_id: string;
          category: string;
          criterion_key: string;
          rating?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          evaluation_id?: string;
          category?: string;
          criterion_key?: string;
          rating?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['evaluation_id'];
            isOneToOne: false;
            referencedRelation: 'vc_panel_evaluations';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_dd_decisions: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string;
          ai_recommendation: Json | null;
          ai_recommended_at: string | null;
          ai_weighted_score: number | null;
          strong_points: string | null;
          weak_points: string | null;
          conditions: string | null;
          rejection_reason: string | null;
          final_decision: string | null;
          decision_overrides_ai: boolean;
          decided_by: string | null;
          decider_name: string | null;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id: string;
          ai_recommendation?: Json | null;
          ai_recommended_at?: string | null;
          ai_weighted_score?: number | null;
          strong_points?: string | null;
          weak_points?: string | null;
          conditions?: string | null;
          rejection_reason?: string | null;
          final_decision?: string | null;
          decision_overrides_ai?: boolean;
          decided_by?: string | null;
          decider_name?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string;
          ai_recommendation?: Json | null;
          ai_recommended_at?: string | null;
          ai_weighted_score?: number | null;
          strong_points?: string | null;
          weak_points?: string | null;
          conditions?: string | null;
          rejection_reason?: string | null;
          final_decision?: string | null;
          decision_overrides_ai?: boolean;
          decided_by?: string | null;
          decider_name?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['application_id'];
            isOneToOne: true;
            referencedRelation: 'vc_fund_applications';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_site_visits: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string;
          scheduled_date: string | null;
          actual_date: string | null;
          status: string;
          location: string | null;
          dbj_attendees: Json;
          outcome: string | null;
          outcome_notes: string | null;
          legal_docs_reviewed: boolean;
          legal_docs_notes: string | null;
          report_file_path: string | null;
          report_file_name: string | null;
          notes: string | null;
          conducted_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id: string;
          scheduled_date?: string | null;
          actual_date?: string | null;
          status?: string;
          location?: string | null;
          dbj_attendees?: Json;
          outcome?: string | null;
          outcome_notes?: string | null;
          legal_docs_reviewed?: boolean;
          legal_docs_notes?: string | null;
          report_file_path?: string | null;
          report_file_name?: string | null;
          notes?: string | null;
          conducted_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string;
          scheduled_date?: string | null;
          actual_date?: string | null;
          status?: string;
          location?: string | null;
          dbj_attendees?: Json;
          outcome?: string | null;
          outcome_notes?: string | null;
          legal_docs_reviewed?: boolean;
          legal_docs_notes?: string | null;
          report_file_path?: string | null;
          report_file_name?: string | null;
          notes?: string | null;
          conducted_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'vc_fund_applications';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_contracts: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string;
          contract_type: string;
          status: string;
          commitment_amount: number | null;
          commitment_currency: string;
          dbj_pro_rata_pct: number | null;
          management_fee_pct: number | null;
          carried_interest_pct: number | null;
          hurdle_rate_pct: number | null;
          fund_life_years: number | null;
          investment_period_years: number | null;
          legal_review_started_at: string | null;
          legal_review_completed_at: string | null;
          legal_reviewer_notes: string | null;
          adobe_sign_agreement_id: string | null;
          adobe_sign_status: string | null;
          signed_at: string | null;
          signed_by_dbj: string | null;
          signed_by_fund_manager: string | null;
          contract_file_path: string | null;
          contract_file_name: string | null;
          negotiation_rounds: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id: string;
          contract_type?: string;
          status?: string;
          commitment_amount?: number | null;
          commitment_currency?: string;
          dbj_pro_rata_pct?: number | null;
          management_fee_pct?: number | null;
          carried_interest_pct?: number | null;
          hurdle_rate_pct?: number | null;
          fund_life_years?: number | null;
          investment_period_years?: number | null;
          legal_review_started_at?: string | null;
          legal_review_completed_at?: string | null;
          legal_reviewer_notes?: string | null;
          adobe_sign_agreement_id?: string | null;
          adobe_sign_status?: string | null;
          signed_at?: string | null;
          signed_by_dbj?: string | null;
          signed_by_fund_manager?: string | null;
          contract_file_path?: string | null;
          contract_file_name?: string | null;
          negotiation_rounds?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string;
          contract_type?: string;
          status?: string;
          commitment_amount?: number | null;
          commitment_currency?: string;
          dbj_pro_rata_pct?: number | null;
          management_fee_pct?: number | null;
          carried_interest_pct?: number | null;
          hurdle_rate_pct?: number | null;
          fund_life_years?: number | null;
          investment_period_years?: number | null;
          legal_review_started_at?: string | null;
          legal_review_completed_at?: string | null;
          legal_reviewer_notes?: string | null;
          adobe_sign_agreement_id?: string | null;
          adobe_sign_status?: string | null;
          signed_at?: string | null;
          signed_by_dbj?: string | null;
          signed_by_fund_manager?: string | null;
          contract_file_path?: string | null;
          contract_file_name?: string | null;
          negotiation_rounds?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'vc_fund_applications';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_commitments: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string;
          contract_id: string | null;
          fund_name: string;
          manager_name: string;
          fund_representative: string | null;
          commitment_amount: number;
          commitment_currency: string;
          dbj_pro_rata_pct: number;
          fund_year_end_month: number | null;
          listed: boolean;
          quarterly_report_due_days: number;
          audit_report_due_days: number;
          status: string;
          committed_at: string;
          first_drawdown_date: string | null;
          fund_close_date: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id: string;
          contract_id?: string | null;
          fund_name: string;
          manager_name: string;
          fund_representative?: string | null;
          commitment_amount: number;
          commitment_currency?: string;
          dbj_pro_rata_pct: number;
          fund_year_end_month?: number | null;
          listed?: boolean;
          quarterly_report_due_days?: number;
          audit_report_due_days?: number;
          status?: string;
          committed_at?: string;
          first_drawdown_date?: string | null;
          fund_close_date?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string;
          contract_id?: string | null;
          fund_name?: string;
          manager_name?: string;
          fund_representative?: string | null;
          commitment_amount?: number;
          commitment_currency?: string;
          dbj_pro_rata_pct?: number;
          fund_year_end_month?: number | null;
          listed?: boolean;
          quarterly_report_due_days?: number;
          audit_report_due_days?: number;
          status?: string;
          committed_at?: string;
          first_drawdown_date?: string | null;
          fund_close_date?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'vc_tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: string;
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'vc_fund_applications';
            referencedColumns: ['id'];
          },
        ];
      };
      vc_portfolio_funds: {
        Row: {
          id: string;
          tenant_id: string;
          application_id: string | null;
          commitment_id: string | null;
          fund_name: string;
          manager_name: string;
          fund_manager_id: string | null;
          fund_representative: string | null;
          manager_email: string | null;
          manager_phone: string | null;
          currency: string;
          total_fund_commitment: number;
          dbj_commitment: number;
          dbj_pro_rata_pct: number;
          listed: boolean;
          fund_status: string;
          year_end_month: number;
          quarterly_report_due_days: number;
          audit_report_due_days: number;
          requires_quarterly_financial: boolean;
          requires_quarterly_inv_mgmt: boolean;
          requires_audited_annual: boolean;
          requires_inhouse_quarterly: boolean;
          report_months: number[];
          audit_month: number;
          exchange_rate_jmd_usd: number | null;
          commitment_date: string;
          fund_close_date: string | null;
          fund_life_years: number | null;
          investment_period_years: number | null;
          contacts: Json;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          fund_category: string | null;
          fund_end_date: string | null;
          is_pvc: boolean;
          management_fee_pct: number | null;
          performance_fee_pct: number | null;
          hurdle_rate_pct: number | null;
          target_irr_pct: number | null;
          sector_focus: string[] | null;
          impact_objectives: number[] | null;
          pctu_profile: Json | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          application_id?: string | null;
          commitment_id?: string | null;
          fund_name: string;
          manager_name: string;
          fund_manager_id?: string | null;
          fund_representative?: string | null;
          manager_email?: string | null;
          manager_phone?: string | null;
          currency?: string;
          total_fund_commitment: number;
          dbj_commitment: number;
          dbj_pro_rata_pct: number;
          listed?: boolean;
          fund_status?: string;
          year_end_month: number;
          quarterly_report_due_days?: number;
          audit_report_due_days?: number;
          requires_quarterly_financial?: boolean;
          requires_quarterly_inv_mgmt?: boolean;
          requires_audited_annual?: boolean;
          requires_inhouse_quarterly?: boolean;
          report_months?: number[];
          audit_month?: number;
          exchange_rate_jmd_usd?: number | null;
          commitment_date: string;
          fund_close_date?: string | null;
          fund_life_years?: number | null;
          investment_period_years?: number | null;
          contacts?: Json;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          fund_category?: string | null;
          fund_end_date?: string | null;
          is_pvc?: boolean;
          management_fee_pct?: number | null;
          performance_fee_pct?: number | null;
          hurdle_rate_pct?: number | null;
          target_irr_pct?: number | null;
          sector_focus?: string[] | null;
          impact_objectives?: number[] | null;
          pctu_profile?: Json | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          application_id?: string | null;
          commitment_id?: string | null;
          fund_name?: string;
          manager_name?: string;
          fund_manager_id?: string | null;
          fund_representative?: string | null;
          manager_email?: string | null;
          manager_phone?: string | null;
          currency?: string;
          total_fund_commitment?: number;
          dbj_commitment?: number;
          dbj_pro_rata_pct?: number;
          listed?: boolean;
          fund_status?: string;
          year_end_month?: number;
          quarterly_report_due_days?: number;
          audit_report_due_days?: number;
          requires_quarterly_financial?: boolean;
          requires_quarterly_inv_mgmt?: boolean;
          requires_audited_annual?: boolean;
          requires_inhouse_quarterly?: boolean;
          report_months?: number[];
          audit_month?: number;
          exchange_rate_jmd_usd?: number | null;
          commitment_date?: string;
          fund_close_date?: string | null;
          fund_life_years?: number | null;
          investment_period_years?: number | null;
          contacts?: Json;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          fund_category?: string | null;
          fund_end_date?: string | null;
          is_pvc?: boolean;
          management_fee_pct?: number | null;
          performance_fee_pct?: number | null;
          hurdle_rate_pct?: number | null;
          target_irr_pct?: number | null;
          sector_focus?: string[] | null;
          impact_objectives?: number[] | null;
          pctu_profile?: Json | null;
        };
        Relationships: [];
      };
      vc_reporting_obligations: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          report_type: string;
          period_year: number;
          period_month: number;
          period_label: string;
          due_date: string;
          status: string;
          submitted_date: string | null;
          submitted_by: string | null;
          reviewed_date: string | null;
          reviewed_by: string | null;
          review_notes: string | null;
          document_path: string | null;
          document_name: string | null;
          document_size_bytes: number | null;
          snapshot_extracted: boolean;
          snapshot_id: string | null;
          days_overdue: number;
          reminder_sent_at: string | null;
          reminder_sent_to: string | null;
          escalated_at: string | null;
          escalated_to: string | null;
          escalation_level: string | null;
          actioned_by: string | null;
          actioned_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          report_type: string;
          period_year: number;
          period_month: number;
          period_label: string;
          due_date: string;
          status?: string;
          submitted_date?: string | null;
          submitted_by?: string | null;
          reviewed_date?: string | null;
          reviewed_by?: string | null;
          review_notes?: string | null;
          document_path?: string | null;
          document_name?: string | null;
          document_size_bytes?: number | null;
          snapshot_extracted?: boolean;
          snapshot_id?: string | null;
          days_overdue?: number;
          reminder_sent_at?: string | null;
          reminder_sent_to?: string | null;
          escalated_at?: string | null;
          escalated_to?: string | null;
          escalation_level?: string | null;
          actioned_by?: string | null;
          actioned_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          report_type?: string;
          period_year?: number;
          period_month?: number;
          period_label?: string;
          due_date?: string;
          status?: string;
          submitted_date?: string | null;
          submitted_by?: string | null;
          reviewed_date?: string | null;
          reviewed_by?: string | null;
          review_notes?: string | null;
          document_path?: string | null;
          document_name?: string | null;
          document_size_bytes?: number | null;
          snapshot_extracted?: boolean;
          snapshot_id?: string | null;
          days_overdue?: number;
          reminder_sent_at?: string | null;
          reminder_sent_to?: string | null;
          escalated_at?: string | null;
          escalated_to?: string | null;
          escalation_level?: string | null;
          actioned_by?: string | null;
          actioned_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_compliance_actions: {
        Row: {
          id: string;
          tenant_id: string;
          obligation_id: string;
          fund_id: string;
          action_type: string;
          actor_id: string | null;
          actor_name: string | null;
          from_status: string | null;
          to_status: string | null;
          notes: string | null;
          recipient: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          obligation_id: string;
          fund_id: string;
          action_type: string;
          actor_id?: string | null;
          actor_name?: string | null;
          from_status?: string | null;
          to_status?: string | null;
          notes?: string | null;
          recipient?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          obligation_id?: string;
          fund_id?: string;
          action_type?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          from_status?: string | null;
          to_status?: string | null;
          notes?: string | null;
          recipient?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      vc_capital_calls: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          notice_number: number;
          date_of_notice: string;
          due_date: string | null;
          date_paid: string | null;
          call_amount: number;
          currency: string;
          total_called_to_date: number | null;
          remaining_commitment: number | null;
          status: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          notice_number: number;
          date_of_notice: string;
          due_date?: string | null;
          date_paid?: string | null;
          call_amount: number;
          currency: string;
          total_called_to_date?: number | null;
          remaining_commitment?: number | null;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          notice_number?: number;
          date_of_notice?: string;
          due_date?: string | null;
          date_paid?: string | null;
          call_amount?: number;
          currency?: string;
          total_called_to_date?: number | null;
          remaining_commitment?: number | null;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_capital_call_items: {
        Row: {
          id: string;
          tenant_id: string;
          capital_call_id: string;
          purpose_category: string;
          investee_company: string | null;
          description: string | null;
          amount: number;
          currency: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          capital_call_id: string;
          purpose_category: string;
          investee_company?: string | null;
          description?: string | null;
          amount: number;
          currency: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          capital_call_id?: string;
          purpose_category?: string;
          investee_company?: string | null;
          description?: string | null;
          amount?: number;
          currency?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_fund_snapshots: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          period_year: number;
          period_quarter: number;
          snapshot_date: string;
          nav: number;
          committed_capital: number | null;
          distributions_in_period: number | null;
          reported_irr: number | null;
          investor_remark: string | null;
          source_obligation_id: string | null;
          extraction_confidence: Json | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          period_year: number;
          period_quarter: number;
          snapshot_date: string;
          nav: number;
          committed_capital?: number | null;
          distributions_in_period?: number | null;
          reported_irr?: number | null;
          investor_remark?: string | null;
          source_obligation_id?: string | null;
          extraction_confidence?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          period_year?: number;
          period_quarter?: number;
          snapshot_date?: string;
          nav?: number;
          committed_capital?: number | null;
          distributions_in_period?: number | null;
          reported_irr?: number | null;
          investor_remark?: string | null;
          source_obligation_id?: string | null;
          extraction_confidence?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_fund_narrative_extracts: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          source_obligation_id: string | null;
          period_year: number | null;
          period_quarter: number | null;
          extracted_at: string;
          extraction_confidence: Json | null;
          fundraising_update: string | null;
          pipeline_development: string | null;
          team_update: string | null;
          compliance_update: string | null;
          impact_update: string | null;
          risk_assessment: string | null;
          outlook: string | null;
          indicators: Json | null;
          source_snippets: Json | null;
          fund_profile: Json | null;
          allocations: Json | null;
          fund_lps: Json | null;
          pipeline_stats: Json | null;
          capital_account_detail: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          source_obligation_id?: string | null;
          period_year?: number | null;
          period_quarter?: number | null;
          extracted_at?: string;
          extraction_confidence?: Json | null;
          fundraising_update?: string | null;
          pipeline_development?: string | null;
          team_update?: string | null;
          compliance_update?: string | null;
          impact_update?: string | null;
          risk_assessment?: string | null;
          outlook?: string | null;
          indicators?: Json | null;
          source_snippets?: Json | null;
          fund_profile?: Json | null;
          allocations?: Json | null;
          fund_lps?: Json | null;
          pipeline_stats?: Json | null;
          capital_account_detail?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          source_obligation_id?: string | null;
          period_year?: number | null;
          period_quarter?: number | null;
          extracted_at?: string;
          extraction_confidence?: Json | null;
          fundraising_update?: string | null;
          pipeline_development?: string | null;
          team_update?: string | null;
          compliance_update?: string | null;
          impact_update?: string | null;
          risk_assessment?: string | null;
          outlook?: string | null;
          indicators?: Json | null;
          source_snippets?: Json | null;
          fund_profile?: Json | null;
          allocations?: Json | null;
          fund_lps?: Json | null;
          pipeline_stats?: Json | null;
          capital_account_detail?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_assessment_config: {
        Row: {
          id: string;
          tenant_id: string;
          weight_financial_performance: number;
          weight_development_impact: number;
          weight_fund_management: number;
          weight_compliance_governance: number;
          weight_portfolio_health: number;
          lifecycle_early_financial_adj: number;
          lifecycle_early_management_adj: number;
          lifecycle_late_financial_adj: number;
          lifecycle_late_impact_adj: number;
          threshold_strong: number;
          threshold_adequate: number;
          threshold_watchlist: number;
          watchlist_escalation_quarters: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          weight_financial_performance?: number;
          weight_development_impact?: number;
          weight_fund_management?: number;
          weight_compliance_governance?: number;
          weight_portfolio_health?: number;
          lifecycle_early_financial_adj?: number;
          lifecycle_early_management_adj?: number;
          lifecycle_late_financial_adj?: number;
          lifecycle_late_impact_adj?: number;
          threshold_strong?: number;
          threshold_adequate?: number;
          threshold_watchlist?: number;
          watchlist_escalation_quarters?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          weight_financial_performance?: number;
          weight_development_impact?: number;
          weight_fund_management?: number;
          weight_compliance_governance?: number;
          weight_portfolio_health?: number;
          lifecycle_early_financial_adj?: number;
          lifecycle_early_management_adj?: number;
          lifecycle_late_financial_adj?: number;
          lifecycle_late_impact_adj?: number;
          threshold_strong?: number;
          threshold_adequate?: number;
          threshold_watchlist?: number;
          watchlist_escalation_quarters?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_quarterly_assessments: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          assessment_date: string;
          assessment_period: string;
          fund_lifecycle_stage: string;
          investment_stage: string | null;
          financial_performance_score: number | null;
          development_impact_score: number | null;
          fund_management_score: number | null;
          compliance_governance_score: number | null;
          portfolio_health_score: number | null;
          weighted_total_score: number | null;
          category: string | null;
          divestment_recommendation: string | null;
          contractual_obligation: boolean;
          recommendation_override_reason: string | null;
          dimension_reasoning: Json | null;
          dimension_overrides: Json | null;
          source_snippets: Json | null;
          narrative_extract_id: string | null;
          dd_assessment_id: string | null;
          dd_outcome_at_commitment: string | null;
          financial_commentary: string | null;
          impact_commentary: string | null;
          management_commentary: string | null;
          compliance_commentary: string | null;
          portfolio_commentary: string | null;
          overall_summary: string | null;
          ai_summary: string | null;
          ai_generated_at: string | null;
          status: string;
          assessed_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          assessment_date: string;
          assessment_period: string;
          fund_lifecycle_stage: string;
          investment_stage?: string | null;
          financial_performance_score?: number | null;
          development_impact_score?: number | null;
          fund_management_score?: number | null;
          compliance_governance_score?: number | null;
          portfolio_health_score?: number | null;
          weighted_total_score?: number | null;
          category?: string | null;
          divestment_recommendation?: string | null;
          contractual_obligation?: boolean;
          recommendation_override_reason?: string | null;
          dimension_reasoning?: Json | null;
          dimension_overrides?: Json | null;
          source_snippets?: Json | null;
          narrative_extract_id?: string | null;
          dd_assessment_id?: string | null;
          dd_outcome_at_commitment?: string | null;
          financial_commentary?: string | null;
          impact_commentary?: string | null;
          management_commentary?: string | null;
          compliance_commentary?: string | null;
          portfolio_commentary?: string | null;
          overall_summary?: string | null;
          ai_summary?: string | null;
          ai_generated_at?: string | null;
          status?: string;
          assessed_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          assessment_date?: string;
          assessment_period?: string;
          fund_lifecycle_stage?: string;
          investment_stage?: string | null;
          financial_performance_score?: number | null;
          development_impact_score?: number | null;
          fund_management_score?: number | null;
          compliance_governance_score?: number | null;
          portfolio_health_score?: number | null;
          weighted_total_score?: number | null;
          category?: string | null;
          divestment_recommendation?: string | null;
          contractual_obligation?: boolean;
          recommendation_override_reason?: string | null;
          dimension_reasoning?: Json | null;
          dimension_overrides?: Json | null;
          source_snippets?: Json | null;
          narrative_extract_id?: string | null;
          dd_assessment_id?: string | null;
          dd_outcome_at_commitment?: string | null;
          financial_commentary?: string | null;
          impact_commentary?: string | null;
          management_commentary?: string | null;
          compliance_commentary?: string | null;
          portfolio_commentary?: string | null;
          overall_summary?: string | null;
          ai_summary?: string | null;
          ai_generated_at?: string | null;
          status?: string;
          assessed_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_watchlist: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          placed_on_watchlist: string;
          consecutive_quarters: number;
          last_assessment_id: string | null;
          escalated: boolean;
          escalated_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          placed_on_watchlist: string;
          consecutive_quarters?: number;
          last_assessment_id?: string | null;
          escalated?: boolean;
          escalated_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          placed_on_watchlist?: string;
          consecutive_quarters?: number;
          last_assessment_id?: string | null;
          escalated?: boolean;
          escalated_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      benchmark_indices: {
        Row: {
          id: string;
          index_name: string;
          vintage_year: number;
          asset_class: string;
          geography: string;
          median_irr: number;
          top_quartile_irr: number;
          median_moic: number;
          top_quartile_moic: number;
          source: string;
          as_of_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          index_name: string;
          vintage_year: number;
          asset_class: string;
          geography: string;
          median_irr: number;
          top_quartile_irr: number;
          median_moic: number;
          top_quartile_moic: number;
          source: string;
          as_of_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          index_name?: string;
          vintage_year?: number;
          asset_class?: string;
          geography?: string;
          median_irr?: number;
          top_quartile_irr?: number;
          median_moic?: number;
          top_quartile_moic?: number;
          source?: string;
          as_of_date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      fund_managers: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          firm_name: string;
          email: string | null;
          phone: string | null;
          linkedin_url: string | null;
          first_contact_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          firm_name: string;
          email?: string | null;
          phone?: string | null;
          linkedin_url?: string | null;
          first_contact_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          firm_name?: string;
          email?: string | null;
          phone?: string | null;
          linkedin_url?: string | null;
          first_contact_date?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      fund_manager_notes: {
        Row: {
          id: string;
          tenant_id: string;
          fund_manager_id: string;
          note: string;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_manager_id: string;
          note: string;
          added_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_manager_id?: string;
          note?: string;
          added_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_relationship_profiles: {
        Row: {
          id: string;
          tenant_id: string;
          fund_manager_id: string;
          profile: Json;
          generated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_manager_id: string;
          profile: Json;
          generated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_manager_id?: string;
          profile?: Json;
          generated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      ai_followup_questions: {
        Row: {
          id: string;
          assessment_id: string;
          fund_id: string | null;
          section_key: string;
          section_label: string;
          section_score: number | null;
          section_max_score: number | null;
          question: string;
          rationale: string | null;
          used: boolean;
          used_at: string | null;
          used_by: string | null;
          generated_at: string;
          generation_version: number;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          fund_id?: string | null;
          section_key: string;
          section_label: string;
          section_score?: number | null;
          section_max_score?: number | null;
          question: string;
          rationale?: string | null;
          used?: boolean;
          used_at?: string | null;
          used_by?: string | null;
          generated_at?: string;
          generation_version?: number;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          fund_id?: string | null;
          section_key?: string;
          section_label?: string;
          section_score?: number | null;
          section_max_score?: number | null;
          question?: string;
          rationale?: string | null;
          used?: boolean;
          used_at?: string | null;
          used_by?: string | null;
          generated_at?: string;
          generation_version?: number;
        };
        Relationships: [];
      };
      ai_benchmark_narratives: {
        Row: {
          id: string;
          scope: string;
          fund_id: string | null;
          narrative: string;
          headline_stats: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          scope: string;
          fund_id?: string | null;
          narrative: string;
          headline_stats?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          scope?: string;
          fund_id?: string | null;
          narrative?: string;
          headline_stats?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      vc_distributions: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          distribution_number: number;
          distribution_date: string;
          return_type: string;
          amount: number;
          currency: string;
          units: number | null;
          per_unit_amount: number | null;
          cumulative_total: number | null;
          source_company: string | null;
          notes: string | null;
          reference_number: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          distribution_number: number;
          distribution_date: string;
          return_type: string;
          amount: number;
          currency: string;
          units?: number | null;
          per_unit_amount?: number | null;
          cumulative_total?: number | null;
          source_company?: string | null;
          notes?: string | null;
          reference_number?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          distribution_number?: number;
          distribution_date?: string;
          return_type?: string;
          amount?: number;
          currency?: string;
          units?: number | null;
          per_unit_amount?: number | null;
          cumulative_total?: number | null;
          source_company?: string | null;
          notes?: string | null;
          reference_number?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_divestments: {
        Row: {
          id: string;
          tenant_id: string;
          fund_id: string;
          company_name: string;
          divestment_type: string;
          announcement_date: string | null;
          completion_date: string;
          original_investment_amount: number;
          proceeds_received: number;
          currency: string;
          multiple_on_invested_capital: number | null;
          is_full_exit: boolean;
          remaining_stake_pct: number | null;
          exit_route: string | null;
          notes: string | null;
          buyer_name: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          fund_id: string;
          company_name: string;
          divestment_type: string;
          announcement_date?: string | null;
          completion_date: string;
          original_investment_amount: number;
          proceeds_received: number;
          currency: string;
          is_full_exit?: boolean;
          remaining_stake_pct?: number | null;
          exit_route?: string | null;
          notes?: string | null;
          buyer_name?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          fund_id?: string;
          company_name?: string;
          divestment_type?: string;
          announcement_date?: string | null;
          completion_date?: string;
          original_investment_amount?: number;
          proceeds_received?: number;
          currency?: string;
          is_full_exit?: boolean;
          remaining_stake_pct?: number | null;
          exit_route?: string | null;
          notes?: string | null;
          buyer_name?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_user_roles: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string;
          role: string;
          assigned_at: string;
          assigned_by: string | null;
          is_active: boolean;
          deactivated_at: string | null;
          deactivated_by: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          profile_id: string;
          role: string;
          assigned_at?: string;
          assigned_by?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          profile_id?: string;
          role?: string;
          assigned_at?: string;
          assigned_by?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
        };
        Relationships: [];
      };
      vc_invitations: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          role: string;
          token: string;
          token_expires_at: string;
          status: string;
          invited_by: string | null;
          personal_note: string | null;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          full_name: string;
          role: string;
          token: string;
          token_expires_at: string;
          status?: string;
          invited_by?: string | null;
          personal_note?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string;
          full_name?: string;
          role?: string;
          token?: string;
          token_expires_at?: string;
          status?: string;
          invited_by?: string | null;
          personal_note?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: unknown[] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      fund_application_status:
        | 'draft'
        | 'submitted'
        | 'pre_screening'
        | 'due_diligence'
        | 'approved'
        | 'rejected'
        | 'pre_qualified'
        | 'preliminary_screening'
        | 'shortlisted'
        | 'presentation_scheduled'
        | 'presentation_complete'
        | 'panel_evaluation'
        | 'dd_recommended'
        | 'clarification_requested'
        | 'dd_complete'
        | 'site_visit'
        | 'negotiation'
        | 'contract_review'
        | 'contract_signed'
        | 'committed';
      cfp_status: CfpStatus;
      panel_member_type: PanelMemberType;
      dd_recommendation: DdRecommendation;
    };
    CompositeTypes: Record<string, { [key: string]: unknown }>;
  };
};

/** Row shape for `public.vc_cfps`. */
export type VcCfp = Database['public']['Tables']['vc_cfps']['Row'];

/** Row shape for `public.vc_panel_members`. */
export type VcPanelMember = Database['public']['Tables']['vc_panel_members']['Row'];

/** Row shape for `public.vc_presentations`. */
export type VcPresentation = Database['public']['Tables']['vc_presentations']['Row'];

/** Row shape for `public.vc_panel_evaluations`. */
export type VcPanelEvaluation = Database['public']['Tables']['vc_panel_evaluations']['Row'];

/** Row shape for `public.vc_panel_evaluation_scores`. */
export type VcPanelEvaluationScore = Database['public']['Tables']['vc_panel_evaluation_scores']['Row'];

/** Row shape for `public.vc_site_visits`. */
export type VcSiteVisit = Database['public']['Tables']['vc_site_visits']['Row'];

/** Row shape for `public.vc_contracts`. */
export type VcContract = Database['public']['Tables']['vc_contracts']['Row'];

/** Row shape for `public.vc_commitments`. */
export type VcCommitment = Database['public']['Tables']['vc_commitments']['Row'];

/** Row shape for `public.vc_portfolio_funds` (Epic 4). */
export type VcPortfolioFund = Database['public']['Tables']['vc_portfolio_funds']['Row'];

/** Row shape for `public.vc_reporting_obligations` (Epic 4). */
export type VcReportingObligation = Database['public']['Tables']['vc_reporting_obligations']['Row'];

/** Row shape for `public.vc_compliance_actions` (Epic 7). */
export type VcComplianceAction = Database['public']['Tables']['vc_compliance_actions']['Row'];

/** Row shape for `public.vc_capital_calls` (Epic 5). */
export type VcCapitalCall = Database['public']['Tables']['vc_capital_calls']['Row'];

/** Row shape for `public.vc_capital_call_items` (Epic 5). */
export type VcCapitalCallItem = Database['public']['Tables']['vc_capital_call_items']['Row'];

/** Row shape for `public.vc_distributions` (Epic 6). */
export type VcDistribution = Database['public']['Tables']['vc_distributions']['Row'];

/** Row shape for `public.vc_divestments`. */
export type VcDivestment = Database['public']['Tables']['vc_divestments']['Row'];

/** Row shape for `public.benchmark_indices`. */
export type BenchmarkIndexRow = Database['public']['Tables']['benchmark_indices']['Row'];

/** Row shape for `public.ai_benchmark_narratives`. */
export type AiBenchmarkNarrativeRow = Database['public']['Tables']['ai_benchmark_narratives']['Row'];

/** Row shape for `public.fund_managers`. */
export type FundManagerRow = Database['public']['Tables']['fund_managers']['Row'];

/** Row shape for `public.fund_manager_notes`. */
export type FundManagerNoteRow = Database['public']['Tables']['fund_manager_notes']['Row'];

/** Row shape for `public.ai_relationship_profiles`. */
export type AiRelationshipProfileRow = Database['public']['Tables']['ai_relationship_profiles']['Row'];

/** Row shape for `public.ai_followup_questions`. */
export type AiFollowupQuestionRow = Database['public']['Tables']['ai_followup_questions']['Row'];

/** Row shape for `public.vc_fund_snapshots` (Epic 12). */
export type VcFundSnapshot = Database['public']['Tables']['vc_fund_snapshots']['Row'];

/** Row shape for `public.vc_fund_narrative_extracts` (Epic 13 Stage 1). */
export type VcFundNarrativeExtract = Database['public']['Tables']['vc_fund_narrative_extracts']['Row'];

/** Row shape for `public.vc_assessment_config` (Epic 13). */
export type VcAssessmentConfig = Database['public']['Tables']['vc_assessment_config']['Row'];

/** Row shape for `public.vc_quarterly_assessments` (Epic 13). */
export type VcQuarterlyAssessment = Database['public']['Tables']['vc_quarterly_assessments']['Row'];

/** Row shape for `public.vc_watchlist` (Epic 13). */
export type VcWatchlistEntry = Database['public']['Tables']['vc_watchlist']['Row'];

/** Fund application row; `cfp_id` optional for callers that predate Epic 2 linkage. */
export interface VcFundApplication extends Omit<Database['public']['Tables']['vc_fund_applications']['Row'], 'cfp_id'> {
  cfp_id?: string | null;
}
