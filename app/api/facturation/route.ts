// app/api/facturation/route.ts
// GET /api/facturation?zone=all|Conakry|Intérieur&periode=cumul|S1|S2&annee=2026
// Agrège la table Supabase `facturation_mensuelle` pour le tableau technique et la carte DG.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

type Ligne = {
  annee: number;
  mois: number;
  zone: "Conakry" | "Intérieur";
  agence: string;
  categorie: string;
  abonnes_factures: number | null;
  volume_consomme: number | null;
  volume_facture: number | null;
  ca_ht: number | null;
  ca_ttc: number | null;
  alerte_qualite: string | null;
  updated_at: string;
};

function supabaseServeur() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Variables Supabase absentes (URL / clé).");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function toutesLesLignes(annee: number): Promise<Ligne[]> {
  const sb = supabaseServeur();
  const pas = 1000; // Supabase renvoie 1000 lignes max par requête
  const lignes: Ligne[] = [];
  for (let debut = 0; ; debut += pas) {
    const { data, error } = await sb
      .from("facturation_mensuelle")
      .select(
        "annee,mois,zone,agence,categorie,abonnes_factures,volume_consomme,volume_facture,ca_ht,ca_ttc,alerte_qualite,updated_at"
      )
      .eq("annee", annee)
      .order("id", { ascending: true })
      .range(debut, debut + pas - 1);
    if (error) throw new Error(error.message);
    lignes.push(...((data ?? []) as Ligne[]));
    if (!data || data.length < pas) break;
  }
  return lignes;
}

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });

    const p = new URL(req.url).searchParams;
    const annee = Number(p.get("annee") || 2026);
    const zone = p.get("zone") || "all";
    const periode = (p.get("periode") || "cumul") as "cumul" | "S1" | "S2";

    const toutes = await toutesLesLignes(annee);

    // Couverture : dernier mois renseigné par zone (sur l'année entière)
    const couverture: Record<string, number> = {};
    for (const l of toutes) {
      if (n(l.ca_ttc) > 0 || n(l.volume_facture) > 0)
        couverture[l.zone] = Math.max(couverture[l.zone] ?? 0, l.mois);
    }
    const maj = toutes.reduce((m, l) => (l.updated_at > m ? l.updated_at : m), "");

    const lignes = toutes.filter(
      (l) =>
        (zone === "all" || l.zone === zone) &&
        (periode === "cumul" || (periode === "S1" ? l.mois <= 6 : l.mois >= 7))
    );

    // KPIs
    let caTtc = 0, caHt = 0, volFact = 0, volCons = 0;
    const agencesSansHt = new Set<string>();
    for (const l of lignes) {
      caTtc += n(l.ca_ttc);
      volFact += n(l.volume_facture);
      volCons += n(l.volume_consomme);
      if (l.ca_ht === null && n(l.ca_ttc) > 0) agencesSansHt.add(l.agence);
      else caHt += n(l.ca_ht);
    }

    // Mensuel (CA TTC et volume par zone)
    const mensuel = Array.from({ length: 12 }, (_, i) => ({
      mois: i + 1, conakry: 0, interieur: 0, volume: 0,
    }));
    for (const l of lignes) {
      const m = mensuel[l.mois - 1];
      if (l.zone === "Conakry") m.conakry += n(l.ca_ttc);
      else m.interieur += n(l.ca_ttc);
      m.volume += n(l.volume_facture);
    }

    // Agences
    const parAgence = new Map<string, {
      agence: string; zone: string; ca_ttc: number; volume_facture: number;
      dernier_mois: number; alertes: number;
    }>();
    for (const l of lignes) {
      const a = parAgence.get(l.agence) ?? {
        agence: l.agence, zone: l.zone, ca_ttc: 0, volume_facture: 0, dernier_mois: 0, alertes: 0,
      };
      a.ca_ttc += n(l.ca_ttc);
      a.volume_facture += n(l.volume_facture);
      if (n(l.ca_ttc) > 0) a.dernier_mois = Math.max(a.dernier_mois, l.mois);
      if (l.alerte_qualite) a.alertes += 1;
      parAgence.set(l.agence, a);
    }
    const agences = [...parAgence.values()]
      .map((a) => ({ ...a, part: caTtc ? a.ca_ttc / caTtc : 0 }))
      .sort((x, y) => y.ca_ttc - x.ca_ttc);

    // Catégories
    const parCat = new Map<string, { categorie: string; ca_ttc: number; volume_facture: number }>();
    for (const l of lignes) {
      const c = parCat.get(l.categorie) ?? { categorie: l.categorie, ca_ttc: 0, volume_facture: 0 };
      c.ca_ttc += n(l.ca_ttc);
      c.volume_facture += n(l.volume_facture);
      parCat.set(l.categorie, c);
    }
    const categories = [...parCat.values()]
      .map((c) => ({
        ...c,
        part: caTtc ? c.ca_ttc / caTtc : 0,
        prix_moyen: c.volume_facture ? c.ca_ttc / c.volume_facture : 0,
      }))
      .sort((x, y) => y.ca_ttc - x.ca_ttc);

    const alertes = lignes
      .filter((l) => l.alerte_qualite)
      .map((l) => ({ agence: l.agence, zone: l.zone, mois: l.mois, categorie: l.categorie, message: l.alerte_qualite }))
      .sort((x, y) => x.agence.localeCompare(y.agence, "fr") || x.mois - y.mois);

    return NextResponse.json({
      filtres: { annee, zone, periode },
      maj,
      couverture,
      kpis: {
        ca_ttc: caTtc,
        ca_ht: caHt,
        agences_sans_ht: [...agencesSansHt],
        volume_facture: volFact,
        volume_consomme: volCons,
        prix_moyen_ttc: volFact ? caTtc / volFact : 0,
        nb_agences: parAgence.size,
        nb_alertes: alertes.length,
      },
      mensuel,
      agences,
      categories,
      alertes,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
