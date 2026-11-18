/* =====================================================================
   SEGE — compréhension des demandes d'agenda (français)
   « fixe une réunion avec la DCCCI demain à 10 h au siège, rappelle-moi 1 heure avant »
   Fonctions pures : utilisables côté navigateur.
   ===================================================================== */

export type Intention = 'creer' | 'lister' | 'deplacer' | 'annuler' | null;
export type Rdv = { titre: string; debut: Date; journee: boolean; dureeMin: number; lieu: string | null; rappelMin: number | null; heureDonnee: boolean };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'\-_]/g, ' ').replace(/\s+/g, ' ').trim();

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMBRES: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, 'quarante cinq': 45 };
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NOMBRES[s] ?? NaN);

const OBJET = '(rdv|rendez vous|reunion|rencontre|entretien|seance|audience|visite|point|appel|conseil|comite|seminaire|atelier|deplacement|mission|dejeuner|diner)';

export function intention(texte: string): Intention {
  const q = norm(texte);
  if (/\b(annule|annuler|supprime|supprimer|efface|effacer|retire)\b/.test(q) && new RegExp(`\\b${OBJET}`).test(q)) return 'annuler';
  if (/\b(deplace|deplacer|decale|decaler|reporte|reporter|repousse|repousser|avance|avancer|change l heure|changer l heure|modifie l heure)\b/.test(q) && new RegExp(`\\b${OBJET}`).test(q)) return 'deplacer';
  if (/\b(fixe|fixer|planifie|planifier|programme|programmer|ajoute|ajouter|cree|creer|note|noter|prends|prendre|mets|mettre|organise|organiser|cale|caler|inscris|enregistre|bloque|bloquer|reserve)\b/.test(q) && new RegExp(`\\b${OBJET}`).test(q)) return 'creer';
  const sansNom = q.replace(/^(sege|serge|seje)[\s,.:!]*/, '');
  if ((/^(j ai|jai) (un|une) /.test(sansNom) || new RegExp(`^${OBJET}\\b`).test(sansNom)) && (trouverDate(sansNom, new Date()) || trouverHeure(sansNom))) return 'creer';
  if (/\b(agenda|calendrier|planning|mes rendez vous|mes rdv|mes reunions|emploi du temps|qu est ce que j ai|ai je des rendez vous|programme de)\b/.test(q)) return 'lister';
  if (new RegExp(`\\b(mes|quels?|quelles?) ${OBJET}`).test(q)) return 'lister';
  return null;
}

/* ---------- Date ---------- */
function prochainJour(base: Date, jour: number, inclureAujourdhui: boolean) {
  const d = new Date(base);
  let diff = (jour - d.getDay() + 7) % 7;
  if (diff === 0 && !inclureAujourdhui) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function trouverDate(q: string, maintenant: Date): { date: Date; explicite: boolean } | null {
  const base = new Date(maintenant); base.setHours(0, 0, 0, 0);
  const plus = (n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  if (/apres demain/.test(q)) return { date: plus(2), explicite: true };
  if (/\bdemain\b/.test(q)) return { date: plus(1), explicite: true };
  if (/aujourd hui|ce (matin|soir|midi)|cet apres midi|tout a l heure|tantot/.test(q)) return { date: plus(0), explicite: true };
  const dans = q.match(/dans (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix|quinze) (jours?|semaines?)/);
  if (dans) { const n = num(dans[1]); return { date: plus(dans[2].startsWith('semaine') ? n * 7 : n), explicite: true }; }
  // « le 25 novembre (2026) », « 25 novembre », « le 25/11(/2026) », « le 1er décembre »
  const m1 = q.match(/\b(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?: (\d{4}))?/);
  if (m1) {
    const mois = MOIS.indexOf(m1[2]);
    let an = m1[3] ? Number(m1[3]) : base.getFullYear();
    let d = new Date(an, mois, Number(m1[1]));
    if (!m1[3] && d < base) { an++; d = new Date(an, mois, Number(m1[1])); }
    return { date: d, explicite: true };
  }
  const m2 = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m2) {
    let an = m2[3] ? Number(m2[3].length === 2 ? `20${m2[3]}` : m2[3]) : base.getFullYear();
    let d = new Date(an, Number(m2[2]) - 1, Number(m2[1]));
    if (!m2[3] && d < base) { an++; d = new Date(an, Number(m2[2]) - 1, Number(m2[1])); }
    return { date: d, explicite: true };
  }
  const semProchaine = /semaine prochaine/.test(q);
  for (let j = 0; j < 7; j++) {
    if (new RegExp(`\\b${JOURS[j]}\\b`).test(q)) {
      const prochain = new RegExp(`${JOURS[j]} prochain`).test(q) || semProchaine;
      let d = prochainJour(base, j, !prochain);
      if (semProchaine && (d.getTime() - base.getTime()) / 86400000 < 7 - ((base.getDay() + 6) % 7)) d = new Date(d.getTime() + 7 * 86400000);
      return { date: d, explicite: true };
    }
  }
  if (semProchaine) return { date: prochainJour(base, 1, false), explicite: true };
  const m3 = q.match(/\b(?:le )(\d{1,2})(?:er)?\b(?! ?h| heures?| ?:)/);
  if (m3) {
    let d = new Date(base.getFullYear(), base.getMonth(), Number(m3[1]));
    if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, Number(m3[1]));
    return { date: d, explicite: true };
  }
  return null;
}

