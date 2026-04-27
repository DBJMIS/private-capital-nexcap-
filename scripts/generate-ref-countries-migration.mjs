import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const url =
  'https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/slim-2/slim-2.csv';

https.get(url, (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    const lines = d.trim().split(/\r?\n/).slice(1);
    const rows = [];
    for (const line of lines) {
      const m = line.match(/^(.*),([A-Z]{2}),(\d{3})$/);
      if (!m) continue;
      let name = m[1];
      if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/""/g, '"');
      rows.push({ code: m[2], name });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    let ord = 0;
    const vals = rows.map((r) => `('${esc(r.code)}','${esc(r.name)}',${++ord})`).join(',\n');

    const header = `BEGIN;

CREATE TABLE IF NOT EXISTS public.ref_countries (
  code text PRIMARY KEY CHECK (char_length(code) = 2 AND code = upper(code)),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ref_countries_name ON public.ref_countries (name);

ALTER TABLE public.ref_countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_countries_select_authenticated ON public.ref_countries;
CREATE POLICY ref_countries_select_authenticated
  ON public.ref_countries
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.ref_countries (code, name, sort_order)
VALUES
`;

    const footer = `
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

COMMIT;
`;

    const out = path.join(__dirname, '..', 'supabase', 'migrations', '20260416210000_ref_countries.sql');
    fs.writeFileSync(out, header + vals + footer, 'utf8');
    console.log('Wrote', out, 'rows:', rows.length);
  });
});
