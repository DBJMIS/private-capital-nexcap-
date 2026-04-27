'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LegalDocRow } from '@/lib/questionnaire/validate';

export type LegalDocumentsTableProps = {
  value: LegalDocRow[];
  onChange: (rows: LegalDocRow[]) => void;
  disabled?: boolean;
};

function newRow(): LegalDocRow {
  return {
    id:
      typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `ld-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    purpose: '',
    status: 'draft',
    document_id: null,
  };
}

export function LegalDocumentsTable({ value, onChange, disabled }: LegalDocumentsTableProps) {
  const rows = value.length ? value : [];

  const update = (i: number, patch: Partial<LegalDocRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-3">
      <div className="app-table-wrap">
        <table className="app-table min-w-[640px] [&_tbody_td]:h-auto [&_tbody_td]:px-2 [&_tbody_td]:py-1.5">
          <thead>
            <tr>
              <th>Document name</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Linked file ID (optional)</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="p-1">
                  <Input
                    value={r.name ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={r.purpose ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(i, { purpose: e.target.value })}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={r.status ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(i, { status: e.target.value })}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={r.document_id ?? ''}
                    disabled={disabled}
                    onChange={(e) =>
                      update(i, { document_id: e.target.value.trim() || null })
                    }
                    className="h-8 font-mono text-xs"
                    placeholder="UUID after upload"
                  />
                </td>
                <td className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={disabled}
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...rows, newRow()])}>
        Add document row
      </Button>
    </div>
  );
}
