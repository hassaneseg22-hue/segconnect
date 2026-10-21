'use client';

import { useEffect, useRef, useState } from 'react';
import { useDataRefresh } from '@/lib/use-data-version';

export type ProdMonthly = {
  mois: number;
  production: number | null;
  distribution: number | null;
  ratio: number | null;
  productionN1: number | null;
  yessouloun: number | null;
  foragesAutres: number | null;
  national: number | null;
  nationalN1: number | null;
  nationalConakry: number | null;
  nationalCentres: number | null;
  declareEauTraitee: number | null;
  declareEauBrute: number | null;
  ecart: number | null;
};

export type ProductionDistributionData = {
  kpis: {
    productionConakry: number;
    distributionConakry: number;
    ratioDistributionProduction: number | null;
    productionConakryN1: number;
    distributionConakryN1: number;
    productionNationale: number;
    productionNationaleN1: number;
    eauBruteDeclaree: number;
    sitesActifs: number;
    sitesTotal: number;
    reservoirsCount: number;
    reservoirsCapacity: number;
    reseauLineaire: number;
    reseauZones: number;
    monthsWithData: number;
    periodMonths: number[];
    conakryNationale: number;
    centresNationale: number;
    lastMonth: number | null;
  };
  monthly: ProdMonthly[];
  sites: { site_no: number | null; site_nom: string; volume: number; part: number }[];
  agencies: { agence_nom: string; agency_id: number | null; volume: number; part: number }[];
  cities: { ville_nom: string; est_conakry: boolean; volume: number }[];
  reservoirs: {
    id: number;
    nom: string;
    code_ouvrage: string | null;
    localisation: string | null;
    capacite_m3: number | null;
    type_ouvrage: string | null;
    fonction: string | null;
    station_chloration: string | null;
    etat_structure: string | null;
    volume_moyen_journalier_m3: number | null;
    volume_reference_annee: number | null;
    annee_mise_en_service: number | null;
  }[];
  reseau: {
    zone_commerciale: string;
    agency_id: number | null;
    nb_zones_hydrauliques: number;
    lineaire_total_ml: number;
    lineaire_fonte_ml: number;
    lineaire_acier_ml: number;
    lineaire_pvc_ml: number;
    annee_pose_moyenne_ponderee: number | null;
  }[];
  anomalies: { mois: number; ecart: number | null }[];
  availableYears: number[];
  lastRefresh: string | null;
};

/**
 * Charge /api/kpi/production-distribution et se recharge seul quand
 * les données changent en base (voir useDataRefresh).
 */
export function useProductionDistribution(year: number, monthTo = 12, month: number | null = null) {
  const refreshTick = useDataRefresh();
  const [data, setData] = useState<ProductionDistributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const lastKey = useRef('');

  useEffect(() => {
    const controller = new AbortController();
    const key = `${year}-${monthTo}-${month ?? ''}`;

    // Nouveau filtre : on vide l'affichage pour ne jamais montrer les chiffres
    // d'un autre exercice. Simple actualisation : on garde les chiffres affichés.
    if (lastKey.current !== key) {
      lastKey.current = key;
      setData(null);
    }

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          `/api/kpi/production-distribution?year=${year}&monthTo=${monthTo}${month ? `&month=${month}` : ''}`,
          { cache: 'no-store', signal: controller.signal }
        );

        const result = (await response.json()) as {
          ok: boolean;
          error?: string;
          data?: ProductionDistributionData;
        };

        if (!response.ok || !result.ok || !result.data) {
          throw new Error(
            response.status === 403
              ? 'Permission « production.view » requise.'
              : result.error || `Erreur HTTP ${response.status}`
          );
        }

        setData(result.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(err instanceof Error ? err.message : 'Chargement impossible.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [year, monthTo, month, refreshTick, reloadToken]);

  return {
    data,
    loading,
    error,
    refreshTick,
    reload: () => setReloadToken((current) => current + 1),
  };
}
