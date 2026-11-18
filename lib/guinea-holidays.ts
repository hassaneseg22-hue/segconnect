/* Jours fériés de Guinée (affichage dans le calendrier du DG).
 * Dates fixes + Lundi de Pâques calculé + fêtes musulmanes (calendrier lunaire : dates ESTIMÉES, ±1 jour).
 * Sources de contrôle 2026 : calendarific.com, timeanddate.com (agrégateurs, pas un texte officiel). */
export type Holiday = { date: string; label: string; estimated?: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function easterMonday(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(new Date(Date.UTC(y, month - 1, day + 1)));
}

// Dates 2026 confirmées par les deux sources de contrôle ; autres années : calcul du calendrier lunaire.
const OVERRIDES: Record<number, { fitr?: string; adha?: string; mawlid?: string }> = {
  2026: { fitr: '2026-03-20', adha: '2026-05-27', mawlid: '2026-08-26' },
};

function islamicFeasts(y: number): { fitr?: string; adha?: string; mawlid?: string } {
  const out: { fitr?: string; adha?: string; mawlid?: string } = {};
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
    for (let t = Date.UTC(y, 0, 1); new Date(t).getUTCFullYear() === y; t += 86400000) {
      const parts = fmt.formatToParts(new Date(t));
      const day = Number(parts.find((p) => p.type === 'day')?.value);
      const mon = Number(parts.find((p) => p.type === 'month')?.value);
      const key = ymd(new Date(t));
      if (mon === 10 && day === 1 && !out.fitr) out.fitr = key;
      if (mon === 12 && day === 10 && !out.adha) out.adha = key;
      if (mon === 3 && day === 12 && !out.mawlid) out.mawlid = key;
    }
  } catch { /* navigateur sans calendrier islamique : fêtes mobiles non affichées */ }
  return { ...out, ...(OVERRIDES[y] ?? {}) };
}

export function holidaysForYear(y: number): Holiday[] {
  const list: Holiday[] = [
    { date: `${y}-01-01`, label: 'Jour de l’An' },
    { date: easterMonday(y), label: 'Lundi de Pâques' },
    { date: `${y}-05-01`, label: 'Fête du Travail' },
    { date: `${y}-05-25`, label: 'Journée de l’Afrique' },
    { date: `${y}-08-15`, label: 'Assomption' },
    { date: `${y}-10-02`, label: 'Fête de l’Indépendance' },
    { date: `${y}-12-25`, label: 'Noël' },
  ];
  const f = islamicFeasts(y);
  if (f.fitr) list.push({ date: f.fitr, label: 'Korité (Aïd el-Fitr)', estimated: true });
  if (f.adha) {
    list.push({ date: f.adha, label: 'Tabaski (Aïd el-Kébir)', estimated: true });
    list.push({ date: ymd(new Date(Date.parse(f.adha) + 86400000)), label: 'Lendemain de Tabaski', estimated: true });
  }
  if (f.mawlid) list.push({ date: f.mawlid, label: 'Maouloud (naissance du Prophète)', estimated: true });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
