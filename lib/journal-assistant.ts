import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* =====================================================================
   Assistant du Journal du DG — moteur à règles, côté serveur.
   Lit les tables Supabase du dashboard et répond en français.
   Aucune donnée ne sort du serveur.
   ===================================================================== */

/* ---------- Accès ---------- */
export async function utilisateurAutorise(code = 'journal.view'):
  Promise<{ ok: true; userId: string; db: SupabaseClient } | { ok: false; status: number; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return { ok: false, status: 500, error: 'Configuration Supabase manquante' };

  const cookieStore = await cookies();
  const auth = createServerClient(url, anon, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => { /* lecture seule */ } },
  });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Non authentifié' };

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: perm } = await db.from('permissions').select('id').eq('code', code).maybeSingle();
  const { data: profil } = await db.from('profiles').select('role_id').eq('id', user.id).maybeSingle();
  const roleId = profil?.role_id ?? null;

  if (perm?.id) {
    const { data: up } = await db.from('user_permissions').select('granted')
      .eq('user_id', user.id).eq('permission_id', perm.id).maybeSingle();
    if (up && up.granted === false) return { ok: false, status: 403, error: 'Accès refusé' };
    if (up?.granted) return { ok: true, userId: user.id, db };
    if (roleId != null) {
      const { data: rp } = await db.from('role_permissions').select('role_id')
        .eq('role_id', roleId).eq('permission_id', perm.id).maybeSingle();
      if (rp) return { ok: true, userId: user.id, db };
    }
  }
  if (roleId != null) {
    const { data: role } = await db.from('roles').select('code').eq('id', roleId).maybeSingle();
    if (role?.code === 'SUPER_ADMIN') return { ok: true, userId: user.id, db };
  }
  return { ok: false, status: 403, error: 'Accès refusé' };
}

/* ---------- Outils ---------- */
export const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisNom = (m: number | null | undefined) => (m && m >= 1 && m <= 12 ? MOIS[m - 1] : `mois ${m ?? '?'}`);
const periode = (annee: number | null | undefined, mois: number | null | undefined) => `${moisNom(mois)} ${annee ?? ''}`.trim();
const periodeDate = (iso: string | null | undefined) => {
  if (!iso) return 'période inconnue';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const dateFr = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const somme = <T,>(rows: T[], f: (r: T) => unknown) => rows.reduce((a, r) => a + n(f(r)), 0);
const nb = (v: number, dec = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
function gros(v: number, unite: string) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nb(v / 1e9, 2)} milliard${a >= 2e9 ? 's' : ''} ${unite}`.trim();
  if (a >= 1e6) return `${nb(v / 1e6, 1)} million${a >= 2e6 ? 's' : ''} ${unite}`.trim();
  return `${nb(v)} ${unite}`.trim();
}
const gnf = (v: number) => gros(v, 'GNF');
const m3 = (v: number) => gros(v, 'm³');
const pct = (a: number, b: number, dec = 1) => (b ? `${nb((a / b) * 100, dec)} %` : '—');
const evol = (a: number, b: number) => {
  if (!b) return '';
  const p = ((a - b) / b) * 100;
  return `${p >= 0 ? 'en hausse' : 'en baisse'} de ${nb(Math.abs(p), 1)} % sur un mois`;
};
const pl = (v: number, sing: string, plur?: string) => `${nb(v)} ${v > 1 ? (plur ?? sing + 's') : sing}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const liste = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);
const estTotal = (v: unknown) => /total|ensemble|general/.test(norm(v));
const estClos = (v: unknown) => /resolu|clos|clotur|termin|ferme|traite|corrige/.test(norm(v));

type Rows = Record<string, any>[];
async function tout(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>, max = 10000): Promise<Rows> {
  const out: Rows = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Ctx = { db: SupabaseClient; userId: string; q: string; agences: string[]; centres: string[] };
type Reponse = { texte: string; briefing?: string; carte?: Carte };

/* ---------- Modules ---------- */

async function centres(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('centres_problemes').select('rapport_date').order('rapport_date', { ascending: false }).limit(1);
  const rd = last?.[0]?.rapport_date;
  if (!rd) return { texte: 'Aucun rapport des centres de l’intérieur n’est enregistré.' };
  const { data, error } = await db.from('centres_problemes')
    .select('centre, region, probleme, statut, gravite, date_debut, responsable, impacts, solution, categories')
    .eq('rapport_date', rd).neq('statut', 'resolu');
  if (error) throw error;
  const rows = data ?? [];
  const jours = (d: string | null) => (d ? Math.round((Date.now() - new Date(`${d}T00:00:00Z`).getTime()) / 86_400_000) : null);
  const vise = rows.find((r) => q.includes(norm(r.centre)));
  if (vise) {
    const j = jours(vise.date_debut);
    return { texte: `Centre de ${vise.centre} (région de ${vise.region}) : ${vise.statut === 'arret' ? 'en arrêt total' : 'perturbé'}${j != null ? ` depuis ${j} jours` : ''}. ${vise.probleme}. Responsable : ${vise.responsable ?? 'non précisé'}.${vise.impacts ? ` Impact : ${vise.impacts}.` : ''}` };
  }
  const arret = rows.filter((r) => r.statut === 'arret');
  const pert = rows.filter((r) => r.statut === 'perturbe');
  const CATS: [RegExp, string, string][] = [
    [/carburant|gasoil|gazoil/, 'carburant', 'le manque de carburant'],
    [/chimique|chlore|sulfate/, 'produits_chimiques', 'le manque de produits chimiques'],
    [/fuite/, 'fuite', 'des fuites'],
    [/edg|electricite|courant/, 'electricite_edg', 'la fourniture d’électricité EDG'],
    [/panne|equipement|forage|pompe|groupe/, 'panne_equipement', 'une panne d’équipement'],
    [/vandal|vol|cambriol/, 'vandalisme', 'du vandalisme'],
    [/travaux/, 'travaux', 'des travaux'],
  ];
  const cat = CATS.find(([re]) => re.test(q));
  if (cat) {
    const l = rows.filter((r) => (r.categories ?? []).includes(cat[1]));
    return { texte: l.length ? `${cap(cat[2])} touche ${pl(l.length, 'centre')} : ${liste(l.map((r) => `${r.centre} (${r.statut === 'arret' ? 'arrêt' : 'perturbé'})`))}.` : `Aucun centre ne signale ${cat[2]}.` };
  }
  if (/arret/.test(q) && !/perturb/.test(q)) {
    return { texte: arret.length ? `${pl(arret.length, 'centre')} en arrêt total : ${liste(arret.map((r) => r.centre))}.` : 'Aucun centre en arrêt total.' };
  }
  if (/perturb/.test(q) && !/arret/.test(q)) {
    return { texte: pert.length ? `${pl(pert.length, 'centre perturbé', 'centres perturbés')} : ${liste(pert.map((r) => r.centre))}.` : 'Aucun centre perturbé.' };
  }
  const carb = rows.filter((r) => (r.categories ?? []).includes('carburant'));
  const t = `Rapport des centres du ${dateFr(rd)} : ${pl(rows.length, 'centre')} en difficulté, dont ${arret.length} en arrêt total${arret.length ? ` (${liste(arret.map((r) => r.centre))})` : ''} et ${pl(pert.length, 'perturbé')}. Le manque de carburant touche ${pl(carb.length, 'centre')}.`;
  return { texte: t, briefing: `${pl(rows.length, 'centre')} de l’intérieur en difficulté, dont ${arret.length} à l’arrêt.` };
}

async function production(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data, error } = await db.from('v_seg_production_nationale_mensuelle')
    .select('exercice, mois, total_villes_m3, conakry_m3, centres_m3, total_declare_eau_traitee_m3, total_declare_eau_brute_m3')
    .order('exercice', { ascending: false }).order('mois', { ascending: false }).limit(2);
  if (error) throw error;
  if (!data?.length) return { texte: 'Aucune donnée de production n’est disponible.' };
  const [a, b] = data;
  const tot = n(a.total_declare_eau_traitee_m3) || n(a.total_villes_m3);
  const totB = b ? n(b.total_declare_eau_traitee_m3) || n(b.total_villes_m3) : 0;
  let t = `En ${periode(a.exercice, a.mois)}, la production d’eau traitée est de ${m3(tot)}`;
  if (n(a.conakry_m3)) t += `, dont ${m3(n(a.conakry_m3))} pour Conakry et ${m3(n(a.centres_m3))} pour les centres de l’intérieur`;
  t += '.';
  const e = evol(tot, totB);
  if (e) t += ` Production ${e}.`;
  try {
    const { data: d } = await db.from('v_seg_bilan_distribution_conakry').select('exercice, mois, ratio_vd_vp')
      .order('exercice', { ascending: false }).order('mois', { ascending: false }).limit(1);
    const r = d?.[0];
    if (r && r.ratio_vd_vp != null) {
      const v = n(r.ratio_vd_vp); const p = v <= 1.5 ? v * 100 : v;
      t += ` À Conakry, le volume distribué représente ${nb(p, 1)} % du volume produit (${periode(r.exercice, r.mois)}).`;
    }
  } catch { /* vue absente */ }
  return { texte: t, briefing: `Production d’eau traitée en ${periode(a.exercice, a.mois)} : ${m3(tot)}${e ? `, ${e}` : ''}.` };
}

