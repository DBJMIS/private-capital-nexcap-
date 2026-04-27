import type { PctuProfile } from '@/lib/portfolio/pctu-report-types';
import type { Json } from '@/types/database';

export function defaultPctuProfile(): PctuProfile {
  return {
    business_registration: null,
    investment_type: null,
    principals: [],
    directors: [],
    investment_committee: { has_ic: false, structure_note: null, members: [] },
    management_team: [],
    esg_notes: [],
  };
}

/** Normalizes JSONB from DB into `PctuProfile` (client-safe). */
export function parsePctuProfile(raw: Json | null | undefined): PctuProfile {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultPctuProfile();
  }
  const o = raw as Record<string, unknown>;
  const icRaw = o.investment_committee;
  let investment_committee = defaultPctuProfile().investment_committee;
  if (icRaw && typeof icRaw === 'object' && !Array.isArray(icRaw)) {
    const ic = icRaw as Record<string, unknown>;
    investment_committee = {
      has_ic: typeof ic.has_ic === 'boolean' ? ic.has_ic : false,
      structure_note: typeof ic.structure_note === 'string' ? ic.structure_note : null,
      members: Array.isArray(ic.members)
        ? ic.members
            .filter((m): m is Record<string, unknown> => m != null && typeof m === 'object' && !Array.isArray(m))
            .map((m) => ({
              name: typeof m.name === 'string' ? m.name : '',
              role: typeof m.role === 'string' ? m.role : undefined,
            }))
            .filter((m) => m.name.length > 0)
        : [],
    };
  }
  return {
    business_registration: typeof o.business_registration === 'string' ? o.business_registration : null,
    investment_type: typeof o.investment_type === 'string' ? o.investment_type : null,
    principals: Array.isArray(o.principals)
      ? o.principals
          .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object' && !Array.isArray(p))
          .map((p) => ({
            name: typeof p.name === 'string' ? p.name : '',
            role: typeof p.role === 'string' ? p.role : undefined,
            departed_date: typeof p.departed_date === 'string' ? p.departed_date : p.departed_date === null ? null : undefined,
            notes: typeof p.notes === 'string' ? p.notes : undefined,
          }))
          .filter((p) => p.name.length > 0)
      : [],
    directors: Array.isArray(o.directors)
      ? o.directors
          .filter((d): d is Record<string, unknown> => d != null && typeof d === 'object' && !Array.isArray(d))
          .map((d) => (typeof d.name === 'string' ? d.name : ''))
          .filter((n) => n.length > 0)
          .map((name) => ({ name }))
      : [],
    investment_committee,
    management_team: Array.isArray(o.management_team)
      ? o.management_team
          .filter((t): t is Record<string, unknown> => t != null && typeof t === 'object' && !Array.isArray(t))
          .map((t) => ({
            name: typeof t.name === 'string' ? t.name : '',
            role: typeof t.role === 'string' ? t.role : '',
            bio: typeof t.bio === 'string' ? t.bio : '',
          }))
          .filter((t) => t.name.length > 0)
      : [],
    esg_notes: Array.isArray(o.esg_notes)
      ? o.esg_notes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
      : [],
  };
}
