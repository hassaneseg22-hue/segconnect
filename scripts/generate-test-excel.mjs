// =====================================================================
// generate-test-excel.mjs
// Génère des fichiers Excel SEG synthétiques pour tester le pipeline
// d'import (/import) — tous les scénarios du §35-36 du cahier des charges.
//
// Lancement :
//   node scripts/generate-test-excel.mjs
// Les fichiers sont écrits dans ./sample-excel/ (au côté de ce script).
//
// Structure des feuilles (identique à celle attendue par lib/excel) :
//   BD_TECH   : 1 ligne d'en-tête sautée ; lignes = Période, Agence,
//               Produit, Consommé, Facturé, Rendement, Ratio, ...
//   BD_FAC    : 3 lignes d'en-tête sautées
//   BD_Recouv : 1 ligne d'en-tête sautée
// =====================================================================

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'sample-excel');

// --- Aide à la construction -------------------------------------------------
function aos(rows) {
  // akao "array of arrays" : chaque ligne est écrite telle quelle.
  const ws = XLSX.utils.aoa_to_sheet(rows);
  return ws;
}

function buildWorkbook({ fac = true, tech = true, rec = true } = {}) {
  const sheets = {};
  if (fac) sheets['BD_FAC'] = aos([]);
  if (tech) sheets['BD_TECH'] = aos([]);
  if (rec) sheets['BD_Recouv'] = aos([]);
  return sheets;
}

// Lignes de données ----------------------------------------------------------
const AGENCIES = ['Yimbaya', 'Matoto', 'Ratoma', 'Dixinn'];
const CLIENTS = ['Domestique', 'Commerce', 'Industrie'];

// BD_TECH : [Période, Agence, Produit, Consommé, Facturé, Rendement (opt), Ratio (opt)]
function techRow(month, agency, prod, cons, bil, yield_ = null, ratio_ = null) {
  return [month, agency, prod, cons, bil, yield_ ?? '', ratio_ ?? ''];
}
const TECH_HEADERS = new Array(5).fill(null); // 1 ligne d'en-tête (sautée par le parser)

// BD_FAC : [Période, Agence, Type, SubF, SubM, SubTot, VcF, VfF, VcM, VfM, VcTot, VfTot,
//           AmF, AmM, AmTot, Penalty, Paye, Solde, TauxRecouv]
const FAC_EMPTY = new Array(19).fill(null);
function facRow(month, agency, client, vals) {
  const r = FAC_EMPTY.slice();
  r[0] = month; r[1] = agency; r[2] = client;
  for (const k of Object.keys(vals)) r[k] = vals[k];
  return r;
}
// Une ligne "d'en-tête" réelle : le 1er octet non nul force XLSX à matérialiser
// la ligne physique, de sorte que les données arrivent au bon décalage (skip).
function headerRow(placeholder, width) {
  const r = new Array(width).fill(null);
  r[0] = placeholder;
  return r;
}

// BD_Recouv : [Période, Agence, Type, AmF, AmM, AmTot, Penalty, Paye, Solde, PayeMaj,
//              SoldeMaj, Tr, TrMaj, Évol]
const REC_EMPTY = new Array(14).fill(null);
function recRow(month, agency, client, vals) {
  const r = REC_EMPTY.slice();
  r[0] = month; r[1] = agency; r[2] = client;
  for (const k of Object.keys(vals)) r[k] = vals[k];
  return r;
}

// --- Définition des scénarios ------------------------------------------------
const scenarios = {};

// 1. Fichier valide
scenarios['01-valid'] = {
  facRows: [
    facRow('2026-01-01', 'Yimbaya', 'Particulier', { 3: 120, 4: 80, 6: 900, 7: 900, 8: 600, 9: 600, 12: 600000, 13: 400000, 15: 700000, 16: 650000, 18: 0.93 }),
    facRow('2026-01-01', 'Matoto', 'Commerce', { 3: 40, 4: 30, 6: 400, 7: 400, 8: 250, 9: 250, 12: 300000, 13: 200000, 15: 350000, 16: 320000, 18: 0.91 }),
  ],
  techRows: [
    techRow('2026-01-01', 'Yimbaya', 181000, 138000, 130000, 0.76, 0.72),
    techRow('2026-01-01', 'Matoto', 90000, 70000, 66000, 0.78, 0.73),
  ],
  recRows: [
    recRow('2026-01-01', 'Yimbaya', 'Particulier', { 3: 600000, 4: 400000, 6: 700000, 7: 650000, 9: 680000, 11: 0.93, 12: 0.97, 13: 0.04 }),
  ],
};

