'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  Layers3,
  Map,
  MapPin,
  Maximize2,
  Radio,
  Ruler,
  ShieldCheck,
  Users,
  Waves,
} from 'lucide-react';

type AgencyNetwork = {
  slug: string;
  name: string;
  code: string;
  hasNetworkPlan: boolean;
  conduites?: number;
  reservoirs?: number;
  agencies?: number;
  planDate?: string;
  scale?: string;
  source?: string;
  planUrl?: string;
};

const NETWORKS: Record<string, AgencyNetwork> = {
  kaloum: {
    slug: 'kaloum',
    name: 'Kaloum',
    code: 'KAL',
    hasNetworkPlan: true,
    conduites: 461,
    reservoirs: 1,
    agencies: 1,
    planDate: '06/10/2026',
    scale: '1 : 8 200',
    source: 'SIG SEG',
    planUrl: '/documents/aep/kaloum.pdf',
  },
};

function getNetwork(slug: string): AgencyNetwork {
  const normalized = decodeURIComponent(slug || '').toLowerCase();
  if (NETWORKS[normalized]) return NETWORKS[normalized];

  const name = normalized
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    slug: normalized,
    name: name || 'Agence',
    code: '',
    hasNetworkPlan: false,
  };
}

function KpiCard({
  icon,
  title,
  value,
  detail,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <div
          className="kpi-icon-wrap"
          style={{
            background: `${color}26`,
            color,
            border: `1px solid ${color}4d`,
          }}
        >
          {icon}
        </div>

        <div className="kpi-title-value">
          <div className="kpi-title">{title}</div>
          <div className="kpi-num-row">
            <span className="kpi-main-val">{value}</span>
          </div>
        </div>
      </div>

      <div className="kpi-foot-row">
        <span className="kpi-trend positive">{detail}</span>
        <span className="kpi-period">SEG</span>
      </div>
    </div>
  );
}