/* ---------- Heure ---------- */
export function trouverHeure(q: string): { h: number; m: number } | null {
  if (/\bmidi\b/.test(q) && !/apres midi/.test(q.replace(/a midi/, ''))) { const m = q.match(/midi (et )?(demi|quart|\d{1,2})/); return { h: 12, m: m ? (m[2] === 'demi' ? 30 : m[2] === 'quart' ? 15 : Number(m[2])) : 0 }; }
  if (/\bminuit\b/.test(q)) return { h: 0, m: 0 };
  const m = q.match(/\b(\d{1,2}) ?(?:h|heures?|:)(?: ?(\d{2}|et demi|et quart|moins le quart|moins quart))?\b/);
  if (m) {
    let h = Number(m[1]); let mn = 0;
    if (m[2] === 'et demi') mn = 30; else if (m[2] === 'et quart') mn = 15;
    else if (m[2] && /moins/.test(m[2])) { h -= 1; mn = 45; }
    else if (m[2]) mn = Number(m[2]);
    if (h <= 7 && /(apres midi|soir)/.test(q)) h += 12;
    if (h > 23 || mn > 59) return null;
    return { h, m: mn };
  }
  if (/\bce matin\b|\ble matin\b|\bdans la matinee\b/.test(q)) return null;
  return null;
}

function rappel(q: string): number | null | undefined {
  if (/sans rappel|pas de rappel|ne me rappelle pas/.test(q)) return null;
  if (/la veille/.test(q)) return 1440;
  const m = q.match(/(\d+|un|une|deux|trois|quatre|cinq|dix|quinze|vingt|trente|quarante cinq) (minutes?|min|heures?|h|jours?) (avant|a l avance|plus tot)/)
    || q.match(/(?:rappel(?:le)?(?: moi)?|previens moi|alerte moi) (\d+|un|une|deux|trois|quatre|cinq|dix|quinze|vingt|trente|quarante cinq) (minutes?|min|heures?|h|jours?)/);
  if (m) {
    const n = num(m[1]);
    if (Number.isNaN(n)) return undefined;
    return /^h|heure/.test(m[2]) ? n * 60 : /^jour/.test(m[2]) ? n * 1440 : n;
  }
  return undefined;
}

function duree(q: string): number | null {
  const m = q.match(/(?:pendant|pour|d une duree de|duree) (\d+|une|deux|trois|quatre) ?(h|heures?|minutes?|min)/) || q.match(/\bd (une) (heure)\b/);
  if (!m) return null;
  const n = num(m[1]);
  return /^h|heure/.test(m[2]) ? n * 60 : n;
}

/* ---------- Lieu et titre (sur le texte original, pour garder les majuscules) ---------- */
const COUPURE = /\s+(?:le\s+\d|le\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|demain|apr[eè]s-?demain|aujourd|ce\s+(?:matin|soir)|cet\s+apr|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|[àa]\s+\d|vers\s+\d|de\s+\d{1,2}\s?h|dans\s+\d|la\s+semaine|pendant|pour\s+\d|rappel|rappelle|pr[ée]viens|alerte|sans\s+rappel|,|\.|;|$)/i;

