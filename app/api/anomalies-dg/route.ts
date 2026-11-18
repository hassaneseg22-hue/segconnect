// app/api/anomalies-dg/route.ts
// GET /api/anomalies-dg — journal des anomalies de données + valeurs suspectes détectées à l'import.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function supabaseServeur() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variables Supabase absentes (URL / clé service).");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });

    const sb = supabaseServeur();

    const [anomalies, saisies] = await Promise.all([
      sb.from("seg_anomalies_dg")
        .select("*")
        .order("ordre", { ascending: true })
        .order("constatee_le", { ascending: false }),
      sb.from("facturation_mensuelle")
        .select("zone,agence,mois,categorie,alerte_qualite")
        .not("alerte_qualite", "is", null)
        .order("agence", { ascending: true })
        .order("mois", { ascending: true }),
    ]);

    if (anomalies.error) throw new Error(anomalies.error.message);
    // La table facturation_mensuelle peut être absente sur un autre environnement : non bloquant.
    return NextResponse.json({
      anomalies: anomalies.data ?? [],
      saisies: saisies.error ? [] : saisies.data ?? [],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