// 2. Contenu identique au n°1 → déclenchera la détection d'import déjà effectué (hash)
scenarios['02-duplicate-content'] = scenarios['01-valid'];

// 3. Période déjà présente en base (2025-01, couverte par l'import #2)
scenarios['03-existing-period'] = {
  facRows: [
    facRow('2025-01-01', 'Ratoma', 'Domestique', { 3: 50, 4: 40, 6: 300, 7: 300, 8: 200, 9: 200, 12: 150000, 13: 100000, 15: 180000, 16: 175000, 18: 0.97 }),
  ],
  techRows: [
    techRow('2025-01-01', 'Ratoma', 40000, 32000, 30000, 0.80, 0.75),
  ],
  recRows: [
    recRow('2025-01-01', 'Ratoma', 'Domestique', { 3: 150000, 4: 100000, 6: 180000, 7: 175000, 9: 176000, 11: 0.97, 12: 0.98, 13: 0.01 }),
  ],
};

// 4. Fichier corrigé pour 2025-01 (mise à jour des lignes existantes)
scenarios['04-corrected'] = {
  facRows: [
    facRow('2025-01-01', 'Ratoma', 'Domestique', { 3: 52, 4: 42, 6: 310, 7: 310, 8: 210, 9: 210, 12: 152000, 13: 102000, 15: 182000, 16: 177000, 18: 0.97 }),
  ],
  techRows: [
    techRow('2025-01-01', 'Ratoma', 40500, 32500, 30500, 0.80, 0.75),
  ],
  recRows: [
    recRow('2025-01-01', 'Ratoma', 'Domestique', { 3: 152000, 4: 102000, 6: 182000, 7: 177000, 9: 178000, 11: 0.97, 12: 0.98, 13: 0.01 }),
  ],
};

// 5. Casse / fautes d'intitulés → normalisation
scenarios['05-bad-casing'] = {
  facRows: [
    facRow('2026-02-01', 'YIMBAYA', 'PARTICULIER', { 3: 110, 4: 70, 6: 800, 7: 800, 8: 500, 9: 500, 12: 550000, 13: 350000, 15: 600000, 16: 560000, 18: 0.93 }),
    facRow('2026-02-01', 'mattoTo', 'Commerc', { 3: 30, 4: 25, 6: 350, 7: 350, 8: 220, 9: 220, 12: 250000, 13: 160000, 15: 280000, 16: 260000, 18: 0.93 }),
  ],
  techRows: [],
  recRows: [],
};

// 6. Rendement réseau > 100 % → anomalie warning
scenarios['06-yield-gt-100'] = {
  facRows: [],
  techRows: [
    techRow('2026-03-01', 'Dixinn', 50000, 55000, 45000, 1.3, 0.9),
  ],
  recRows: [],
};

// 7. Valeurs manquantes / formules cassées (#DIV/0!)
scenarios['07-missing-value'] = {
  facRows: [
    facRow('2026-03-01', 'Yimbaya', 'Domestique', { 3: null, 4: 80, 6: '#DIV/0!', 7: 900, 8: 600, 9: 600, 12: 600000, 13: null, 15: 700000, 16: 650000, 18: '#REF!' }),
  ],
  techRows: [
    techRow('2026-03-01', 'Matoto', '', 40000, 38000),
  ],
  recRows: [],
};

// 8. Feuille absente (BD_TECH manquante)
scenarios['08-missing-sheet'] = {
  facRows: [
    facRow('2026-04-01', 'Kaloum', 'Industrie', { 3: 20, 4: 15, 6: 200, 7: 200, 8: 150, 9: 150, 12: 200000, 13: 120000, 15: 220000, 16: 210000, 18: 0.95 }),
  ],
  techRows: null, // la feuille BD_TECH ne sera pas créée
  recRows: [],
};

// 9. Ligne sans colonne exploitable (feuille BD_FAC presque vide en dessous de l'en-tête)
scenarios['09-empty-sheet'] = {
  facRows: [],
  techRows: [],
  recRows: [],
};