export default function AgencyNetworkPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency } = use(params);
  const network = getNetwork(agency);
  const hasPlan = network.hasNetworkPlan && Boolean(network.planUrl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Breadcrumb — même langage visuel que /territoire */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--text-dim)',
        }}
      >
        <Link
          href="/"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>

        <span>›</span>

        <Link
          href="/territoire"
          style={{ color: '#38bdf8', textDecoration: 'none' }}
        >
          Réseau Territorial & Agences
        </Link>

        <span>›</span>

        <span style={{ color: 'var(--text-muted)' }}>{network.name}</span>
      </div>

      {/* Header — même composant visuel que la page de départ */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Réseau Territorial — {network.name}</h2>
          <p>
            Réseau d'adduction d'eau potable de l'agence de {network.name}
            {network.code ? ` — code ${network.code}` : ''}.
          </p>
        </div>

        <Link
          href="/territoire"
          className="badge-pill cyan"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={13} />
          Retour au territoire
        </Link>
      </div>

      {/* KPI — reprend exactement la logique visuelle de /territoire */}
      <div className="subpage-kpi-grid">
        <KpiCard
          icon={<Layers3 size={20} />}
          title="Conduites"
          value={network.conduites ? num(network.conduites) : '—'}
          detail={
            network.conduites
              ? 'Conduites cartographiées'
              : 'Donnée non disponible'
          }
          color="#38bdf8"
        />

        <KpiCard
          icon={<Waves size={20} />}
          title="Réservoirs"
          value={network.reservoirs ? num(network.reservoirs) : '—'}
          detail={
            network.reservoirs
              ? 'Réservoirs référencés'
              : 'Donnée non disponible'
          }
          color="#10b981"
        />

        <KpiCard
          icon={<Building2 size={20} />}
          title="Agences"
          value={network.agencies ? num(network.agencies) : '—'}
          detail={
            network.agencies
              ? 'Agence représentée sur le plan'
              : 'Donnée non disponible'
          }
          color="#f59e0b"
        />

        <KpiCard
          icon={<Ruler size={20} />}
          title="Échelle du plan"
          value={network.scale || '—'}
          detail={network.scale ? 'Plan officiel disponible' : 'Donnée non disponible'}
          color="#c084fc"
        />
      </div>

      {hasPlan ? (
        <>
          {/* Plan principal */}
          <div className="dashboard-card">
            <div className="card-header-flex">
              <div>
                <h3>Plan du réseau AEP de {network.name}</h3>
                <div
                  style={{
                    marginTop: '5px',
                    color: 'var(--text-dim)',
                    fontSize: '11px',
                    lineHeight: 1.45,
                  }}
                >
                  Plan officiel fourni par le SIG SEG. Le document est affiché
                  comme référence cartographique ; aucune géométrie SIG n'est
                  inventée à partir du PDF.
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <span className="badge-pill green">
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#10b981',
                    }}
                  />
                  Source SIG SEG
                </span>

                <a
                  href={network.planUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="badge-pill cyan"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    textDecoration: 'none',
                  }}
                >
                  <Maximize2 size={12} />
                  Ouvrir le plan
                </a>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderTop: '1px solid rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(3, 15, 28, 0.25)',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span className="badge-pill cyan">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#38bdf8',
                    }}
                  />
                  Conduites
                </span>
                <span className="badge-pill" style={{ color: '#f59e0b' }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#f59e0b',
                    }}
                  />
                  Réservoir
                </span>
                <span className="badge-pill green">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#10b981',
                    }}
                  />
                  Agence
                </span>
              </div>

              <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>
                Édité le {network.planDate} · Échelle {network.scale}
              </span>
            </div>

            <div
              style={{
                height: 'min(68vh, 720px)',
                minHeight: '500px',
                background: '#061421',
                overflow: 'hidden',
              }}
            >
              <iframe
                src={network.planUrl}
                title={`Plan du réseau AEP de ${network.name}`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 0,
                  display: 'block',
                  background: '#061421',
                }}
              />
            </div>
          </div>

          {/* Informations réseau — même dashboard-card */}
          <div className="dashboard-card">
            <div className="card-header-flex">
              <h3>Informations du réseau — {network.name}</h3>
              <span className="badge-pill cyan">
                <MapPin size={12} />
                {network.code || network.name}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                marginTop: '8px',
              }}
            >
              <InfoItem icon={<Layers3 size={16} />} label="Conduites" value="461" />
              <InfoItem icon={<Waves size={16} />} label="Réservoirs" value="1" />
              <InfoItem icon={<Building2 size={16} />} label="Agences" value="1" />
              <InfoItem icon={<Ruler size={16} />} label="Échelle" value="1 : 8 200" />
              <InfoItem icon={<CalendarDays size={16} />} label="Date du plan" value="06/10/2026" />
              <InfoItem icon={<Radio size={16} />} label="Source" value="SIG SEG" />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '9px',
                marginTop: '13px',
                padding: '11px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                color: 'var(--text-dim)',
                fontSize: '10px',
                lineHeight: 1.45,
              }}
            >
              <ShieldCheck size={16} color="#10b981" style={{ flex: '0 0 auto' }} />
              <span>
                Les statistiques affichées correspondent aux éléments explicitement
                référencés dans le plan officiel du réseau AEP de {network.name}.
                Les informations non présentes dans le document ne sont pas inventées.
              </span>
            </div>
          </div>

          {/* Couches — préparation pour les futurs vrais vecteurs SIG */}
          <div className="dashboard-card">
            <div className="card-header-flex">
              <h3>Éléments référencés dans le plan</h3>
              <span className="badge-pill purple">
                <Map size={12} />
                Référence cartographique
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px',
                marginTop: '8px',
              }}
            >
              <LayerItem
                icon={<Layers3 size={17} />}
                title="Conduites"
                detail="461 référencées"
                color="#38bdf8"
              />
              <LayerItem
                icon={<Waves size={17} />}
                title="Réservoir"
                detail="1 référencé"
                color="#f59e0b"
              />
              <LayerItem
                icon={<Building2 size={17} />}
                title="Agence"
                detail="1 référencée"
                color="#10b981"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="dashboard-card">
          <div
            style={{
              padding: '30px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
              }}
            >
              <Map size={23} />
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div
                style={{
                  color: '#38bdf8',
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                }}
              >
                RÉSEAU AEP
              </div>

              <h3 style={{ margin: '4px 0', color: 'var(--text-strong)' }}>
                Données réseau détaillées non disponibles
              </h3>

              <p
                style={{
                  margin: 0,
                  color: 'var(--text-dim)',
                  fontSize: '10px',
                  lineHeight: 1.5,
                }}
              >
                Le référentiel SIG de l'agence {network.name} n'est pas encore
                intégré à SEG CONNECT. La page est prête à recevoir son plan
                officiel lorsque les données seront disponibles.
              </p>
            </div>

            <Link
              href="/territoire"
              className="badge-pill cyan"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={13} />
              Retour au territoire
            </Link>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '7px',
          color: 'var(--text-dim)',
          fontSize: '9px',
          paddingBottom: '4px',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px rgba(16,185,129,0.6)',
          }}
        />
        <span>Source : SIG SEG</span>
        <span>•</span>
        <span>Réseau AEP {network.name}</span>
        {network.planDate && (
          <>
            <span>•</span>
            <span>Plan édité le {network.planDate}</span>
          </>
        )}
      </div>
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '11px',
        borderRadius: '8px',
        background: 'var(--bg-inner)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div style={{ color: '#38bdf8', display: 'grid', placeItems: 'center' }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: '9px' }}>{label}</div>
        <div
          style={{
            color: 'var(--text-strong)',
            fontSize: '12px',
            fontWeight: 700,
            marginTop: '2px',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function LayerItem({
  icon,
  title,
  detail,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '62px',
        padding: '11px',
        borderRadius: '8px',
        background: 'var(--bg-inner)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          color,
          background: `${color}18`,
          border: `1px solid ${color}30`,
        }}
      >
        {icon}
      </div>

      <div>
        <div style={{ color: 'var(--text-strong)', fontSize: '10px', fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '8px', marginTop: 3 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function num(value: number) {
  return new Intl.NumberFormat('fr-FR').format(value);
}
