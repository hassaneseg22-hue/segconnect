'use client';
// app/rh/page.tsx — Ressources humaines (vue DG) : effectif de la société + personnel des centres de l'intérieur.
import { useEffect, useMemo, useState } from 'react';
import RhVue from '@/components/rh/RhVue';
import EffectifSociete from '@/components/rh/EffectifSociete';
import BesoinsPersonnelDR from '@/components/rh/BesoinsPersonnelDR';
import type { Personne } from '@/lib/rh-agregat';
import { controler, type Agent } from '@/lib/rh-effectif';

type Centres = { date_liste: string | null; source_fichier: string | null; personnes: Personne[] };
type Effectif = { date_reception: string | null; source_fichier: string | null; agents: Agent[] };

async function charger<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
  return j as T;
}

export default function RhPage() {
  const [centres, setCentres] = useState<Centres | null>(null);
  const [effectif, setEffectif] = useState<Effectif | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurEffectif, setErreurEffectif] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    charger<Centres>('/api/rh/personnel')
      .then((j) => { if (!annule) setCentres(j); })
      .catch((e: Error) => { if (!annule) setErreur(e.message); });
    // La liste de toute la société est indépendante : son absence ne bloque pas la page.
    charger<Effectif>('/api/rh/effectif')
      .then((j) => { if (!annule) setEffectif(j); })
      .catch((e: Error) => { if (!annule) { setErreurEffectif(e.message); setEffectif({ date_reception: null, source_fichier: null, agents: [] }); } });
    return () => { annule = true; };
  }, []);

  const controle = useMemo(
    () => (centres && effectif && effectif.agents.length ? controler(effectif.agents, centres.personnes) : undefined),
    [centres, effectif]
  );

  if (erreur) {
    return <div className="db-error-banner">Impossible de charger le personnel : {erreur}</div>;
  }
  if (!centres || !effectif) {
    return <div className="dashboard-card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement du personnel…</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {erreurEffectif && (
        <div className="db-error-banner">Liste du personnel de la société indisponible : {erreurEffectif}</div>
      )}
      <EffectifSociete
        agents={effectif.agents}
        centres={centres.personnes}
        dateReception={effectif.date_reception}
        dateListeCentres={centres.date_liste}
        source={effectif.source_fichier}
      />
      <BesoinsPersonnelDR agents={effectif.agents} />
      <RhVue personnes={centres.personnes} dateListe={centres.date_liste} source={centres.source_fichier} controle={controle} />
    </div>
  );
}
