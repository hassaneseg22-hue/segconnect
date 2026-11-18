// app/api/rh/personnel/route.ts
// GET /api/rh/personnel — liste du personnel des centres de l'intérieur (dernière liste transmise).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ligne = {
  date_liste: string;
  rang: number;
  direction_regionale: string;
  centre: string;
  est_staff_dr: boolean;
  nom_complet: string;
  matricule: string | null;
  fonction: string;
  categorie: string;
  contact: string | null;
  alerte_qualite: string | null;
  source_fichier: string;
};

function supabaseServeur() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variables Supabase absentes (URL / clé service).");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    // Données personnelles : l'API n'est pas publique.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });

    const sb = supabaseServeur();

    // Dernière liste disponible
    const derniere = await sb
      .from("seg_personnel_centres")
      .select("date_liste")
      .order("date_liste", { ascending: false })
      .limit(1);
    if (derniere.error) throw new Error(derniere.error.message);
    const dateListe = derniere.data?.[0]?.date_liste as string | undefined;
    if (!dateListe) return NextResponse.json({ date_liste: null, source_fichier: null, personnes: [] });

    const { data, error } = await sb
      .from("seg_personnel_centres")
      .select(
        "date_liste,rang,direction_regionale,centre,est_staff_dr,nom_complet,matricule,fonction,categorie,contact,alerte_qualite,source_fichier"
      )
      .eq("date_liste", dateListe)
      .order("rang", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    const lignes = (data ?? []) as Ligne[];
    return NextResponse.json({
      date_liste: dateListe,
      source_fichier: lignes[0]?.source_fichier ?? null,
      personnes: lignes.map((l) => ({
        rang: l.rang,
        dr: l.direction_regionale,
        centre: l.centre,
        estStaffDr: l.est_staff_dr,
        nom: l.nom_complet,
        matricule: l.matricule,
        fonction: l.fonction,
        categorie: l.categorie,
        contact: l.contact,
        alerte: l.alerte_qualite,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
