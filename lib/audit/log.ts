/**
 * Append-only audit logging (server-side). Never throws to callers.
 * File path: lib/audit/log.ts
 */

import 'server-only';

import { createServerClient } from '@/lib/supabase/server';
import type { AuditEntityType } from '@/lib/audit/types';
import type { Json } from '@/types/database';

export type AuditJson = Record<string, unknown> | null;

export type CreateAuditLogParams = {
  tenantId: string;
  actorId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  beforeState?: AuditJson;
  afterState?: AuditJson;
  metadata?: AuditJson;
  ipAddress?: string | null;
};

function toJsonb(value: AuditJson): Json | null {
  if (value == null) return null;
  return value as Json;
}

/**
 * Inserts one audit row. Swallows errors; logs to stderr only.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('vc_audit_logs').insert({
      tenant_id: params.tenantId,
      actor_id: params.actorId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      before_state: toJsonb(params.beforeState ?? null),
      after_state: toJsonb(params.afterState ?? null),
      metadata: toJsonb((params.metadata ?? {}) as AuditJson),
      ip_address: params.ipAddress?.trim() || null,
    });
    if (error) {
      console.error('[audit] insert failed:', error.message, params.entityType, params.action);
    }
  } catch (e) {
    console.error('[audit] unexpected error', e);
  }
}

/** Fire-and-forget: never await in request critical path. */
export function scheduleAuditLog(params: CreateAuditLogParams): void {
  void createAuditLog(params);
}

export function clientIpFromRequest(req: Request): string | null {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim().slice(0, 64);
  return null;
}
