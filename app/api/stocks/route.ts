import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/*
 * GET /api/stocks
 *
 * Query params (tous optionnels) :
 *   periode   - 'YYYY-MM-DD', défaut : inventaire le plus récent
 *   source    - code d'un stock (ex. MAG-AVIATION) pour filtrer le détail
 *   q         - recherche texte sur le code ou la désignation
 *   etat      - 'bon' | 'obsolete' | 'mauvais' | 'non_renseigne'
 *   rupture   - '1' pour ne garder que les articles en rupture
 *   limit     - défaut 50, max 500
 *   offset    - défaut 0
 *
 * Réponse :
 *   data.periode    - période de l'inventaire retourné
 *   data.synthese   - une ligne par stock (cartes KPI du DG)
 *   data.totaux     - cumul tous stocks confondus
 *   data.alertes    - top articles obsolètes / en rupture / mauvais état
 *   data.detail     - liste paginée, filtrée selon les query params
 *   data.detailTotal- nombre total de lignes correspondant au filtre (pour la pagination)
 */
export async function GET(req: NextRequest) {
  try {
    /*
     * Sécurité :
     * l'API n'est pas publique.
     */
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Non authentifié.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const periodeParam = searchParams.get('periode');
    const sourceParam = searchParams.get('source');
    const qParam = searchParams.get('q')?.trim();
    const etatParam = searchParams.get('etat');
    const ruptureParam = searchParams.get('rupture') === '1';
    const limitParam = Math.min(
      Number(searchParams.get('limit')) || 50,
      500
    );
    const offsetParam = Math.max(
      Number(searchParams.get('offset')) || 0,
      0
    );

    /*
     * Résolution de la période :
     * la plus récente si non précisée.
     */
    let periode = periodeParam;

    if (!periode) {
      const { data: dernier, error: dernierError } = await supabaseAdmin
        .from('stock_inventaires')
        .select('periode')
        .order('periode', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dernierError) {
        console.error('[API /stocks] Supabase error (dernier inventaire):', dernierError);

        return NextResponse.json(
          {
            ok: false,
            error: "Impossible de déterminer la période d'inventaire.",
          },
          { status: 500 }
        );
      }

      if (!dernier) {
        return NextResponse.json(
          {
            ok: true,
            data: {
              periode: null,
              synthese: [],
              totaux: {
                nbArticles: 0,
                nbRuptures: 0,
                nbObsoletes: 0,
                nbMauvaisEtat: 0,
              },
              alertes: [],
              detail: [],
              detailTotal: 0,
            },
          },
          {
            status: 200,
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
          }
        );
      }

      periode = dernier.periode;
    }

    /*
     * Id de l'inventaire correspondant à la période résolue
     * (réutilisé pour les alertes et le détail).
     */
    const { data: inventaire, error: inventaireError } = await supabaseAdmin
      .from('stock_inventaires')
      .select('id')
      .eq('periode', periode)
      .maybeSingle();

    if (inventaireError) {
      console.error('[API /stocks] Supabase error (inventaire):', inventaireError);

      return NextResponse.json(
        {
          ok: false,
          error: "Impossible de récupérer l'inventaire demandé.",
        },
        { status: 500 }
      );
    }

    /*
     * Synthèse par stock (cartes KPI).
     */
    const { data: synthese, error: syntheseError } = await supabaseAdmin
      .from('v_stock_synthese')
      .select(
        'source_id, source_code, source_nom, famille, bailleur, categorie, ordre_affichage, nb_articles, nb_ruptures, nb_obsoletes, nb_mauvais_etat, nb_sans_code, valeur_gnf'
      )
      .eq('periode', periode)
      .order('ordre_affichage', { ascending: true });

    if (syntheseError) {
      console.error('[API /stocks] Supabase error (synthese):', syntheseError);

      return NextResponse.json(
        {
          ok: false,
          error: 'Impossible de récupérer la synthèse des stocks depuis Supabase.',
        },
        { status: 500 }
      );
    }

    const syntheseRows = synthese ?? [];

    const totaux = syntheseRows.reduce(
      (acc, row) => ({
        nbArticles: acc.nbArticles + Number(row.nb_articles ?? 0),
        nbRuptures: acc.nbRuptures + Number(row.nb_ruptures ?? 0),
        nbObsoletes: acc.nbObsoletes + Number(row.nb_obsoletes ?? 0),
        nbMauvaisEtat: acc.nbMauvaisEtat + Number(row.nb_mauvais_etat ?? 0),
      }),
      { nbArticles: 0, nbRuptures: 0, nbObsoletes: 0, nbMauvaisEtat: 0 }
    );

    /*
     * Alertes : top articles obsolètes, en rupture ou en mauvais état,
     * pour affichage direct sans ouvrir le détail.
     */
    const { data: alertesRows, error: alertesError } = await supabaseAdmin
      .from('stock_lignes')
      .select(
        `
        id,
        code_article,
        designation,
        quantite,
        unite,
        lieu,
        etat,
        en_rupture,
        stock_sources ( code, nom )
        `
      )
      .eq('inventaire_id', inventaire?.id ?? 0)
      .or('etat.eq.obsolete,etat.eq.mauvais,en_rupture.eq.true')
      .order('etat', { ascending: true })
      .limit(20);

    if (alertesError) {
      console.error('[API /stocks] Supabase error (alertes):', alertesError);

      return NextResponse.json(
        {
          ok: false,
          error: 'Impossible de récupérer les alertes de stock depuis Supabase.',
        },
        { status: 500 }
      );
    }

    const alertes = (alertesRows ?? []).map((row: any) => ({
      id: Number(row.id),
      codeArticle: row.code_article ? String(row.code_article) : null,
      designation: String(row.designation ?? ''),
      quantite: row.quantite === null ? null : Number(row.quantite),
      unite: String(row.unite ?? 'u'),
      lieu: row.lieu ? String(row.lieu) : null,
      etat: String(row.etat ?? 'non_renseigne'),
      enRupture: Boolean(row.en_rupture),
      sourceCode: row.stock_sources?.code ? String(row.stock_sources.code) : null,
      sourceNom: row.stock_sources?.nom ? String(row.stock_sources.nom) : null,
    }));

    /*
     * Détail filtrable, paginé.
     */
    let detail: any[] = [];
    let detailTotal = 0;

    if (inventaire) {
      let detailQuery = supabaseAdmin
        .from('stock_lignes')
        .select(
          `
          id,
          code_article,
          numero_ordre,
          designation,
          quantite,
          unite,
          lieu,
          observation,
          etat,
          en_rupture,
          quantite_texte_origine,
          stock_sources ( code, nom, famille, bailleur, categorie )
          `,
          { count: 'exact' }
        )
        .eq('inventaire_id', inventaire.id);

      if (sourceParam) {
        const { data: src } = await supabaseAdmin
          .from('stock_sources')
          .select('id')
          .eq('code', sourceParam)
          .maybeSingle();

        detailQuery = detailQuery.eq('source_id', src?.id ?? 0);
      }

      if (qParam) {
        const escaped = qParam.replace(/[%_]/g, (m) => `\\${m}`);
        detailQuery = detailQuery.or(
          `designation.ilike.%${escaped}%,code_article.ilike.%${escaped}%`
        );
      }

      if (etatParam) {
        detailQuery = detailQuery.eq('etat', etatParam);
      }

      if (ruptureParam) {
        detailQuery = detailQuery.eq('en_rupture', true);
      }

      detailQuery = detailQuery
        .order('designation', { ascending: true })
        .range(offsetParam, offsetParam + limitParam - 1);

      const { data: detailRows, error: detailError, count } = await detailQuery;

      if (detailError) {
        console.error('[API /stocks] Supabase error (detail):', detailError);

        return NextResponse.json(
          {
            ok: false,
            error: 'Impossible de récupérer le détail des stocks depuis Supabase.',
          },
          { status: 500 }
        );
      }

      detail = (detailRows ?? []).map((row: any) => ({
        id: Number(row.id),
        codeArticle: row.code_article ? String(row.code_article) : null,
        numeroOrdre: row.numero_ordre === null ? null : Number(row.numero_ordre),
        designation: String(row.designation ?? ''),
        quantite: row.quantite === null ? null : Number(row.quantite),
        unite: String(row.unite ?? 'u'),
        lieu: row.lieu ? String(row.lieu) : null,
        observation: row.observation ? String(row.observation) : null,
        etat: String(row.etat ?? 'non_renseigne'),
        enRupture: Boolean(row.en_rupture),
        quantiteTexteOrigine: row.quantite_texte_origine
          ? String(row.quantite_texte_origine)
          : null,
        sourceCode: row.stock_sources?.code ? String(row.stock_sources.code) : null,
        sourceNom: row.stock_sources?.nom ? String(row.stock_sources.nom) : null,
        famille: row.stock_sources?.famille ? String(row.stock_sources.famille) : null,
        bailleur: row.stock_sources?.bailleur ? String(row.stock_sources.bailleur) : null,
        categorie: row.stock_sources?.categorie ? String(row.stock_sources.categorie) : null,
      }));

      detailTotal = count ?? 0;
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          periode,
          synthese: syntheseRows.map((row: any) => ({
            sourceId: Number(row.source_id),
            sourceCode: String(row.source_code),
            sourceNom: String(row.source_nom),
            famille: String(row.famille),
            bailleur: row.bailleur ? String(row.bailleur) : null,
            categorie: row.categorie ? String(row.categorie) : null,
            nbArticles: Number(row.nb_articles ?? 0),
            nbRuptures: Number(row.nb_ruptures ?? 0),
            nbObsoletes: Number(row.nb_obsoletes ?? 0),
            nbMauvaisEtat: Number(row.nb_mauvais_etat ?? 0),
            nbSansCode: Number(row.nb_sans_code ?? 0),
            valeurGnf: row.valeur_gnf === null ? null : Number(row.valeur_gnf),
          })),
          totaux,
          alertes,
          detail,
          detailTotal,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('[API /stocks] Unexpected error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Erreur interne lors de la récupération des stocks.',
      },
      { status: 500 }
    );
  }
}