function lieuDe(original: string): string | null {
  const m = original.match(/(?:\b(?:au|aux)\s+|\b[àa]\s+la\s+|\b[àa]\s+l['’]\s?|\bdans\s+(?:la|le)\s+|\ben\s+salle\s+|\bsalle\s+|\blieu\s*:\s*)([^\d,.;][^,.;]*)/i);
  if (!m) return null;
  let l = m[1].split(COUPURE)[0].trim();
  l = l.replace(/\s+(avec|pour|concernant|sur)\s.*$/i, '').trim();
  if (l.length < 2 || /^(sujet|propos|heure)/i.test(l)) return null;
  const prefixe = /^au\s/i.test(m[0]) ? 'au ' : /^aux\s/i.test(m[0]) ? 'aux ' : '';
  const brut = (prefixe ? '' : '') + l;
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

function titreDe(original: string, lieu: string | null): string {
  let t = ' ' + original + ' ';
  const enlever = [
    /^\s*(s[eé]g[eé]|serge)[\s,:!-]*/i,
    /^\s*(?:est[- ]ce que tu peux|peux[- ]tu|pourrais[- ]tu|merci de|s['’]il te pla[iî]t,?)\s*/i,
    /^\s*(?:fixe|fixer|planifie|planifier|programme|programmer|ajoute|ajouter|cr[ée]e|cr[ée]er|note|noter|prends|prendre|mets|mettre|organise|organiser|cale|caler|inscris|enregistre|bloque|bloquer|r[ée]serve|j['’]ai)\b\s*(?:-?moi\s+|nous\s+)?(?:dans\s+(?:mon|l['’])\s*agenda\s+)?(?:(?:une|un|les|le|la|des)\s+)?/i,
    /,?\s*(?:rappelle[- ]moi|rappel(?:le)?|pr[ée]viens[- ]moi|alerte[- ]moi|sans rappel|pas de rappel)\b.*$/i,
    /\s(?:pendant|pour|d['’]une dur[ée]e de)\s+(?:\d+|une|deux|trois|quatre)\s?(?:h|heures?|minutes?|min)\b/gi,
    /\s(?:[àa]|vers|de)\s+\d{1,2}\s?(?:h|heures?|:)\s?(?:\d{2}|et demie?|et quart|moins le quart)?\b/gi,
    /\s\d{1,2}\s?(?:h|heures?|:)\s?(?:\d{2}|et demie?|et quart)?\b/gi,
    /\s(?:[àa]\s+)?(?:midi|minuit)(?:\s+et\s+(?:demie?|quart))?\b/gi,
    /\s(?:le\s+)?\d{1,2}(?:er)?\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+\d{4})?\b/gi,
    /\s(?:le\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi,
    /\s(?:apr[eè]s[- ]demain|demain|aujourd['’]hui|ce\s+(?:matin|soir|midi)|cet\s+apr[eè]s[- ]midi|toute la journ[ée]e)\b/gi,
    /\s(?:ce\s+|le\s+)?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?\b/gi,
    /\s(?:la\s+)?semaine prochaine\b/gi,
    /\sdans\s+(?:\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix|quinze)\s+(?:jours?|semaines?)\b/gi,
    /\sle\s+\d{1,2}(?:er)?\b/gi,
  ];
  enlever.forEach((re, i) => { t = i < 3 ? t.trim().replace(re, '') : t.replace(re, ' '); if (i < 3) t = ' ' + t + ' '; });
  if (lieu) t = t.replace(new RegExp(`\\s(?:au|aux|[àa] la|[àa] l['’]\\s?|dans la|dans le|en salle|salle)\\s*${lieu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), ' ');
  t = t.replace(/\s+([,.;])/g, '$1').replace(/[,;.\s]+$/g, '').replace(/^[,;.\s]+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!t) return 'Rendez-vous';
  t = t.replace(/^rdv\b/i, 'Rendez-vous');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function comprendreRdv(original: string, maintenant = new Date()): Rdv | null {
  const q = norm(original);
  const d = trouverDate(q, maintenant);
  const h = trouverHeure(q);
  if (!d && !h) return null;
  const debut = new Date(d ? d.date : maintenant);
  if (!d) debut.setHours(0, 0, 0, 0);
  let journee = !h;
  if (h) debut.setHours(h.h, h.m, 0, 0);
  if (!d && h && debut.getTime() < maintenant.getTime()) debut.setDate(debut.getDate() + 1);
  if (/toute la journee/.test(q)) journee = true;
  const lieu = lieuDe(original);
  const r = rappel(q);
  return {
    titre: titreDe(original, lieu),
    debut, journee,
    dureeMin: duree(q) ?? 60,
    lieu,
    rappelMin: r === undefined ? (journee ? 1440 : 30) : r,
    heureDonnee: !!h,
  };
}

/* Période demandée pour « mon agenda de demain / de la semaine / du 25 novembre » */
export function periodeDemandee(texte: string, maintenant = new Date()): { de: Date; a: Date; libelle: string } {
  const q = norm(texte);
  const j0 = new Date(maintenant); j0.setHours(0, 0, 0, 0);
  const jour = (d: Date, n = 1) => ({ de: d, a: new Date(d.getTime() + n * 86400000) });
  if (/semaine prochaine/.test(q)) { const l = prochainJour(j0, 1, false); return { ...jour(l, 7), libelle: 'la semaine prochaine' }; }
  if (/cette semaine|la semaine|7 jours|sept jours/.test(q)) return { ...jour(j0, 7), libelle: 'ces 7 prochains jours' };
  if (/\bmois\b/.test(q)) return { ...jour(j0, 30), libelle: 'ces 30 prochains jours' };
  const d = trouverDate(q, maintenant);
  if (d) {
    const lib = d.date.getTime() === j0.getTime() ? 'aujourd’hui' : d.date.getTime() === j0.getTime() + 86400000 ? 'demain' : `le ${d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
    return { ...jour(d.date), libelle: lib };
  }
  if (/prochain|a venir|suivant/.test(q)) return { ...jour(j0, 14), libelle: 'ces 14 prochains jours' };
  return { ...jour(j0), libelle: 'aujourd’hui' };
}

/* Phrases */
export const dateLongue = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const heureFr = (d: Date) => { const h = d.getHours(), m = d.getMinutes(); return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} heures`; };
export const rappelFr = (m: number | null) => (m == null ? 'sans rappel' : m >= 1440 && m % 1440 === 0 ? `rappel ${m / 1440 === 1 ? 'la veille' : `${m / 1440} jours avant`}` : m >= 60 && m % 60 === 0 ? `rappel ${m / 60} heure${m > 60 ? 's' : ''} avant` : `rappel ${m} minutes avant`);
export function phraseRdv(r: Pick<Rdv, 'titre' | 'debut' | 'journee' | 'lieu' | 'rappelMin'>) {
  return `${r.titre}, ${dateLongue(r.debut)}${r.journee ? ', toute la journée' : ` à ${heureFr(r.debut)}`}${r.lieu ? `, ${/^(au|aux|à|a|en|dans)\s/i.test(r.lieu) ? '' : 'lieu : '}${r.lieu}` : ''}, ${rappelFr(r.rappelMin)}`;
}

/* Retrouver le rendez-vous visé (« la réunion DCCCI », « le rendez-vous avec le ministre ») */
export function meilleurRdv<T extends { title: string; starts_at: string }>(texte: string, events: T[]): T | null {
  const q = norm(texte);
  const vides = new Set(['annule', 'annuler', 'supprime', 'deplace', 'decale', 'reporte', 'repousse', 'avance', 'le', 'la', 'les', 'de', 'du', 'des', 'avec', 'mon', 'ma', 'mes', 'rendez', 'vous', 'rdv', 'reunion', 'a', 'au', 'heures', 'demain', 'aujourd', 'hui', 'sege', 'et', 'pour', 'un', 'une']);
  const mots = q.split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !vides.has(m) && !JOURS.includes(m) && !MOIS.includes(m) && !/^\d+h?$/.test(m));
  let best: T | null = null, score = 0;
  for (const e of events) {
    const t = norm(e.title);
    const s = mots.filter((m) => t.includes(m)).length;
    if (s > score) { best = e; score = s; }
  }
  return score > 0 ? best : null;
}
