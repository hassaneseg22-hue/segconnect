'use client';

import { useEffect, useState } from 'react';

export type OverviewData = any;

export interface OverviewFiltersOptions {
  agencies: string[];
  clientTypes: string[];
}

export function useOverview(
  year: number,
  clientType: string,
  agency?: string
) {
  const [data, setData] = useState<OverviewData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          year: String(year),
        });

        if (clientType) {
          params.set('clientType', clientType);
        }

        if (agency) {
          params.set('agency', agency);
        }

        const response = await fetch(
          `/api/overview?${params.toString()}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          }
        );

        const json = await response.json();

        if (!response.ok || !json.ok) {
          throw new Error(
            json.error ||
              'Impossible de charger les données du tableau de bord.'
          );
        }

        setData(json.data);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : 'Impossible de charger les données du tableau de bord.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadOverview();

    return () => controller.abort();
  }, [year, clientType, agency]);

  return {
    data,
    loading,
    error,
  };
}

export function useClientTypes() {
  const [clientTypes, setClientTypes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFilters() {
      try {
        const response = await fetch('/api/filters', {
          cache: 'no-store',
          signal: controller.signal,
        });

        const json = await response.json();

        if (response.ok && json.ok) {
          setClientTypes(json.data?.clientTypes ?? []);
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          '[useClientTypes] Impossible de charger les types clients:',
          error
        );
      }
    }

    loadFilters();

    return () => controller.abort();
  }, []);

  return clientTypes;
}
