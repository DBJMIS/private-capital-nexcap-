/**
 * DD basic_info — dynamic contact persons stored as JSON in vc_dd_answers.answer_json
 * under question_key `contact_persons`.
 */

export type ContactPersonRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export const CONTACT_PERSONS_QUESTION_KEY = 'contact_persons' as const;

function parseArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function newContactRow(): ContactPersonRow {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    email: '',
    phone: '',
  };
}

/** Ensures at least two rows (required minimum). */
export function normalizeContactPersonsValue(v: unknown): ContactPersonRow[] {
  const raw = parseArray(v);
  const mapped: ContactPersonRow[] = raw.map((x) => {
    const o = x as Record<string, unknown>;
    const id = typeof o?.id === 'string' && o.id.trim() ? o.id : newContactRow().id;
    return {
      id,
      name: String(o?.name ?? ''),
      email: String(o?.email ?? ''),
      phone: String(o?.phone ?? ''),
    };
  });
  if (mapped.length >= 2) return mapped;
  if (mapped.length === 1) return [mapped[0]!, newContactRow()];
  return [newContactRow(), newContactRow()];
}

/** Count rows with both name and email non-empty (UI “valid pair” indicator). */
export function countContactsWithNameAndEmail(rows: ContactPersonRow[]): number {
  return rows.filter((r) => r.name.trim().length > 0 && r.email.trim().length > 0).length;
}

/** Section complete: at least two contacts with name, email, and phone. */
export function contactPersonsSectionSatisfied(rows: ContactPersonRow[]): boolean {
  const complete = rows.filter(
    (r) => r.name.trim().length > 0 && r.email.trim().length > 0 && r.phone.trim().length > 0,
  );
  return complete.length >= 2;
}
