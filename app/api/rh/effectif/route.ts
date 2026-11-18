// app/api/rh/effectif/route.ts
// GET /api/rh/effectif — liste du personnel de toute la société (dernière liste reçue).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ligne = {
  date_reception: string;
  rang: number;
  matricule: string;
  nom: string;
  prenom: string;
  emploi: string;
  categorie: string;
  cf: string;
  service: string;
  pole: string;
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
    const derniere = await sb
      .from("seg_effectif_societe")
      .select("date_reception")
      .order("date_reception", { ascending: false })
      .limit(1);
    if (derniere.error) throw new Error(derniere.error.message);
    const date = derniere.data?.[0]?.date_reception as string | undefined;
    if (!date) return NextResponse.json({ date_reception: null, source_fichier: null, agents: [] });

    const { data, error } = await sb
      .from("seg_effectif_societe")
      .select("date_reception,rang,matricule,nom,prenom,emploi,categorie,cf,service,pole,alerte_qualite,source_fichier")
      .eq("date_reception", date)
      .order("rang", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    const lignes = (data ?? []) as Ligne[];
    return NextResponse.json({
      date_reception: date,
      source_fichier: lignes[0]?.source_fichier ?? null,
      agents: lignes.map((l) => ({
        rang: l.rang,
        matricule: l.matricule,
        nom: l.nom,
        prenom: l.prenom,
        emploi: l.emploi,
        categorie: l.categorie,
        cf: l.cf,
        service: l.service,
        pole: l.pole,
        alerte: l.alerte_qualite,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json({ erreur: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