async function realisation(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('seg_production_realisation').select('periode_fin').order('periode_fin', { ascending: false }).limit(1);
  const fin = last?.[0]?.periode_fin;
  if (!fin) return { texte: 'Le taux de réalisation de la production n’est pas encore chargé.' };
  const { data, error } = await db.from('seg_production_realisation')
    .select('zone, site, capacite_m3j, volume_produit_m3, volume_moyen_m3j, ratio_capacite, taux_annuel, observation, periode_debut, nb_jours').eq('periode_fin', fin);
  if (error) throw error;
  const rows = data ?? [];
  const per = `de ${periodeDate(rows[0]?.periode_debut).split(' ')[0]} à ${periodeDate(fin)}`;
  const generiques = new Set(['station', 'stade', 'forages', 'captages', 'centre', 'grand', 'conakry']);
  const mots = (x: string) => norm(x).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !generiques.has(w));
  const vise = rows.find((r) => q.includes(norm(r.site)))
    || rows.find((r) => mots(r.site).some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(q)));
  if (vise) {
    return { texte: `${vise.site} (${vise.zone === 'grand_conakry' ? 'Grand Conakry' : 'centre de l’intérieur'}), ${per} : ${m3(n(vise.volume_produit_m3))} produits, soit ${nb(n(vise.volume_moyen_m3j))} m³ par jour pour une capacité de ${nb(n(vise.capacite_m3j))} m³ par jour. Taux de réalisation : ${nb(n(vise.ratio_capacite) * 100, 1)} % de la capacité et ${nb(n(vise.taux_annuel) * 100, 1)} % de l’objectif annuel.${vise.observation ? ` Observation : ${String(vise.observation).trim()}.` : ''}` };
  }
  const z = (k: string) => rows.filter((r) => r.zone === k);
  const ratio = (l: Rows) => somme(l, (r) => r.volume_produit_m3) / (n(l[0]?.nb_jours) || 1) / (somme(l, (r) => r.capacite_m3j) || 1);
  const arret = rows.filter((r) => n(r.volume_produit_m3) === 0);
  const faibles = rows.filter((r) => n(r.volume_produit_m3) > 0 && n(r.ratio_capacite) < 0.3).sort((a, b) => n(a.ratio_capacite) - n(b.ratio_capacite));
  const zq = /conakry/.test(q) ? 'grand_conakry' : /centre|interieur/.test(q) ? 'centres' : null;
  const filtre = zq ? z(zq) : rows;
  const tot = somme(filtre, (r) => r.volume_produit_m3);
  const t = `Réalisation de la production ${per}${zq === 'grand_conakry' ? ' au Grand Conakry' : zq === 'centres' ? ' dans les centres de l’intérieur' : ''} : ${m3(tot)} produits, soit ${nb(ratio(filtre) * 100, 1)} % de la capacité (Grand Conakry ${nb(ratio(z('grand_conakry')) * 100, 1)} %, centres ${nb(ratio(z('centres')) * 100, 1)} %). ${arret.length ? `${pl(arret.length, 'station')} à l’arrêt : ${liste(arret.map((r) => r.site))}. ` : ''}${faibles.length ? `Plus faibles : ${liste(faibles.slice(0, 4).map((r) => `${r.site} (${nb(n(r.ratio_capacite) * 100, 0)} %)`))}.` : ''}`;
  return { texte: t.trim(), briefing: `Réalisation de la production ${per} : ${nb(ratio(rows) * 100, 1)} % de la capacité, ${pl(arret.length, 'station')} à l’arrêt.` };
}

async function gasoil(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('seg_technique_center_monthly').select('period_month').order('period_month', { ascending: false }).limit(1);
  const pm = last?.[0]?.period_month;
  if (!pm) return { texte: 'Aucune donnée de gasoil par centre n’est disponible.' };
  const { data, error } = await db.from('seg_technique_center_monthly')
    .select('center_name, gasoil_consumption_l, gasoil_closing_stock_l, gasoil_delivered_l, station_yield, treated_water_m3')
    .eq('period_month', pm);
  if (error) throw error;
  const rows = (data ?? []).filter((r) => !estTotal(r.center_name));
  const vise = rows.find((r) => q.includes(norm(r.center_name)));
  if (vise) {
    return { texte: `${vise.center_name}, ${periodeDate(pm)} : gasoil livré ${nb(n(vise.gasoil_delivered_l))} L, consommé ${nb(n(vise.gasoil_consumption_l))} L, stock de fin de mois ${nb(n(vise.gasoil_closing_stock_l))} L. Eau traitée : ${m3(n(vise.treated_water_m3))}.` };
  }
  const conso = somme(rows, (r) => r.gasoil_consumption_l);
  const faibles = [...rows].sort((x, y) => n(x.gasoil_closing_stock_l) - n(y.gasoil_closing_stock_l)).slice(0, 3);
  return {
    texte: `En ${periodeDate(pm)}, les centres ont consommé ${nb(conso)} litres de gasoil. Stocks de fin de mois les plus bas : ${liste(faibles.map((r) => `${r.center_name} (${nb(n(r.gasoil_closing_stock_l))} L)`))}.`,
  };
}

async function approvisionnement(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data: last } = await db.from('seg_technique_supply_requests').select('period_end').order('period_end', { ascending: false }).limit(1);
  const pe = last?.[0]?.period_end;
  if (!pe) return { texte: 'Aucune demande d’approvisionnement n’est enregistrée.' };
  const { data, error } = await db.from('seg_technique_supply_requests')
    .select('center_name, row_type, gasoil_requested_l, hth_kg, sulfate_kg, carbonate_kg, lime_kg').eq('period_end', pe);
  if (error) throw error;
  const rows = data ?? [];
  const totaux = rows.filter((r) => estTotal(r.row_type) || estTotal(r.center_name));
  const base = totaux.length ? totaux.slice(0, 1) : rows;
  const g = somme(base, (r) => r.gasoil_requested_l);
  const top = rows.filter((r) => !estTotal(r.row_type) && !estTotal(r.center_name))
    .sort((a, b) => n(b.gasoil_requested_l) - n(a.gasoil_requested_l)).slice(0, 3);
  return {
    texte: `Dernière demande d’approvisionnement (jusqu’au ${dateFr(pe)}) : ${nb(g)} litres de gasoil, ${nb(somme(base, (r) => r.sulfate_kg))} kg de sulfate, ${nb(somme(base, (r) => r.hth_kg))} kg de HTH, ${nb(somme(base, (r) => r.lime_kg))} kg de chaux. Plus gros besoins en gasoil : ${liste(top.map((r) => `${r.center_name} (${nb(n(r.gasoil_requested_l))} L)`))}.`,
  };
}

async function facturation(c: Ctx): Promise<Reponse> {
  const { db, q, agences } = c;
  const { data: last } = await db.from('seg_facturation_centres_mensuelle').select('exercice, mois')
    .order('exercice', { ascending: false }).order('mois', { ascending: false }).limit(1);
  const p = last?.[0];
  if (!p) return { texte: 'Aucune donnée de facturation n’est disponible.' };
  const rows = await tout((f, t) => db.from('seg_facturation_centres_mensuelle')
    .select('agence_nom, mois, categorie, abonnes_factures, volume_facture, chiffre_affaires_ttc')
    .eq('exercice', p.exercice).range(f, t));
  const detail = rows.filter((r) => !estTotal(r.categorie) && !estTotal(r.agence_nom));
  const src = detail.length ? detail : rows;
  const agence = agences.find((a) => q.includes(norm(a)));
  const filtre = agence ? src.filter((r) => norm(r.agence_nom).includes(norm(agence))) : src;
  const mois = filtre.filter((r) => r.mois === p.mois);
  const ca = somme(mois, (r) => r.chiffre_affaires_ttc);
  const cumul = somme(filtre, (r) => r.chiffre_affaires_ttc);
  const ab = somme(mois, (r) => r.abonnes_factures);
  const vol = somme(mois, (r) => r.volume_facture);
  const qui = agence ? `l’agence ${agence}` : 'la SEG';
  let t = `En ${periode(p.exercice, p.mois)}, ${qui} a facturé ${gnf(ca)} TTC, pour ${nb(ab)} abonnés facturés et ${m3(vol)} facturés. Cumul ${p.exercice} : ${gnf(cumul)} TTC.`;
  if (!agence) {
    const parAg = new Map<string, number>();
    mois.forEach((r) => parAg.set(r.agence_nom, (parAg.get(r.agence_nom) ?? 0) + n(r.chiffre_affaires_ttc)));
    const top = [...parAg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) t += ` Premières agences : ${liste(top.map(([k, v]) => `${k} (${gnf(v)})`))}.`;
  }
  return { texte: t, briefing: `Chiffre d’affaires de ${periode(p.exercice, p.mois)} : ${gnf(ca)} TTC.` };
}

async function recouvrement(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('recouvrement_monthly').select('period_month').order('period_month', { ascending: false }).limit(1);
  const pm = last?.[0]?.period_month;
  if (!pm) return { texte: 'Aucune donnée de recouvrement n’est disponible.' };
  const rows = await tout((f, t) => db.from('recouvrement_monthly')
    .select('agency_id, amount_total, amount_paid, amount_paid_updated, balance_due, balance_due_updated').eq('period_month', pm).range(f, t));
  const { data: ag } = await db.from('agencies').select('id, name');
  const nom = new Map((ag ?? []).map((a) => [a.id, a.name as string]));
  const paye = (r: any) => (r.amount_paid_updated != null ? n(r.amount_paid_updated) : n(r.amount_paid));
  const vise = (ag ?? []).find((a) => q.includes(norm(a.name)));
  const src = vise ? rows.filter((r) => r.agency_id === vise.id) : rows;
  const emis = somme(src, (r) => r.amount_total);
  const enc = somme(src, paye);
  let t = `${vise ? `Agence ${vise.name}, ` : ''}${vise ? periodeDate(pm) : cap(periodeDate(pm))} : ${gnf(enc)} recouvrés sur ${gnf(emis)} émis, soit un taux de recouvrement de ${pct(enc, emis)}.`;
  if (!vise) {
    const parAg = new Map<number, { e: number; p: number }>();
    rows.forEach((r) => { const x = parAg.get(r.agency_id) ?? { e: 0, p: 0 }; x.e += n(r.amount_total); x.p += paye(r); parAg.set(r.agency_id, x); });
    const bas = [...parAg.entries()].filter(([, v]) => v.e > 0).sort((a, b) => a[1].p / a[1].e - b[1].p / b[1].e).slice(0, 3);
    if (bas.length) t += ` Taux les plus faibles : ${liste(bas.map(([id, v]) => `${nom.get(id) ?? `agence ${id}`} (${pct(v.p, v.e)})`))}.`;
  }
  return { texte: t, briefing: `Taux de recouvrement en ${periodeDate(pm)} : ${pct(enc, emis)}.` };
}

