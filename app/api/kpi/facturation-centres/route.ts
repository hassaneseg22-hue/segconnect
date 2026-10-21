import { NextResponse } from 'next/server';
import {
  requireAuth,
  authErrorResponse,
} from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

type FacturationRow = {
  id: number;
  exercice: number;
  agence_nom: string;
  mois: number;
  categorie: string;
  abonnes_listes: number | string | null;
  abonnes_factures: number | string | null;
  volume_consomme: number | string | null;
  volume_facture: number | string | null;
  chiffre_affaires_ht: number | string | null;
  chiffre_affaires_ttc: number | string | null;
};

type Totals = {
  subscribersListed: number;
  subscribersBilled: number;
  volumeConsumed: number;
  volumeBilled: number;
  revenueHT: number;
  revenueTTC: number;
  rows: number;
};

function toNumber(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function createTotals(): Totals {
  return {
    subscribersListed: 0,
    subscribersBilled: 0,
    volumeConsumed: 0,
    volumeBilled: 0,
    revenueHT: 0,
    revenueTTC: 0,
    rows: 0,
  };
}

function addRow(totals: Totals, row: FacturationRow) {
  totals.subscribersListed += toNumber(row.abonnes_listes);
  totals.subscribersBilled += toNumber(row.abonnes_factures);
  totals.volumeConsumed += toNumber(row.volume_consomme);
  totals.volumeBilled += toNumber(row.volume_facture);
  totals.revenueHT += toNumber(row.chiffre_affaires_ht);
  totals.revenueTTC += toNumber(row.chiffre_affaires_ttc);
  totals.rows += 1;
}

export async function GET(request: Request) {
  try {
    await requireAuth();

    const url = new URL(request.url);

    const requestedYear = Number(
      url.searchParams.get('year') ?? new Date().getFullYear()
    );

    const year =
      Number.isInteger(requestedYear) &&
      requestedYear >= 2000 &&
      requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();

    const monthParam = url.searchParams.get('month');
    const month = monthParam ? Number(monthParam) : null;

    const category = (
      url.searchParams.get('category') ?? ''
    ).trim();

    const center = (
      url.searchParams.get('center') ?? ''
    ).trim();

    if (
      month !== null &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Le mois doit être compris entre 1 et 12.',
        },
        { status: 400 }
      );
    }

    // Lecture paginée pour récupérer toutes les lignes de l'exercice.
    const allRows: FacturationRow[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from('seg_facturation_centres_mensuelle')
        .select(`
          id,
          exercice,
          agence_nom,
          mois,
          categorie,
          abonnes_listes,
          abonnes_factures,
          volume_consomme,
          volume_facture,
          chiffre_affaires_ht,
          chiffre_affaires_ttc
        `)
        .eq('exercice', year)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        throw error;
      }

      const batch = (data ?? []) as FacturationRow[];

      allRows.push(...batch);

      if (batch.length < PAGE_SIZE) {
        break;
      }
    }

    // Application des filtres sélectionnés dans le dashboard.
    const selectedRows = allRows.filter((row) => {
      if (month !== null && Number(row.mois) !== month) {
        return false;
      }

      if (category && row.categorie !== category) {
        return false;
      }

      if (center && row.agence_nom !== center) {
        return false;
      }

      return true;
    });

    const monthlyMap = new Map<number, Totals>();
    const centerMap = new Map<string, Totals>();
    const categoryMap = new Map<string, Totals>();

    const latestMonth = selectedRows.reduce(
      (latest, row) => Math.max(latest, Number(row.mois) || 0),
      0
    );

    const latestCenterSubscribers = new Map<string, number>();
    const latestCategorySubscribers = new Map<string, number>();

    const total = createTotals();

    for (const row of selectedRows) {
      const rowMonth = Number(row.mois);
      const centerName = row.agence_nom;
      const categoryName = row.categorie;

      const monthlyTotals =
        monthlyMap.get(rowMonth) ?? createTotals();

      addRow(monthlyTotals, row);
      monthlyMap.set(rowMonth, monthlyTotals);

      const centerTotals =
        centerMap.get(centerName) ?? createTotals();

      addRow(centerTotals, row);
      centerMap.set(centerName, centerTotals);

      const categoryTotals =
        categoryMap.get(categoryName) ?? createTotals();

      addRow(categoryTotals, row);
      categoryMap.set(categoryName, categoryTotals);

      total.volumeConsumed += toNumber(row.volume_consomme);
      total.volumeBilled += toNumber(row.volume_facture);
      total.revenueHT += toNumber(row.chiffre_affaires_ht);
      total.revenueTTC += toNumber(row.chiffre_affaires_ttc);

      // Le nombre d'abonnés est une photographie du dernier mois.
      if (rowMonth === latestMonth) {
        latestCenterSubscribers.set(
          centerName,
          (latestCenterSubscribers.get(centerName) ?? 0) +
            toNumber(row.abonnes_factures)
        );

        latestCategorySubscribers.set(
          categoryName,
          (latestCategorySubscribers.get(categoryName) ?? 0) +
            toNumber(row.abonnes_factures)
        );
      }
    }

    const latestSubscribers = [...latestCenterSubscribers.values()]
      .reduce((sum, value) => sum + value, 0);

    const latestListedSubscribers = selectedRows
      .filter((row) => Number(row.mois) === latestMonth)
      .reduce(
        (sum, row) => sum + toNumber(row.abonnes_listes),
        0
      );

    const monthly = [...monthlyMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([monthNumber, values]) => ({
        month: monthNumber,
        monthName: MONTHS[monthNumber - 1],
        subscribersBilled: values.subscribersBilled,
        volumeConsumed: values.volumeConsumed,
        volumeBilled: values.volumeBilled,
        revenueHT: values.revenueHT,
        revenueTTC: values.revenueTTC,
        rows: values.rows,
      }));

    const centers = [...centerMap.entries()]
      .map(([name, values]) => ({
        name,
        subscribers: latestCenterSubscribers.get(name) ?? 0,
        subscribersListed: selectedRows
          .filter(
            (row) =>
              row.agence_nom === name &&
              Number(row.mois) === latestMonth
          )
          .reduce(
            (sum, row) => sum + toNumber(row.abonnes_listes),
            0
          ),
        volumeConsumed: values.volumeConsumed,
        volumeBilled: values.volumeBilled,
        revenueHT: values.revenueHT,
        revenue: values.revenueTTC,
        revenueTTC: values.revenueTTC,
        rows: values.rows,
      }))
      .sort((a, b) => b.revenueTTC - a.revenueTTC);

    const categories = [...categoryMap.entries()]
      .map(([name, values]) => ({
        name,
        subscribers: latestCategorySubscribers.get(name) ?? 0,
        volumeConsumed: values.volumeConsumed,
        volumeBilled: values.volumeBilled,
        revenueHT: values.revenueHT,
        revenueTTC: values.revenueTTC,
        rows: values.rows,
      }))
      .sort((a, b) => b.revenueTTC - a.revenueTTC);

    return NextResponse.json(
      {
        ok: true,
        data: {
          year,
          selectedMonth: month,
          latestMonth,
          latestMonthName: latestMonth
            ? MONTHS[latestMonth - 1]
            : null,
          rowsCount: selectedRows.length,

          kpis: {
            subscribers: latestSubscribers,
            subscribersListed: latestListedSubscribers,
            volumeConsumed: total.volumeConsumed,
            volumeBilled: total.volumeBilled,
            revenueHT: total.revenueHT,
            revenue: total.revenueTTC,
            revenueTTC: total.revenueTTC,
            centersCount: centerMap.size,
            categoriesCount: categoryMap.size,
            rowsCount: selectedRows.length,
          },

          monthly,
          centers,
          agencies: centers,
          categories,

          filters: {
            months: MONTHS.map((label, index) => ({
              value: index + 1,
              label,
            })),

            categories: [
              ...new Set(allRows.map((row) => row.categorie)),
            ].sort((a, b) => a.localeCompare(b, 'fr')),

            centers: [
              ...new Set(allRows.map((row) => row.agence_nom)),
            ].sort((a, b) => a.localeCompare(b, 'fr')),
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    const response = authErrorResponse(error);

    if (response.status !== 500) {
      return response;
    }

    console.error(
      '[facturation-centres] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'Impossible de charger les données de facturation.',
      },
      { status: 503 }
    );
  }
}
