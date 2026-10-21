'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, ShieldCheck, Activity } from 'lucide-react';

const categoryTitles: Record<string, { title: string; subtitle: string }> = {
  'vue-nationale': { title: 'Vue Nationale', subtitle: 'Supervision globale consolidée de l\'ensemble des directions régionales' },
  'agences': { title: 'Agences & Centres', subtitle: 'Gestion des agences et centres SEG — données de facturation et référentiel administratif' },
  'agents': { title: 'Agents & Équipes', subtitle: 'Suivi des 2 542 agents connectés et équipes d\'intervention terrain' },
  'missions': { title: 'Missions & Ordres de Travail', subtitle: 'Planification, assignation et suivi des missions en temps réel' },
  'incidents': { title: 'Incidents & Signalements', subtitle: 'Registre et traitement des 23 alertes et signalements critiques' },
  'reseau': { title: 'Réseau & Fuites', subtitle: 'Télésurveillance des conduites principales, pressions et détection des fuites' },
  'compteurs': { title: 'Compteurs & Télérelève', subtitle: 'Parc des compteurs intelligents et relevés de consommation' },
  'clients': { title: 'Clients & Réclamations', subtitle: 'Gestion de la relation client, 178 réclamations actives' },
  'stocks': { title: 'Stocks & Magasins', subtitle: 'Approvisionnements, pièces détachées et produits de traitement de l\'eau' },
  'rh': { title: 'Ressources Humaines', subtitle: 'Gestion du personnel, effectifs régionaux et astreintes' },
  'parametres': { title: 'Paramètres Système', subtitle: 'Configurations des seuils d\'alerte, passerelles et télémétrie' },
  'utilisateurs': { title: 'Gestion des Utilisateurs', subtitle: 'Contrôle d\'accès par rôle (Direction Générale, Chefs d\'agences, Opérateurs)' },
  'audit': { title: 'Journal d\'Audit', subtitle: 'Historique immuable de traçabilité des opérations et télémétrie' }
};

export default function CategoryPage() {
  const params = useParams();
  const catKey = Array.isArray(params?.category) ? params.category[0] : (params?.category as string) || '';
  const info = categoryTitles[catKey] || {
    title: catKey ? catKey.charAt(0).toUpperCase() + catKey.slice(1) : 'Module SEG',
    subtitle: 'Module en cours de synchronisation avec le Système d\'Information SEG'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-strong)' }}>{info.title}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{info.subtitle}</p>
        </div>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: '#38bdf8',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            textDecoration: 'none'
          }}
        >
          <ArrowLeft size={15} />
          <span>Retour au Tableau de bord</span>
        </Link>
      </div>

      <div
        className="dashboard-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '360px',
          textAlign: 'center',
          padding: '40px 20px',
          background: 'radial-gradient(circle at 50% 40%, #0d263a 0%, #081726 70%, #050e18 100%)'
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8',
            marginBottom: '18px'
          }}
        >
          <Activity size={28} />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '8px' }}>
          Module Connecté en Temps Réel
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '500px', lineHeight: '1.5' }}>
          Ce module est directement synchronisé avec les flux de données de la Direction Générale SEG. Les flux opérationnels sont intégrés sur la vue principale.
        </p>

        <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981' }}>
            <ShieldCheck size={16} />
            <span>Sécurisé SEG-Cloud</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#38bdf8' }}>
            <Clock size={16} />
            <span>Télémétrie active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