async function impayes(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('v_seg_impayes_zone').select('exercise, period_month')
    .order('exercise', { ascending: false }).order('period_month', { ascending: false }).limit(1);
  const p = last?.[0];
  if (!p) return { texte: 'Aucune donnée d’impayés n’est disponible.' };
  const rows = await tout((f, t) => db.from('v_seg_impayes_zone')
    .select('agency_name_source, agent_zone, emissions, impayes').eq('exercise', p.exercise).eq('period_month', p.period_month).range(f, t));
  const src0 = rows.filter((r) => !estTotal(r.agency_name_source) && !estTotal(r.agent_zone));
  const src = src0.length ? src0 : rows;
  const agNoms = Array.from(new Set(src.map((r) => String(r.agency_name_source ?? ''))));
  const vise = agNoms.find((a) => a && q.includes(norm(a)));
  const f = vise ? src.filter((r) => r.agency_name_source === vise) : src;
  const em = somme(f, (r) => r.emissions);
  const imp = somme(f, (r) => r.impayes);
  let t = `${vise ? `Agence ${vise}, ${periode(p.exercise, p.period_month)}` : cap(periode(p.exercise, p.period_month))} : ${gnf(imp)} d’impayés pour ${gnf(em)} d’émissions, soit ${pct(imp, em)}.`;
  const cle = vise ? 'agent_zone' : 'agency_name_source';
  const g = new Map<string, number>();
  f.forEach((r) => g.set(r[cle] ?? '—', (g.get(r[cle] ?? '—') ?? 0) + n(r.impayes)));
  const top = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length) t += ` ${vise ? 'Zones' : 'Agences'} les plus exposées : ${liste(top.map(([k, v]) => `${k} (${gnf(v)})`))}.`;
  return { texte: t, briefing: `Impayés de ${periode(p.exercise, p.period_month)} : ${gnf(imp)}, soit ${pct(imp, em)} des émissions.` };
}

async function tresorerie(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data, error } = await db.from('v_seg_finance_monthly')
    .select('exercise, month, encaissements_total, versements_total, ecart_especes, ecart_cheques, orange_money, virements_bancaires')
    .order('exercise', { ascending: false }).order('month', { ascending: false }).limit(1);
  if (error) throw error;
  const r = data?.[0];
  if (!r) return { texte: 'Aucune donnée de trésorerie n’est disponible.' };
  const ecart = n(r.ecart_especes) + n(r.ecart_cheques);
  const t = `Trésorerie de ${periode(r.exercise, r.month)} : ${gnf(n(r.encaissements_total))} encaissés, ${gnf(n(r.versements_total))} versés en banque, écart de ${gnf(ecart)}. Orange Money : ${gnf(n(r.orange_money))} ; virements bancaires : ${gnf(n(r.virements_bancaires))}.`;
  return { texte: t, briefing: `Encaissements de ${periode(r.exercise, r.month)} : ${gnf(n(r.encaissements_total))}, écart de versement ${gnf(ecart)}.` };
}

async function stocks(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: inv } = await db.from('stock_inventaires').select('id, periode, libelle').order('periode', { ascending: false }).limit(1);
  const i = inv?.[0];
  if (!i) return { texte: 'Aucun inventaire de stock n’est enregistré.' };
  const m = q.match(/(?:stock|reste|quantite|combien)[^a-z]*(?:de |d |du |des |en )?([a-z0-9][a-z0-9 -]{2,30})/);
  const terme = m?.[1]?.replace(/\b(stock|magasin|reste|il|en|au|a|le|la|les|y)\b/g, '').trim();
  if (terme && terme.length >= 3 && !/rupture|valeur|magasin|inventaire|general|total/.test(terme)) {
    const { data: l } = await db.from('stock_lignes').select('designation, quantite, unite, lieu, en_rupture')
      .eq('inventaire_id', i.id).ilike('designation', `%${terme.split(' ')[0]}%`).limit(6);
    if (l?.length) {
      return { texte: `Inventaire du ${dateFr(i.periode)} : ` + l.map((x) => `${x.designation} : ${x.en_rupture ? 'en rupture' : `${nb(n(x.quantite))} ${x.unite ?? ''}`.trim()}${x.lieu ? ` (${x.lieu})` : ''}`).join(' ; ') + '.' };
    }
  }
  const { data: syn } = await db.from('v_stock_synthese').select('nb_articles, nb_ruptures, nb_mauvais_etat, valeur_gnf').eq('inventaire_id', i.id);
  const s = syn ?? [];
  const art = somme(s, (r) => r.nb_articles), rup = somme(s, (r) => r.nb_ruptures), val = somme(s, (r) => r.valeur_gnf), me = somme(s, (r) => r.nb_mauvais_etat);
  const { data: rl } = await db.from('stock_lignes').select('designation').eq('inventaire_id', i.id).eq('en_rupture', true).limit(5);
  let t = `Inventaire du ${dateFr(i.periode)} : ${nb(art)} articles, valeur ${gnf(val)}, ${nb(rup)} en rupture et ${nb(me)} en mauvais état.`;
  if (rl?.length) t += ` Exemples de ruptures : ${liste(rl.map((x) => x.designation))}.`;
  return { texte: t, briefing: `Magasins : ${pl(rup, 'article')} en rupture sur ${nb(art)}.` };
}

/* ---------- Ressources humaines (réponse + fiche affichée en bulle) ---------- */
export type Carte = {
  titre: string;
  sousTitre?: string;
  stats?: { label: string; valeur: string }[];
  barres?: { titre: string; items: { label: string; valeur: number }[] }[];
  sections?: { titre: string; colonnes: string[]; lignes: string[][]; total: number }[];
  note?: string;
};

const MOTS_VIDES = new Set(['qui', 'est', 'sont', 'les', 'des', 'del', 'une', 'pour', 'dans', 'avec', 'moi', 'donne', 'donnez', 'montre', 'montrez', 'affiche', 'affichez', 'liste', 'fiche', 'agent', 'agents', 'personnel', 'effectif', 'effectifs', 'employe', 'employes', 'salarie', 'salaries', 'matricule', 'cherche', 'chercher', 'trouve', 'trouver', 'combien', 'ressources', 'humaines', 'societe', 'seg', 'centre', 'centres', 'service', 'pole', 'categorie', 'emploi', 'fonction', 'direction', 'regionale', 'par', 'tous', 'toutes', 'quel', 'quels', 'quelle', 'quelles', 'nom', 'appelle', 'monsieur', 'madame', 'mme', 'bonjour', 'svp', 'plait', 'informations', 'information', 'infos', 'sur', 'aux', 'ont', 'travaille', 'travaillent', 'rh']);

const grouper = (rows: Rows, f: (r: any) => unknown) => {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = String(f(r) ?? '').trim() || 'Non renseigné'; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur }));
};
const v = (x: unknown) => (x == null || x === '' ? '—' : String(x));
const COL_SOC = ['Matricule', 'Nom', 'Prénom', 'Emploi', 'Catégorie', 'Service', 'Pôle'];
const ligneSoc = (r: any) => [v(r.matricule), v(r.nom), v(r.prenom), v(r.emploi), v(r.categorie), v(r.service), v(r.pole)];
const COL_CEN = ['Matricule', 'Nom complet', 'Fonction', 'Catégorie', 'Centre', 'Direction régionale', 'Contact'];
const ligneCen = (r: any) => [v(r.matricule), v(r.nom_complet), v(r.fonction), v(r.categorie), r.est_staff_dr ? 'Staff DR' : v(r.centre), v(r.direction_regionale), v(r.contact)];
const MAX_LIGNES = 400;

