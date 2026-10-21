// scripts/e2e-import-check.mjs
// Envoie chaque fichier de sample-excel/ à /api/import (action=analyze)
// et affiche les résultats (comptes, périodes, anomalies) pour valider le pipeline.
// Usage : node scripts/e2e-import-check.mjs
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'sample-excel');
const BASE = process.env.BASE_URL || 'http://localhost:3999';

async function analyze(file) {
  const buf = fs.readFileSync(file);
  const blob = new Blob([buf]);
  const fd = new FormData();
  fd.append('file', blob, path.basename(file));
  const r = await fetch(`${BASE}/api/import?action=analyze`, { method: 'POST', body: fd });
  return { status: r.status, json: await r.json() };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.xlsx') || f.endsWith('.txt'));
for (const f of files.sort()) {
  const file = path.join(DIR, f);
  try {
    const { status, json } = await analyze(file);
    const j = json || {};
    const a = j.action === 'analyze' && j.analysis ? j.analysis : j.data || {};
    const counts = a.counts || {};
    const periods = a.periods || [];
    const agencies = a.agencies || [];
    const anoms = a.anomaliesCount ?? (a.anomalies || []).length;
    console.log(
      `[${status}] ${f.padEnd(26)} lignes F/T/R=${String(counts.fac ?? '-')}/${String(counts.tech ?? '-')}/${String(counts.rec ?? '-')} ` +
      `périodes=${periods.length} agences=${agencies.length} anomalies=${anoms} ${json.error ? 'ERR=' + json.error : ''}`
    );
  } catch (e) {
    console.log(`[ERR] ${f} : ${e.message}`);
  }
}