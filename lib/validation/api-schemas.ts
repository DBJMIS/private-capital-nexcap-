/**
 * Zod schemas for API request bodies (high-risk mutations first).
 * File path: lib/validation/api-schemas.ts
 */

import { z } from 'zod';

import { DEAL_STAGES } from '@/lib/deals/transitions';

const instrumentEnum = z.enum(['equity', 'debt', 'convertible', 'mezzanine', 'grant', 'blended']);

const dealStageSchema = z.enum(DEAL_STAGES as unknown as [string, ...string[]]);

export const disbursementCreateBodySchema = z.object({
  amount_usd: z.number().finite().positive().max(1e12),
  disbursement_date: z.string().max(32).nullable().optional(),
  reference_number: z.string().max(256).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  assigned_approver_id: z.string().uuid().nullable().optional(),
});

export const approvalDecideBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decision_notes: z.string().min(1).max(16_000),
});

export const taskCreateBodySchema = z.object({
  entity_type: z.string().min(1).max(64),
  entity_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable().optional(),
  assigned_to: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().max(32).nullable().optional(),
});

export const dealStageTransitionBodySchema = z.object({
  to_stage: dealStageSchema,
  investment: z
    .object({
      approved_amount_usd: z.number().finite().positive().max(1e12),
      instrument_type: instrumentEnum,
      investment_date: z.string().max(32).nullable().optional(),
      maturity_date: z.string().max(32).nullable().optional(),
    })
    .optional(),
});