async function rh(c: Ctx): Promise<Reponse & { carte?: Carte }> {
  const { db, q } = c;
  const [{ data: d1 }, { data: d2 }] = await Promise.all([
    db.from('seg_effectif_societe').select('date_reception').order('date_reception', { ascending: false }).limit(1),
    db.from('seg_personnel_centres').select('date_liste').order('date_liste', { ascending: false }).limit(1),
  ]);
  const dSoc = d1?.[0]?.date_reception as string | undefined;
  const dCen = d2?.[0]?.date_liste as string | undefined;
  const [soc, cen] = await Promise.all([
    dSoc ? tout((f, t) => db.from('seg_effectif_societe').select('matricule, nom, prenom, emploi, categorie, cf, service, pole, alerte_qualite').eq('date_reception', dSoc).order('rang').range(f, t)) : Promise.resolve([] as Rows),
    dCen ? tout((f, t) => db.from('seg_personnel_centres').select('direction_regionale, centre, est_staff_dr, nom_complet, matricule, fonction, categorie, contact, alerte_qualite').eq('date_liste', dCen).order('rang').range(f, t)) : Promise.resolve([] as Rows),
  ]);
  if (!soc.length && !cen.length) return { texte: 'Aucune donnée des ressources humaines n’est disponible.' };

  const sources = [dSoc ? `effectif société du ${dateFr(dSoc)}` : '', dCen ? `personnel des centres du ${dateFr(dCen)}` : ''].filter(Boolean).join(' · ');
  const briefing = `Effectif : ${pl(soc.length, 'agent')} au siège et dans les services, ${pl(cen.length, 'agent')} dans les centres de l’intérieur.`;
  const sectionSoc = (rows: Rows, titre = 'Effectif de la société') =>
    ({ titre, colonnes: COL_SOC, lignes: rows.slice(0, MAX_LIGNES).map(ligneSoc), total: rows.length });
  const sectionCen = (rows: Rows, titre = 'Personnel des centres de l’intérieur') =>
    ({ titre, colonnes: COL_CEN, lignes: rows.slice(0, MAX_LIGNES).map(ligneCen), total: rows.length });
  const note = (n1: number, n2: number) => (n1 > MAX_LIGNES || n2 > MAX_LIGNES ? `Affichage limité aux ${MAX_LIGNES} premières lignes par tableau.` : undefined);

  /* 1) Matricule */
  const mm = q.match(/\b([a-z]{0,4}\s?-?\d{3,}[a-z0-9-]*)\b/);
  if (mm) {
    mm[1] = mm[1].trim();
    const cle = mm[1].replace(/[\s-]/g, '');
    const s = soc.filter((r) => norm(r.matricule).replace(/[\s-]/g, '') === cle);
    const k = cen.filter((r) => norm(r.matricule).replace(/[\s-]/g, '') === cle);
    if (s.length || k.length) {
      const p = s[0] ?? null; const pc = k[0] ?? null;
      const nom = p ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : pc?.nom_complet;
      return {
        texte: `Matricule ${mm[1].toUpperCase()} : ${nom}${p?.emploi ? `, ${p.emploi}` : pc?.fonction ? `, ${pc.fonction}` : ''}${p?.service ? `, service ${p.service}` : pc?.centre ? `, centre de ${pc.centre}` : ''}. Je vous affiche sa fiche.`,
        carte: { titre: nom || `Matricule ${mm[1]}`, sousTitre: `Matricule ${mm[1].toUpperCase()}`,
          stats: [
            ...(p ? [{ label: 'Emploi', valeur: v(p.emploi) }, { label: 'Catégorie', valeur: v(p.categorie) }, { label: 'Service', valeur: v(p.service) }, { label: 'Pôle', valeur: v(p.pole) }] : []),
            ...(pc ? [{ label: 'Fonction', valeur: v(pc.fonction) }, { label: 'Centre', valeur: pc.est_staff_dr ? 'Staff DR' : v(pc.centre) }, { label: 'Direction régionale', valeur: v(pc.direction_regionale) }, { label: 'Contact', valeur: v(pc.contact) }] : []),
          ],
          sections: [...(s.length ? [sectionSoc(s, 'Fiche société')] : []), ...(k.length ? [sectionCen(k, 'Fiche centre')] : [])],
          note: (p?.alerte_qualite || pc?.alerte_qualite) ? `Alerte qualité : ${p?.alerte_qualite || pc?.alerte_qualite}` : undefined },
      };
    }
  }

  /* 2) Alertes qualité des listes RH */
  if (/alerte|anomalie|incoheren|erreur|qualite/.test(q)) {
    const s = soc.filter((r) => r.alerte_qualite); const k = cen.filter((r) => r.alerte_qualite);
    return {
      texte: `${pl(s.length + k.length, 'ligne')} du personnel ${s.length + k.length > 1 ? 'portent' : 'porte'} une alerte qualité. Je vous affiche le détail.`,
      carte: { titre: 'Alertes qualité des listes RH', sousTitre: sources,
        stats: [{ label: 'Société', valeur: nb(s.length) }, { label: 'Centres', valeur: nb(k.length) }],
        sections: [
          ...(s.length ? [{ titre: 'Effectif société', colonnes: ['Matricule', 'Nom', 'Prénom', 'Alerte'], lignes: s.slice(0, MAX_LIGNES).map((r) => [v(r.matricule), v(r.nom), v(r.prenom), v(r.alerte_qualite)]), total: s.length }] : []),
          ...(k.length ? [{ titre: 'Personnel des centres', colonnes: ['Matricule', 'Nom complet', 'Centre', 'Alerte'], lignes: k.slice(0, MAX_LIGNES).map((r) => [v(r.matricule), v(r.nom_complet), v(r.centre), v(r.alerte_qualite)]), total: k.length }] : []),
        ] },
    };
  }

  /* 3) Répartition « par … » */
  const par = q.match(/par (pole|service|categorie|emploi|fonction|direction|dr|centre|cf|centre de frais)/)?.[1];
  if (par) {
    const defs: Record<string, { rows: Rows; f: (r: any) => unknown; nom: string }> = {
      pole: { rows: soc, f: (r) => r.pole, nom: 'pôle' },
      service: { rows: soc, f: (r) => r.service, nom: 'service' },
      categorie: { rows: [...soc, ...cen], f: (r) => r.categorie, nom: 'catégorie' },
      emploi: { rows: soc, f: (r) => r.emploi, nom: 'emploi' },
      fonction: { rows: cen, f: (r) => r.fonction, nom: 'fonction (centres)' },
      direction: { rows: cen, f: (r) => r.direction_regionale, nom: 'direction régionale' },
      dr: { rows: cen, f: (r) => r.direction_regionale, nom: 'direction régionale' },
      centre: { rows: cen, f: (r) => (r.est_staff_dr ? `Staff ${r.direction_regionale ?? 'DR'}` : r.centre), nom: 'centre' },
      cf: { rows: soc, f: (r) => r.cf, nom: 'centre de frais' },
      'centre de frais': { rows: soc, f: (r) => r.cf, nom: 'centre de frais' },
    };
    const d = defs[par];
    const g = grouper(d.rows, d.f);
    return {
      texte: `Répartition par ${d.nom} : ${liste(g.slice(0, 4).map((x) => `${x.label} ${x.valeur}`))}${g.length > 4 ? `, et ${g.length - 4} autres` : ''}. Le détail est dans la fiche.`,
      carte: { titre: `Effectif par ${d.nom}`, sousTitre: sources,
        stats: [{ label: 'Total', valeur: nb(d.rows.length) }, { label: 'Groupes', valeur: nb(g.length) }],
        barres: [{ titre: `Agents par ${d.nom}`, items: g.slice(0, 30) }],
        sections: [{ titre: 'Tableau', colonnes: [cap(d.nom), 'Agents', 'Part'], lignes: g.map((x) => [x.label, nb(x.valeur), pct(x.valeur, d.rows.length)]), total: g.length }] },
    };
  }

  /* 4) Filtre sur une valeur citée (pôle, service, emploi, catégorie, centre, DR, fonction) */
  type Cand = { champ: string; libelle: string; val: string; rows: Rows; source: 'soc' | 'cen' };
  const cands: Cand[] = [];
  const ajouter = (rows: Rows, champ: string, libelle: string, source: 'soc' | 'cen') => {
    new Set(rows.map((r) => String(r[champ] ?? '').trim())).forEach((val) => {
      const k = norm(val).trim();
      if (k.length < 3 || /^(non|autre|divers|n a)$/.test(k)) return;
      const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|x)?([^a-z]|$)`);
      if (re.test(q)) cands.push({ champ, libelle, val, rows: rows.filter((r) => String(r[champ] ?? '').trim() === val), source });
    });
  };
  ajouter(cen, 'centre', 'centre', 'cen');
  ajouter(cen, 'direction_regionale', 'direction régionale', 'cen');
  ajouter(cen, 'fonction', 'fonction', 'cen');
  ajouter(soc, 'service', 'service', 'soc');
  ajouter(soc, 'pole', 'pôle', 'soc');
  ajouter(soc, 'emploi', 'emploi', 'soc');
  ajouter(soc, 'categorie', 'catégorie', 'soc');
  ajouter(cen, 'categorie', 'catégorie', 'cen');
  if (cands.length) {
    const best = Math.max(...cands.map((x) => norm(x.val).length));
    const choix = cands.filter((x) => norm(x.val).length === best);
    const s = choix.filter((x) => x.source === 'soc').flatMap((x) => x.rows);
    const k = choix.filter((x) => x.source === 'cen').flatMap((x) => x.rows);
    const lib = `${choix[0].libelle} « ${choix[0].val} »`;
    const barres = [
      ...(s.length ? [{ titre: 'Par emploi', items: grouper(s, (r) => r.emploi).slice(0, 12) }] : []),
      ...(k.length ? [{ titre: 'Par fonction', items: grouper(k, (r) => r.fonction).slice(0, 12) }] : []),
    ];
    return {
      texte: `${cap(lib)} : ${pl(s.length + k.length, 'agent')}. Je vous affiche la liste.`,
      carte: { titre: cap(lib), sousTitre: sources,
        stats: [{ label: 'Agents', valeur: nb(s.length + k.length) }, ...grouper([...s, ...k], (r) => r.categorie).slice(0, 3).map((x) => ({ label: x.label, valeur: nb(x.valeur) }))],
        barres, sections: [...(s.length ? [sectionSoc(s)] : []), ...(k.length ? [sectionCen(k)] : [])], note: note(s.length, k.length) },
    };
  }

  /* 5) Recherche par nom */
  const mots = q.split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
  if (mots.length) {
    const nomSoc = (r: any) => ` ${norm(`${r.nom ?? ''} ${r.prenom ?? ''}`)} `;
    const nomCen = (r: any) => ` ${norm(r.nom_complet)} `;
    const tous = (txt: string) => mots.every((m) => txt.includes(` ${m} `));
    const un = (txt: string) => mots.some((m) => txt.includes(` ${m} `));
    let s = soc.filter((r) => tous(nomSoc(r))); let k = cen.filter((r) => tous(nomCen(r)));
    if (!s.length && !k.length) { s = soc.filter((r) => un(nomSoc(r))); k = cen.filter((r) => un(nomCen(r))); }
    if (s.length || k.length) {
      const n = s.length + k.length;
      const premier = s[0] ? `${s[0].prenom ?? ''} ${s[0].nom ?? ''}`.trim() : k[0]?.nom_complet;
      return {
        texte: n === 1 ? `J’ai trouvé ${premier}. Je vous affiche sa fiche.` : `J’ai trouvé ${pl(n, 'agent')} correspondant à « ${mots.join(' ')} ». Je vous affiche la liste.`,
        carte: { titre: n === 1 ? String(premier) : `Recherche « ${mots.join(' ')} »`, sousTitre: sources,
          stats: n === 1
            ? (s[0] ? [{ label: 'Matricule', valeur: v(s[0].matricule) }, { label: 'Emploi', valeur: v(s[0].emploi) }, { label: 'Service', valeur: v(s[0].service) }, { label: 'Pôle', valeur: v(s[0].pole) }]
              : [{ label: 'Matricule', valeur: v(k[0].matricule) }, { label: 'Fonction', valeur: v(k[0].fonction) }, { label: 'Centre', valeur: v(k[0].centre) }, { label: 'Contact', valeur: v(k[0].contact) }])
            : [{ label: 'Résultats', valeur: nb(n) }],
          sections: [...(s.length ? [sectionSoc(s)] : []), ...(k.length ? [sectionCen(k)] : [])], note: note(s.length, k.length) },
      };
    }
    if (/qui est|fiche|cherche|trouve|appelle/.test(q)) {
      return { texte: `Je ne trouve aucun agent correspondant à « ${mots.join(' ')} » dans les listes du personnel.` };
    }
  }

  /* 6) Vue d’ensemble */
  const pole = grouper(soc, (r) => r.pole), cat = grouper([...soc, ...cen], (r) => r.categorie), dr = grouper(cen, (r) => r.direction_regionale);
  return {
    texte: `Effectif total : ${pl(soc.length + cen.length, 'agent')}, dont ${nb(soc.length)} dans l’effectif de la société et ${nb(cen.length)} dans les centres de l’intérieur. Premier pôle : ${pole[0] ? `${pole[0].label} (${pole[0].valeur})` : '—'}. Je vous affiche le tableau de bord RH.`,
    briefing,
    carte: { titre: 'Ressources humaines', sousTitre: sources,
      stats: [{ label: 'Effectif total', valeur: nb(soc.length + cen.length) }, { label: 'Société', valeur: nb(soc.length) }, { label: 'Centres de l’intérieur', valeur: nb(cen.length) }, { label: 'Directions régionales', valeur: nb(dr.length) }],
      barres: [
        ...(pole.length ? [{ titre: 'Par pôle', items: pole.slice(0, 12) }] : []),
        ...(cat.length ? [{ titre: 'Par catégorie', items: cat.slice(0, 8) }] : []),
        ...(dr.length ? [{ titre: 'Centres par direction régionale', items: dr.slice(0, 12) }] : []),
      ],
      note: 'Demandez par exemple : « effectif par service », « les chauffeurs », « personnel de Siguiri », « qui est Diallo », « matricule 1234 ».' },
  };
}

async function reseau(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const parts: string[] = [];
  const { data: z } = await db.from('v_seg_reseau_par_zone').select('zone_commerciale, lineaire_total_ml, lineaire_fonte_ml, lineaire_acier_ml, lineaire_pvc_ml');
  if (z?.length) {
    const tot = somme(z, (r) => r.lineaire_total_ml);
    parts.push(`Le réseau de conduites compte ${nb(tot / 1000, 1)} km sur ${pl(z.length, 'zone commerciale', 'zones commerciales')} : ${pct(somme(z, (r) => r.lineaire_pvc_ml), tot, 0)} en PVC, ${pct(somme(z, (r) => r.lineaire_fonte_ml), tot, 0)} en fonte et ${pct(somme(z, (r) => r.lineaire_acier_ml), tot, 0)} en acier.`);
  }
  const { data: r } = await db.from('seg_reservoirs').select('nom, capacite_m3, etat_structure');
  if (r?.length) {
    const etats = new Map<string, number>();
    r.forEach((x) => etats.set(x.etat_structure || 'non renseigné', (etats.get(x.etat_structure || 'non renseigné') ?? 0) + 1));
    parts.push(`${pl(r.length, 'réservoir')}, pour une capacité totale de ${m3(somme(r, (x) => x.capacite_m3))}. État des structures : ${liste([...etats.entries()].map(([k, v]) => `${k} ${v}`))}.`);
  }
  return { texte: parts.join(' ') || 'Aucune donnée réseau n’est disponible.' };
}

async function evenements(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data, error } = await db.from('seg_evenements_terrain')
    .select('titre, nature, centre_nom, gravite, statut, date_debut, impact_m3').order('date_debut', { ascending: false }).limit(200);
  if (error) throw error;
  const ouverts = (data ?? []).filter((e) => !estClos(e.statut));
  if (!ouverts.length) return { texte: 'Aucun incident terrain ouvert.', briefing: 'Aucun incident terrain ouvert.' };
  const graves = ouverts.filter((e) => /critique|elev|haute|majeur/.test(norm(e.gravite)));
  const t = `${pl(ouverts.length, 'incident terrain ouvert', 'incidents terrain ouverts')}, dont ${pl(graves.length, 'grave')}. Les plus récents : ${liste(ouverts.slice(0, 4).map((e) => `${e.titre}${e.centre_nom ? ` à ${e.centre_nom}` : ''}`))}.`;
  return { texte: t, briefing: `${pl(ouverts.length, 'incident terrain ouvert', 'incidents terrain ouverts')}, dont ${pl(graves.length, 'grave')}.` };
}

async function anomalies(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data, error } = await db.from('seg_anomalies_dg').select('titre, statut, gravite, impact, action, ecart_gnf, corrigee_le').order('ordre', { ascending: true });
  if (error) throw error;
  const ouv = (data ?? []).filter((a) => !a.corrigee_le && !estClos(a.statut));
  if (!ouv.length) return { texte: 'Aucune anomalie de données ouverte.' };
  const ecart = somme(ouv, (a) => a.ecart_gnf);
  const t = `${ouv.length > 1 ? `${ouv.length} anomalies signalées au DG restent ouvertes` : '1 anomalie signalée au DG reste ouverte'}${ecart ? `, pour un écart cumulé de ${gnf(ecart)}` : ''}. Principales : ${liste(ouv.slice(0, 3).map((a) => a.titre))}.`;
  return { texte: t, briefing: `${pl(ouv.length, 'anomalie de données ouverte', 'anomalies de données ouvertes')}.` };
}

async function alertes(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data, error } = await db.from('notifications').select('type, title, created_at').eq('is_read', false)
    .order('severity_score', { ascending: false }).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return { texte: 'Aucune alerte non lue.' };
  const crit = rows.filter((r) => r.type === 'critical');
  return {
    texte: `${pl(rows.length, 'alerte non lue', 'alertes non lues')}, dont ${pl(crit.length, 'critique')}. Les plus importantes : ${liste(rows.slice(0, 3).map((r) => r.title))}.`,
    briefing: `${pl(crit.length, 'alerte critique non lue', 'alertes critiques non lues')}.`,
  };
}

async function agenda(c: Ctx): Promise<Reponse> {
  const { db, userId, q } = c;
  const now = new Date();
  const demain = /demain/.test(q);
  const debut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (demain ? 1 : 0)));
  const fin = new Date(debut.getTime() + (/semaine/.test(q) ? 7 : 1) * 86_400_000);
  const { data } = await db.from('calendar_events').select('title, location, starts_at, all_day')
    .eq('owner_id', userId).gte('starts_at', debut.toISOString()).lt('starts_at', fin.toISOString()).order('starts_at');
  const quand = /semaine/.test(q) ? 'cette semaine' : demain ? 'demain' : 'aujourd’hui';
  if (!data?.length) return { texte: `Aucun rendez-vous ${quand}.` };
  const h = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: /semaine/.test(q) ? 'long' : undefined, hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Conakry' });
  return { texte: `Votre agenda ${quand} : ` + data.map((e) => `${e.all_day ? 'toute la journée' : h(e.starts_at)}, ${e.title}${e.location ? `, à ${e.location}` : ''}`).join(' ; ') + '.', briefing: `${pl(data.length, 'rendez-vous', 'rendez-vous')} ${quand}.` };
}

async function qualite(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data: imp } = await db.from('data_imports').select('file_name, imported_at, status').order('imported_at', { ascending: false }).limit(1);
  const { count } = await db.from('data_quality_issues').select('id', { count: 'exact', head: true }).eq('resolved', false);
  const i = imp?.[0];
  return { texte: `${i ? `Dernier import : ${i.file_name}, le ${dateFr(i.imported_at)} (${i.status}). ` : ''}${pl(count ?? 0, 'problème', 'problèmes')} de qualité de données non résolus.` };
}

async function situationDR(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('seg_situation_dr').select('date_rapport').order('date_rapport', { ascending: false }).limit(1);
  const d = last?.[0]?.date_rapport;
  if (!d) return { texte: 'Aucune situation des directions régionales n’est enregistrée.' };
  const { data } = await db.from('seg_situation_dr').select('dr, rubrique, centre').eq('date_rapport', d);
  const rows = data ?? [];
  const drs = Array.from(new Set(rows.map((r) => String(r.dr ?? ''))));
  const vise = drs.find((x) => x && q.includes(norm(x)));
  if (vise) {
    const l = rows.filter((r) => r.dr === vise);
    return { texte: `Situation de la DR ${vise} au ${dateFr(d)} : ${pl(l.length, 'ligne')}, rubriques ${liste(Array.from(new Set(l.map((r) => r.rubrique))).slice(0, 5))}. Le détail est sur la page Situation DR.` };
  }
  return { texte: `Situation des directions régionales au ${dateFr(d)} : ${drs.length} DR renseignées (${liste(drs)}).` };
}

/* ---------- Aiguillage ---------- */
/* =====================================================================
   SEGE — modules complémentaires (toutes les pages du dashboard)
   ===================================================================== */

export type Lien = { label: string; href: string };

/* Plan du dashboard : chaque page, ce qu'elle montre, les mots qui y mènent */
export const PAGES: { href: string; titre: string; desc: string; mots: RegExp }[] = [
  { href: '/', titre: 'Tableau de bord', desc: 'les 6 indicateurs clés, la facturation des centres, la carte et la production', mots: /tableau de bord|accueil|page d accueil|dashboard|indicateurs cles/ },
  { href: '/journal', titre: 'Journal du DG', desc: 'les problèmes en cours, la carte animée et la lecture vocale', mots: /journal/ },
  { href: '/notifications', titre: 'Centre de notifications', desc: 'les alertes critiques et avertissements', mots: /notification|alerte/ },
  { href: '/vue-nationale', titre: 'Vue Nationale', desc: 'la situation nationale, la carte des régions, les agences et la comparaison annuelle', mots: /vue nationale|national|regions?|carte nationale/ },
  { href: '/territoire', titre: 'Carte interactive', desc: 'la carte des agences et des sites', mots: /carte interactive|territoire|carte des agences/ },
  { href: '/agences', titre: 'Agences & Centres', desc: 'la liste et la performance des agences', mots: /agences?( et| &)? centres|liste des agences|les agences/ },
  { href: '/centres', titre: 'Centres de l’intérieur', desc: 'les problèmes techniques urgents des centres', mots: /centres? de l interieur|centres? en (arret|difficulte)|problemes? (des|techniques)/ },
  { href: '/incidents', titre: 'Incidents & Signalements', desc: 'les incidents terrain déclarés', mots: /incidents?|signalements?|evenements? terrain/ },
  { href: '/exploitation', titre: 'Production & Réservoirs', desc: 'la production, la distribution, les réservoirs et le bilan hydrique', mots: /exploitation|reservoirs?|bilan hydrique|production (et|&) reservoirs/ },
  { href: '/kpi/production', titre: 'Production (détail)', desc: 'la production mensuelle par site et par ville', mots: /production mensuelle|production par (site|ville)|detail de la production/ },
  { href: '/kpi/realisation-production', titre: 'Réalisation Production', desc: 'le taux de réalisation des 44 sites de production', mots: /realisation|capacite des sites|taux de realisation/ },
  { href: '/tableau-technique', titre: 'Tableau de bord technique', desc: 'le gasoil, le rendement des stations et l’eau traitée par centre', mots: /tableau (de bord )?technique|technique|gasoil|rendement des stations/ },
  { href: '/kpi/approvisionnement', titre: 'Approvisionnement', desc: 'les demandes et livraisons de gasoil et de produits chimiques', mots: /approvisionnement|livraisons?|demandes? de produits/ },
  { href: '/reseau', titre: 'Réseau & Fuites', desc: 'le linéaire de conduites par zone et par matériau', mots: /reseau|fuites?|conduites?/ },
  { href: '/commercial', titre: 'Facturation & Paiements', desc: 'la facturation, les encaissements et les paiements', mots: /commercial|facturation|paiements?/ },
  { href: '/kpi/chiffre-affaires', titre: 'Chiffre d’affaires', desc: 'le chiffre d’affaires mensuel', mots: /chiffre d affaires/ },
  { href: '/kpi/volume-facture', titre: 'Volume facturé', desc: 'les volumes facturés', mots: /volumes? factures?/ },
  { href: '/kpi/abonnes', titre: 'Abonnés', desc: 'le nombre d’abonnés facturés', mots: /abonnes?/ },
  { href: '/kpi/recouvrement', titre: 'Recouvrement', desc: 'le taux de recouvrement', mots: /recouvrement/ },
  { href: '/kpi/impayes', titre: 'Impayés', desc: 'le solde des impayés', mots: /impayes?$|les impayes|solde des impayes/ },
  { href: '/kpi/impayes-agences', titre: 'Impayés par agence', desc: 'les impayés par agence et par zone', mots: /impayes? par (agence|zone)|etat des impayes/ },
  { href: '/stocks', titre: 'Stocks & Magasins', desc: 'les inventaires, les ruptures et la valeur des stocks', mots: /stocks?|magasins?|inventaires?|ruptures?/ },
  { href: '/rh', titre: 'Ressources Humaines', desc: 'l’effectif de la société et le personnel des centres', mots: /ressources humaines|\brh\b|effectifs?|personnel/ },
  { href: '/analyses', titre: 'Rapports & Analyses', desc: 'les rapports et analyses', mots: /rapports?|analyses?/ },
  { href: '/documents', titre: 'Documents & Archives', desc: 'les documents enregistrés et archivés', mots: /documents?|archives?/ },
  { href: '/import', titre: 'Import des données', desc: 'l’import des fichiers Excel', mots: /importer|import des donnees|charger un fichier/ },
  { href: '/import/history', titre: 'Historique des imports', desc: 'la liste des fichiers importés', mots: /historique des imports|fichiers importes/ },
  { href: '/import/quality', titre: 'Qualité des données', desc: 'les anomalies détectées dans les fichiers', mots: /qualite des donnees|anomalies? (des|de) (fichiers|donnees)/ },
  { href: '/users', titre: 'Gestion des utilisateurs', desc: 'les comptes utilisateurs', mots: /utilisateurs?|comptes?/ },
  { href: '/roles', titre: 'Rôles & Permissions', desc: 'les rôles et leurs droits', mots: /roles?|permissions?|droits/ },
  { href: '/audit', titre: 'Journal d’audit', desc: 'l’historique des actions dans le dashboard', mots: /audit|historique des actions|tracabilite/ },
  { href: '/profile', titre: 'Mon profil', desc: 'votre profil et votre mot de passe', mots: /mon profil|mot de passe|ma photo/ },
];

const LIENS_MODULE: Record<string, string[]> = {
  centres: ['/centres', '/journal'], production: ['/kpi/production', '/exploitation'], realisation: ['/kpi/realisation-production'],
  gasoil: ['/tableau-technique'], approvisionnement: ['/kpi/approvisionnement'], facturation: ['/kpi/chiffre-affaires', '/commercial'],
  recouvrement: ['/kpi/recouvrement'], impayes: ['/kpi/impayes-agences'], tresorerie: ['/commercial'], stocks: ['/stocks'], rh: ['/rh'],
  reseau: ['/reseau', '/exploitation'], evenements: ['/incidents'], anomalies: ['/vue-nationale'], alertes: ['/notifications'],
  qualite: ['/import/quality'], situationDR: ['/centres'], documents: ['/documents'], utilisateurs: ['/users', '/roles'], audit: ['/audit'],
  imports: ['/import/history'], distribution: ['/exploitation'], abonnes: ['/kpi/abonnes'], agenda: [],
};
const SUIVANTES: Record<string, string[]> = {
  centres: ['Centres à l’arrêt', 'Manque de carburant', 'Le problème le plus ancien'],
  production: ['Taux de réalisation', 'Production par ville', 'Distribution par agence'],
  realisation: ['Réalisation Grand Conakry', 'Taux de réalisation des centres', 'Yessouloun'],
  facturation: ['Taux de recouvrement', 'Impayés par agence', 'Abonnés'],
  recouvrement: ['Impayés par agence', 'Trésorerie'], impayes: ['Taux de recouvrement', 'Chiffre d’affaires du mois'],
  tresorerie: ['Encaissements par agence', 'Taux de recouvrement'], stocks: ['Stock de sulfate', 'Approvisionnement'],
  rh: ['Effectif par service', 'Effectif par pôle', 'Personnel des centres'], gasoil: ['Approvisionnement', 'Centres à l’arrêt'],
  approvisionnement: ['Gasoil par centre', 'Stocks en rupture'], reseau: ['Réservoirs', 'Production d’eau'],
  evenements: ['Alertes', 'Centres à l’arrêt'], alertes: ['Incidents terrain', 'Point général'],
  utilisateurs: ['Journal d’audit'], documents: ['Historique des imports'],
};
const lien = (href: string): Lien | null => { const p = PAGES.find((x) => x.href === href); return p ? { label: p.titre, href } : null; };

async function documents(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data, count } = await db.from('documents').select('title, category, status, document_date, is_archived', { count: 'exact' })
    .order('document_date', { ascending: false, nullsFirst: false }).limit(200);
  const rows = data ?? [];
  if (!rows.length) return { texte: 'Aucun document n’est enregistré.' };
  const mots = q.split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !/document|archive|liste|trouve|cherche/.test(m));
  const trouves = mots.length ? rows.filter((d) => mots.some((m) => norm(d.title).includes(m) || norm(d.category).includes(m))) : [];
  if (trouves.length) return { texte: `${pl(trouves.length, 'document trouvé', 'documents trouvés')} : ${liste(trouves.slice(0, 5).map((d) => `${d.title}${d.document_date ? ` (${dateFr(d.document_date)})` : ''}`))}.` };
  const cat = new Map<string, number>(); rows.forEach((d) => cat.set(d.category || 'Divers', (cat.get(d.category || 'Divers') ?? 0) + 1));
  return { texte: `${pl(count ?? rows.length, 'document')} dans « Documents & Archives », dont ${pl(rows.filter((d) => d.is_archived).length, 'archivé')}. Catégories : ${liste([...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`))}. Le plus récent : ${rows[0].title}.` };
}

async function utilisateurs(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data: p } = await db.from('profiles').select('status, role_id, last_login_at');
  const { data: r } = await db.from('roles').select('id, name');
  const rows = p ?? [];
  const nomRole = new Map((r ?? []).map((x) => [x.id, x.name]));
  const parRole = new Map<string, number>(); rows.forEach((x) => { const k = nomRole.get(x.role_id) ?? 'Sans rôle'; parRole.set(k, (parRole.get(k) ?? 0) + 1); });
  const actifs = rows.filter((x) => /actif|active/.test(norm(x.status))).length;
  const semaine = rows.filter((x) => x.last_login_at && Date.now() - new Date(x.last_login_at).getTime() < 7 * 86_400_000).length;
  return { texte: `${pl(rows.length, 'compte utilisateur', 'comptes utilisateurs')}, dont ${nb(actifs)} actifs et ${pl(semaine, 'connecté', 'connectés')} ces 7 derniers jours. Par rôle : ${liste([...parRole.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`))}.` };
}

async function audit(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data } = await db.from('audit_logs').select('action, description, result, created_at').order('created_at', { ascending: false }).limit(5);
  if (!data?.length) return { texte: 'Le journal d’audit est vide.' };
  return { texte: 'Dernières actions enregistrées : ' + data.map((a) => `${new Date(a.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Conakry' })}, ${a.description || a.action}`).join(' ; ') + '.' };
}

async function imports(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data } = await db.from('data_imports').select('file_name, imported_at, status, rows_count, anomalies_count').order('imported_at', { ascending: false }).limit(5);
  if (!data?.length) return { texte: 'Aucun fichier importé.' };
  return { texte: 'Derniers fichiers importés : ' + data.map((i) => `${i.file_name} le ${dateFr(i.imported_at)} (${nb(n(i.rows_count))} lignes${n(i.anomalies_count) ? `, ${pl(n(i.anomalies_count), 'anomalie')}` : ''})`).join(' ; ') + '.' };
}

async function distribution(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('v_seg_distribution_agences_part').select('exercice, mois').order('exercice', { ascending: false }).order('mois', { ascending: false }).limit(1);
  const p = last?.[0];
  if (!p) return { texte: 'Aucune donnée de distribution par agence.' };
  const { data } = await db.from('v_seg_distribution_agences_part').select('agence_nom, volume_m3, part_distribution').eq('exercice', p.exercice).eq('mois', p.mois);
  const rows = (data ?? []).sort((a, b) => n(b.volume_m3) - n(a.volume_m3));
  const vise = rows.find((r) => q.includes(norm(r.agence_nom)));
  const part = (v: unknown) => { const x = n(v); return `${nb(x <= 1.5 ? x * 100 : x, 1)} %`; };
  if (vise) return { texte: `${vise.agence_nom}, ${periode(p.exercice, p.mois)} : ${m3(n(vise.volume_m3))} distribués, soit ${part(vise.part_distribution)} de la distribution de Conakry.` };
  return { texte: `Distribution de ${periode(p.exercice, p.mois)} à Conakry : ${m3(somme(rows, (r) => r.volume_m3))}. Premières agences : ${liste(rows.slice(0, 4).map((r) => `${r.agence_nom} (${part(r.part_distribution)})`))}.` };
}

async function villes(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('seg_production_villes_mensuelle').select('exercice, mois').order('exercice', { ascending: false }).order('mois', { ascending: false }).limit(1);
  const p = last?.[0];
  if (!p) return { texte: 'Aucune production par ville enregistrée.' };
  const { data } = await db.from('seg_production_villes_mensuelle').select('ville_nom, volume_eau_traitee_m3').eq('exercice', p.exercice).eq('mois', p.mois);
  const rows = (data ?? []).filter((r) => !estTotal(r.ville_nom)).sort((a, b) => n(b.volume_eau_traitee_m3) - n(a.volume_eau_traitee_m3));
  const vise = rows.find((r) => q.includes(norm(r.ville_nom)));
  if (vise) return { texte: `${vise.ville_nom}, ${periode(p.exercice, p.mois)} : ${m3(n(vise.volume_eau_traitee_m3))} d’eau traitée.` };
  return { texte: `Production d’eau traitée par ville en ${periode(p.exercice, p.mois)} : ${liste(rows.slice(0, 6).map((r) => `${r.ville_nom} ${m3(n(r.volume_eau_traitee_m3))}`))}.` };
}

async function reservoirs(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data } = await db.from('seg_reservoirs').select('nom, code_ouvrage, localisation, capacite_m3, etat_structure, volume_moyen_journalier_m3, station_chloration, annee_mise_en_service');
  const rows = data ?? [];
  const vise = rows.find((r) => r.nom && q.includes(norm(r.nom))) || rows.find((r) => r.localisation && norm(r.localisation).length > 3 && q.includes(norm(r.localisation)));
  if (vise) return { texte: `Réservoir ${vise.nom}${vise.localisation ? ` (${vise.localisation})` : ''} : capacité ${nb(n(vise.capacite_m3))} m³${vise.volume_moyen_journalier_m3 ? `, ${nb(n(vise.volume_moyen_journalier_m3))} m³ par jour en moyenne` : ''}${vise.annee_mise_en_service ? `, en service depuis ${vise.annee_mise_en_service}` : ''}. État : ${String(vise.etat_structure ?? 'non renseigné').split('\n')[0]}.` };
  return reseau(c);
}

async function abonnes(c: Ctx): Promise<Reponse> {
  const { db } = c;
  const { data: last } = await db.from('facturation_monthly').select('period_month').order('period_month', { ascending: false }).limit(1);
  const pm = last?.[0]?.period_month;
  let t = '';
  if (pm) {
    const rows = await tout((f, to) => db.from('facturation_monthly').select('subscribers_total').eq('period_month', pm).range(f, to));
    t += `Conakry : ${nb(somme(rows, (r) => r.subscribers_total))} abonnés facturés en ${periodeDate(pm)}. `;
  }
  const { data: lc } = await db.from('seg_facturation_centres_mensuelle').select('exercice, mois').order('exercice', { ascending: false }).order('mois', { ascending: false }).limit(1);
  if (lc?.[0]) {
    const rows = await tout((f, to) => db.from('seg_facturation_centres_mensuelle').select('categorie, agence_nom, abonnes_factures').eq('exercice', lc[0].exercice).eq('mois', lc[0].mois).range(f, to));
    t += `Centres de l’intérieur : ${nb(somme(rows.filter((r) => !estTotal(r.categorie) && !estTotal(r.agence_nom)), (r) => r.abonnes_factures))} abonnés facturés en ${periode(lc[0].exercice, lc[0].mois)}.`;
  }
  return { texte: t.trim() || 'Aucune donnée d’abonnés.' };
}

async function financeAgence(c: Ctx): Promise<Reponse> {
  const { db, q } = c;
  const { data: last } = await db.from('v_seg_finance_agency_monthly').select('exercise, month').order('exercise', { ascending: false }).order('month', { ascending: false }).limit(1);
  const p = last?.[0];
  if (!p) return tresorerie(c);
  const { data } = await db.from('v_seg_finance_agency_monthly').select('agency_name_source, encaissements_total, versements_total, ecart_especes, ecart_cheques').eq('exercise', p.exercise).eq('month', p.month);
  const rows = (data ?? []).filter((r) => !estTotal(r.agency_name_source));
  const vise = rows.find((r) => q.includes(norm(r.agency_name_source)));
  if (vise) return { texte: `${vise.agency_name_source}, ${periode(p.exercise, p.month)} : ${gnf(n(vise.encaissements_total))} encaissés, ${gnf(n(vise.versements_total))} versés, écart ${gnf(n(vise.ecart_especes) + n(vise.ecart_cheques))}.` };
  const top = rows.sort((a, b) => (n(b.ecart_especes) + n(b.ecart_cheques)) - (n(a.ecart_especes) + n(a.ecart_cheques))).slice(0, 3);
  return { texte: `Encaissements par agence en ${periode(p.exercise, p.month)} : ${liste(rows.slice().sort((a, b) => n(b.encaissements_total) - n(a.encaissements_total)).slice(0, 4).map((r) => `${r.agency_name_source} ${gnf(n(r.encaissements_total))}`))}. Plus gros écarts de versement : ${liste(top.map((r) => `${r.agency_name_source} (${gnf(n(r.ecart_especes) + n(r.ecart_cheques))})`))}.` };
}

/* ---------- Aiguillage ---------- */
const MODULES: { re: RegExp; f: (c: Ctx) => Promise<Reponse>; nom: string }[] = [
  { nom: 'agenda', re: /agenda|rendez|reunion|programme|calendrier/, f: agenda },
  { nom: 'impayes', re: /impaye|creance|dette|arriere/, f: impayes },
  { nom: 'recouvrement', re: /recouvr|taux de paiement/, f: recouvrement },
  { nom: 'abonnes', re: /abonne/, f: abonnes },
  { nom: 'facturation', re: /factur|chiffre d affaire|\bca\b|vente|client/, f: facturation },
  { nom: 'tresorerie', re: /encaissements? par agence|versements? par agence|ecarts? de versement/, f: financeAgence },
  { nom: 'tresorerie', re: /tresor|caisse|encaissement|versement|banque|orange money|finance|argent/, f: tresorerie },
  { nom: 'approvisionnement', re: /approvision|demande d|besoin en|commande|sulfate (demande|commande)|chaux|hth|carbonate/, f: approvisionnement },
  { nom: 'gasoil', re: /gasoil|gazoil|carburant.*(stock|consom|livr)|consommation de carburant|gasoil par centre/, f: gasoil },
  { nom: 'stocks', re: /stock|magasin|rupture|inventaire|article|piece/, f: stocks },
  { nom: 'rh', re: /effectif|personnel|agent|employe|salarie|\brh\b|ressources humaines|recrut|matricule|qui est|fiche de|cherche|chauffeur|cadre|technicien|ingenieur|comptable|par (pole|service|categorie|emploi|fonction|direction|dr\b)/, f: rh },
  { nom: 'realisation', re: /realisation|taux de production|capacite de production|objectif annuel|prevision|station|site de production|yessouloun|kakimbo|sonfonia|kaporo|bassia|kobaya|donka|nongo|madina|captage/, f: realisation },
  { nom: 'distribution', re: /distribution par agence|volume distribue|distribue par/, f: distribution },
  { nom: 'production', re: /production par ville|par ville/, f: villes },
  { nom: 'production', re: /production|volume produit|m3|metre cube|eau traitee|distribu|rendement/, f: production },
  { nom: 'reseau', re: /reservoir|chateau/, f: reservoirs },
  { nom: 'reseau', re: /reseau|conduite|canalisation|lineaire/, f: reseau },
  { nom: 'evenements', re: /incident|evenement|signalement|terrain|intervention/, f: evenements },
  { nom: 'anomalies', re: /anomalie|incoheren|ecart de donn/, f: anomalies },
  { nom: 'alertes', re: /alerte|notification/, f: alertes },
  { nom: 'qualite', re: /qualite des donn/, f: qualite },
  { nom: 'imports', re: /dernier import|historique des imports|fichiers? importes?|imports? de/, f: imports },
  { nom: 'documents', re: /document|archive/, f: documents },
  { nom: 'utilisateurs', re: /utilisateur|compte|connecte|role/, f: utilisateurs },
  { nom: 'audit', re: /audit|derniere action|qui a modifie|historique des actions/, f: audit },
  { nom: 'situationDR', re: /situation dr|direction regionale|\bdr\b/, f: situationDR },
  { nom: 'centres', re: /centre|arret|perturb|carburant|panne|fuite|chimique|edg|interieur|probleme/, f: centres },
];

const AIDE = 'Je suis Sege, l’assistante du Directeur Général. Je gère votre agenda (« fixe une réunion demain à 10 h », « mes rendez-vous de la semaine », « déplace… », « annule… ») et je vous préviens avant chaque rendez-vous. Je pilote la carte nationale (« montre Kankan sur la carte », « affiche la région de Labé », « zoome », « dézoome »). Je parcours aussi toutes les pages du dashboard : situation générale, centres de l’intérieur, production et taux de réalisation, gasoil et approvisionnements, facturation, abonnés, recouvrement, impayés, trésorerie, stocks, ressources humaines, réseau et réservoirs, incidents, anomalies, alertes, documents, imports, utilisateurs, audit et votre agenda. Je peux aussi ouvrir une page pour vous, par exemple : « ouvre les stocks ».';

async function briefing(c: Ctx): Promise<string> {
  const horsJournal = /hors centres/.test(c.q);
  const ordre = horsJournal
    ? [production, realisation, facturation, recouvrement, impayes, tresorerie, stocks, evenements, anomalies, alertes]
    : [centres, production, realisation, facturation, recouvrement, impayes, tresorerie, stocks, evenements, anomalies, alertes];
  const res = await Promise.all(ordre.map((f) => f(c).then((r) => r.briefing).catch(() => undefined)));
  const lignes = res.filter(Boolean) as string[];
  return lignes.length ? lignes.join(' ') : 'Les données du dashboard ne sont pas disponibles pour le moment.';
}

export type ReponseSege = { texte: string; carte?: Carte; liens?: Lien[]; naviguer?: string; suivantes?: string[] };

function pagesPour(q: string) {
  const score = PAGES.map((p) => ({ p, s: (q.match(new RegExp(p.mots.source, 'g')) ?? []).length + (q.includes(norm(p.titre)) ? 2 : 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return score.map((x) => x.p);
}

export async function repondre(db: SupabaseClient, userId: string, question: string): Promise<ReponseSege> {
  const r = await repondreInterne(db, userId, question);
  return typeof r === 'string' ? { texte: r } : r;
}

async function repondreInterne(db: SupabaseClient, userId: string, question: string): Promise<string | ReponseSege> {
  const q = norm(question).replace(/[-_?!.,;:«»"]/g, ' ').trim().replace(/\s+/g, ' ');
  if (!q) return AIDE;

  /* Identité, politesse, heure */
  if (/qui es tu|tu es qui|comment tu t appelles|ton nom|c est quoi sege|presente toi/.test(q)) {
    return { texte: 'Je suis Sege, l’assistante du Directeur Général de la SEG. Je lis toutes les données du dashboard pour vous répondre, je vous ouvre les pages et je vous lis le journal à voix haute.', suivantes: ['Point général', 'Que sais-tu faire ?'] };
  }
  if (/^(merci|super|parfait|tres bien|d accord|ok)\b/.test(q)) return { texte: 'Avec plaisir, Monsieur le Directeur Général.' };
  if (/quelle heure|quel jour|on est le combien|date d aujourd hui/.test(q)) {
    return { texte: `Nous sommes le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Conakry' })}, il est ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Conakry' })}.` };
  }

  /* Navigation : « ouvre les stocks », « va à la vue nationale » */
  if (/^(ouvre|ouvrir|affiche moi la page|affiche la page|va (a|au|aux|sur|dans)|aller (a|au|sur)|emmene moi|amene moi|montre moi la page|navigue|redirige)/.test(q)) {
    const p = pagesPour(q)[0];
    if (p) return { texte: `J’ouvre la page « ${p.titre} ».`, naviguer: p.href, liens: [{ label: p.titre, href: p.href }] };
    return { texte: 'Je n’ai pas trouvé cette page. Dites par exemple « ouvre les stocks » ou « ouvre la vue nationale ».' };
  }
  /* « Où voir… », « quelle page… » */
  if (/^(ou (voir|trouver|est|sont|consulter|puis je)|dans quelle page|quelle page|sur quelle page)/.test(q)) {
    const ps = pagesPour(q).slice(0, 3);
    if (ps.length) return { texte: `Vous trouverez cela dans ${liste(ps.map((p) => `« ${p.titre} » (${p.desc})`))}.`, liens: ps.map((p) => ({ label: p.titre, href: p.href })) };
  }
  if (/quelles pages|liste des pages|plan du dashboard|que contient le dashboard/.test(q)) {
    return { texte: `Le dashboard compte ${PAGES.length} pages. Les principales : ${liste(PAGES.slice(0, 12).map((p) => p.titre))}.`, liens: PAGES.slice(0, 8).map((p) => ({ label: p.titre, href: p.href })) };
  }

  const [ag, ce] = await Promise.all([
    db.from('agencies').select('name').then((r) => (r.data ?? []).map((x) => String(x.name)), () => [] as string[]),
    db.from('centres_problemes').select('centre').limit(500).then((r) => Array.from(new Set((r.data ?? []).map((x) => String(x.centre)))), () => [] as string[]),
  ]);
  const c: Ctx = { db, userId, q, agences: ag.filter((x) => x.length >= 3), centres: ce };

  if (/^(briefing|journal general)$/.test(q) || /hors centres/.test(q) || /point general|situation generale|resume general|synthese generale|quoi de neuf|tour d horizon|^(bonjour|bonsoir|salut)/.test(q)) {
    const intro = /^(bonjour|bonsoir|salut)/.test(q) ? 'Bonjour Monsieur le Directeur Général. ' : '';
    return { texte: intro + await briefing(c), liens: [lien('/vue-nationale'), lien('/')].filter(Boolean) as Lien[], suivantes: ['Centres à l’arrêt', 'Impayés par agence', 'Taux de réalisation'] };
  }
  if (/aide|que sais tu|que peux tu|quoi te demander|tu sais faire/.test(q)) return { texte: AIDE, suivantes: ['Point général', 'Ouvre les stocks', 'Effectif par service'] };

  let trouves = MODULES.filter((m) => m.re.test(q));
  // Une seule entrée par nom de module (la plus précise, déclarée en premier)
  trouves = trouves.filter((m, i) => trouves.findIndex((x) => x.nom === m.nom) === i);
  if (trouves.some((m) => m.nom === 'realisation') && !/arret|perturb|carburant|panne|fuite|probleme|chimique/.test(q)) trouves = trouves.filter((m) => m.nom !== 'centres');
  if (trouves.some((m) => m.nom === 'distribution')) trouves = trouves.filter((m) => m.nom !== 'production');
  if (trouves.some((m) => m.nom === 'abonnes')) trouves = trouves.filter((m) => m.nom !== 'facturation');
  if (!trouves.length && c.centres.some((x) => q.includes(norm(x)))) trouves.push(MODULES.find((m) => m.nom === 'centres')!);
  if (!trouves.length && c.agences.some((x) => q.includes(norm(x)))) trouves.push(MODULES.find((m) => m.nom === 'facturation')!, MODULES.find((m) => m.nom === 'impayes')!);
  if (!trouves.length) {
    if (/resume|synthese|situation|point|bilan/.test(q)) return { texte: await briefing(c) };
    try {
      const r = await rh(c);
      if (r.carte && r.carte.titre !== 'Ressources humaines') return { texte: r.texte, carte: r.carte, liens: [lien('/rh')!] };
    } catch { /* ignoré */ }
    try { const r = await realisation(c); if (!/^Réalisation de la production/.test(r.texte) && !/pas encore chargé/.test(r.texte)) return { texte: r.texte, liens: [lien('/kpi/realisation-production')!] }; } catch { /* ignoré */ }
    const ps = pagesPour(q).slice(0, 3);
    if (ps.length) return { texte: `Je n’ai pas de réponse chiffrée à cette question, mais ${ps.length > 1 ? 'ces pages en parlent' : 'cette page en parle'} : ${liste(ps.map((p) => `« ${p.titre} »`))}.`, liens: ps.map((p) => ({ label: p.titre, href: p.href })) };
    return { texte: AIDE, suivantes: ['Point général', 'Quelles pages ?'] };
  }

  const rhM = trouves.find((m) => m.nom === 'rh');
  const choisis = rhM && /matricule|qui est|fiche de|cherche|par (pole|service|categorie|emploi|fonction|direction|dr\b)|effectif|personnel|\brh\b|ressources humaines/.test(q) ? [rhM] : trouves.slice(0, 2);
  const out: string[] = [];
  let carte: Carte | undefined;
  const hrefs: string[] = [];
  for (const m of choisis) {
    try { const r = await m.f(c); out.push(r.texte); if (r.carte && !carte) carte = r.carte; }
    catch { out.push(`Les données « ${m.nom} » ne sont pas disponibles pour le moment.`); }
    (LIENS_MODULE[m.nom] ?? []).forEach((h) => { if (!hrefs.includes(h)) hrefs.push(h); });
  }
  const liens = hrefs.map(lien).filter(Boolean).slice(0, 3) as Lien[];
  const suivantes = (SUIVANTES[choisis[0].nom] ?? []).filter((s) => norm(s) !== q).slice(0, 3);
  return { texte: out.join(' '), carte, liens, suivantes };
}