// 10. Multi-périodes : Jan + Fév 2027
scenarios['10-multi-month'] = {
  facRows: [
    facRow('2027-01-01', 'Wanindara', 'Domestique', { 3: 60, 4: 40, 6: 500, 7: 500, 8: 300, 9: 300, 12: 300000, 13: 180000, 15: 320000, 16: 300000, 18: 0.94 }),
    facRow('2027-02-01', 'Cimenterie', 'Industrie', { 3: 25, 4: 20, 6: 260, 7: 260, 8: 180, 9: 180, 12: 240000, 13: 140000, 15: 260000, 16: 250000, 18: 0.96 }),
  ],
  techRows: [
    techRow('2027-01-01', 'Wanindara', 70000, 54000, 50000, 0.77, 0.71),
    techRow('2027-02-01', 'Cimenterie', 45000, 36000, 34000, 0.80, 0.76),
  ],
  recRows: [
    recRow('2027-01-01', 'Wanindara', 'Domestique', { 3: 300000, 4: 180000, 6: 320000, 7: 300000, 9: 305000, 11: 0.94, 12: 0.95, 13: 0.01 }),
  ],
};

// --- Écriture -----------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });

function writeScenario(name, spec) {
  const haveFac = spec.facRows && spec.facRows.length >= 0;
  const haveTech = spec.techRows !== null;
  const haveRec = spec.recRows && spec.recRows.length >= 0;

  const facRows = [
    headerRow('EN-TÊTE FACTURATION (1/3)', 19), headerRow('EN-TÊTE FACTURATION (2/3)', 19), headerRow('EN-TÊTE FACTURATION (3/3)', 19),
    ...spec.facRows || [],
  ];
  const techRows = haveTech ? [headerRow('EN-TÊTE TECHNIQUE', 16), ...(spec.techRows || [])] : null;
  const recRows = [
    headerRow('EN-TÊTE RECOUVREMENT', 16),
    ...(spec.recRows || []),
  ];

  const wb = XLSX.utils.book_new();
  if (haveFac) XLSX.utils.book_append_sheet(wb, aos(facRows), 'BD_FAC');
  if (haveTech) XLSX.utils.book_append_sheet(wb, aos(techRows), 'BD_TECH');
  if (haveRec) XLSX.utils.book_append_sheet(wb, aos(recRows), 'BD_Recouv');

  const file = path.join(OUT, `${name}.xlsx`);
  const binary = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  fs.writeFileSync(file, binary);
  return { file, size: binary.length };
}

const results = [];
for (const name of Object.keys(scenarios)) {
  const s = scenarios[name];
  if (name === '09-empty-sheet') {
    // feuilles présentes mais sans données exploitables (uniquement des en-têtes)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, aos([headerRow('EN-TÊTE 1', 19), headerRow('EN-TÊTE 2', 19), headerRow('EN-TÊTE 3', 19)]), 'BD_FAC');
    XLSX.utils.book_append_sheet(wb, aos([headerRow('EN-TÊTE', 16)]), 'BD_TECH');
    XLSX.utils.book_append_sheet(wb, aos([headerRow('EN-TÊTE', 16)]), 'BD_Recouv');
    const file = path.join(OUT, '09-empty-sheet.xlsx');
    fs.writeFileSync(file, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
    results.push(`[OK] 09-empty-sheet.xlsx`);
    continue;
  }
  results.push(`[OK] ${writeScenario(name, s).file}`);
}

// Non-Excel (fichier texte) pour le test d'extension refusée
const badFile = path.join(OUT, '99-not-excel.txt');
fs.writeFileSync(badFile, 'ceci n\'est pas un fichier Excel');
results.push(`[OK] ${badFile} (doit être REFUSÉ à l'import)`);

console.log('Fichiers de test générés dans :', OUT);
for (const r of results) console.log('  ' + r);

const NB = [1, 3, 5, 6, 7, 8, 10];
console.log('\nConseil de "tour" (séquence mémoire des scénarios) :');
console.log('  01 → 03 → 04 → 05 → 06 → 07 → 08 → 10');
console.log('  02 = même contenu que 01 (test "déjà importé") ; 09 = feuilles vides ; 99 = refus au dépôt.');