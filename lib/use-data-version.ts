'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Surveille /api/data-version et renvoie un compteur qui augmente
 * uniquement quand les données changent en base (nouvel import,
 * nouvelle injection SQL…).
 *
 * Usage : ajouter la valeur renvoyée aux dépendances du useEffect
 * qui charge les données de la page.
 *
 *   const refreshTick = useDataRefresh();
 *   useEffect(() => { load(); }, [year, refreshTick]);
 *
 * Vérification : toutes les `intervalMs` (60 s par défaut), quand
 * l'onglet redevient visible et quand la fenêtre reprend le focus.
 * Aucune vérification n'est faite quand l'onglet est masqué.
 */
export function useDataRefresh(intervalMs = 60_000): number {
  const [tick, setTick] = useState(0);
  const lastVersion = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function check() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch('/api/data-version', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) return;

        const result = (await response.json()) as { ok?: boolean; version?: string };

        if (cancelled || !result.ok || typeof result.version !== 'string') return;

        if (lastVersion.current === null) {
          // Première lecture : la page vient de charger ses données.
          lastVersion.current = result.version;
          return;
        }

        if (result.version !== lastVersion.current) {
          lastVersion.current = result.version;
          setTick((current) => current + 1);
        }
      } catch {
        // Erreur réseau ou requête annulée : on réessaiera au prochain cycle.
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') {
        void check();
      }
    }

    void check();

    const timer = window.setInterval(() => void check(), intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs]);

  return tick;
}
