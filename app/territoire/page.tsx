'use client';

import { useEffect, useState } from 'react';
import { Building2, MapPin, Users, Radio, ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { num, pct } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

export default function TerritoirePage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const { data, loading, error } = useOverview(year, clientType);

  // Chargement complémentaire des données de facturation Supabase.
  // La source territoriale historique est conservée.
  const [facturationData, setFacturationData] = useState<any>(null);
  const [facturationLoading, setFacturationLoading] = useState(true);
  const [facturationError, setFacturationError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadFacturation() {
      setFacturationLoading(true);
      setFacturationError('');

      try {
        const params = new URLSearchParams({
          year: String(year),
        });

        const categoryAliases: Record<string, string> = {
          'Administration': 'ADM Gle',
          'Administration Publique': 'ADM Gle',
          'Autres ADM': 'Autre ADM',
          'Autres ADM & Collectivités': 'Autre ADM',
          'Bornes Fontaines': 'BF',
          'Borne Fontaine': 'BF',
          'Particuliers': 'Domestique',
        };

        const sourceCategories = new Set([
          'ADM Gle',
          'Agent SEG',
          'Autre ADM',
          'BF',
          'Commerce',
          'Domestique',
          'Industrie',
          'Installation SEG',
        ]);

        const mappedCategory =
          categoryAliases[clientType] ||
          (sourceCategories.has(clientType) ? clientType : '');

        if (mappedCategory) {
          params.set('category', mappedCategory);
        }

        const response = await fetch(
          `/api/kpi/facturation-centres?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(
            result.error ||
            'Impossible de charger les données de facturation.'
          );
        }

        setFacturationData(result.data);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error('[Territoire] Facturation :', error);

        setFacturationError(
          error instanceof Error
            ? error.message
            : 'Erreur de chargement des données de facturation.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setFacturationLoading(false);
        }
      }
    }

    loadFacturation();

    return () => controller.abort();
  }, [year, clientType]);


  const kpis = data?.kpis || {};
  const agencies = data?.agencies || [];
  const billingCenters: any[] = Array.isArray(facturationData?.centers)
    ? facturationData.centers
    : [];

  const billingKpis = facturationData?.kpis || {};
  const maxBillingRevenue = Math.max(
    1,
    ...billingCenters.map(
      (center: any) =>
        Number(center.revenueTTC ?? center.revenue) || 0
    )
  );



  const agencySlug = (name: string) =>
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Réseau Territorial & Agences</span>
      </div>

      {/* Filters */}
      <DetailFilterBar
        year={year}
        onYear={setYear}
        clientType={clientType}
        onClientType={setClientType}
        loading={loading}
        error={error}
        label={`Filtres : Exercice ${year}${clientType ? ` · ${clientType}` : ' · Tous segments'}`}
      />
      {error && <div className="db-error-banner">{error}. Démarre MySQL dans XAMPP puis recharge la page.</div>}

      {/* Subpage Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Réseau Territorial & Agences</h2>
          <p>Supervision des agences décentralisées, centres d'exploitation et performance territoriale — exercice {year}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              <Building2 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Agences actives (données)</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{agencies.length || 0}</span>
                <span className="kpi-total-val">agences</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Synchronisées MySQL</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <Users size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Abonnés territoriaux</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{num(Number(kpis.subscribers) || 0)}</span>
                <span className="kpi-total-val">abonnés</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">{clientType || 'Tous segments'}</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <MapPin size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Directions Régionales</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">6</span>
                <span className="kpi-total-val">pôles</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Maillage complet</span>
            <span className="kpi-period">National</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#c084fc', border: '1px solid rgba(147, 51, 234, 0.3)' }}>
              <Radio size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Recouvrement National</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#38bdf8' }}>{pct(Number(kpis.recovery) || 0)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">{Number(kpis.recovery) >= 0.85 ? 'Cible atteinte' : 'Sous la cible 85%'}</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>
      </div>

      {/* Agencies Grid (réel) */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Agences & Centres d'Exploitation — performance {year}</h3>
          <span className="badge-pill cyan">{agencies.length} agences · {clientType || 'Tous segments'}</span>
        </div>

        {agencies.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>
            {loading ? 'Chargement des données…' : 'Aucune donnée pour cette sélection'}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '12px',
              marginTop: '8px'
            }}
          >
            {agencies.map((a: any, idx: number) => {
              const rec = Number(a.recovery) || 0;
              const recPct = rec >= 0.85;
              return (
                <Link
                  key={idx}
                  href={`/territoire/agences/${agencySlug(String(a.name || ''))}`}
                  style={{
                    background: 'var(--bg-inner)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                    textDecoration: 'none',
                    color: 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-strong)' }}>{a.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{num(Number(a.subscribers) || 0)} abonnés</div>
                    </div>
                    <span className="badge-pill green" style={{ fontSize: '9.5px' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                      Actif
                    </span>
                  </div>

                  <div style={{ height: 4, background: '#1e3a5f', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(rec * 100, 100)}%`, height: '100%', background: recPct ? '#10b981' : '#f59e0b', borderRadius: 999 }} />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                      fontSize: '11px'
                    }}
                  >
                    <span style={{ color: 'var(--text-dim)' }}>Volume : <strong style={{ color: 'var(--text-secondary)' }}>{num(Number(a.volumeBilled) || 0)} m³</strong></span>
                    <span style={{ color: 'var(--text-dim)' }}>Recouvr. : <strong style={{ color: recPct ? '#10b981' : '#f59e0b' }}>{pct(rec)}</strong></span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <Link href="/vue-nationale" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#38bdf8', marginTop: 14, textDecoration: 'none' }}>
          Voir la carte nationale avec drill-down géographique <ChevronRight size={14} />
        </Link>
      </div>


      {/* Facturation complémentaire — design homogène avec les cartes territoriales */}
      <section className="dashboard-card">
        <div className="card-header-flex">
          <h3>Facturation par centre — exercice {year}</h3>

          <span className="badge-pill cyan">
            {facturationLoading
              ? 'Chargement…'
              : `${billingCenters.length} centres sources`}
          </span>
        </div>

        <p style={{
          color: 'var(--text-muted)',
          fontSize: '12px',
          lineHeight: '1.6',
          margin: '0 0 16px'
        }}>
          Performance commerciale par centre, calculée à partir des données
          Supabase. Cette section complète les informations territoriales
          existantes sans remplacer les fiches administratives des agences.
        </p>

        {facturationError && (
          <div className="db-error-banner" style={{ marginBottom: 16 }}>
            Impossible de charger les données de facturation :
            {' '}{facturationError}
          </div>
        )}

        {!facturationError && !facturationLoading && (
          <div className="subpage-kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{
                  background: 'rgba(56,189,248,0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56,189,248,0.3)'
                }}>
                  <Building2 size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Centres sources</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val">
                      {num(billingCenters.length)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">
                  Noms de la facturation
                </span>
                <span className="kpi-period">{year}</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{
                  background: 'rgba(16,185,129,0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16,185,129,0.3)'
                }}>
                  <Users size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Abonnés facturés</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val">
                      {num(Number(billingKpis.subscribers) || 0)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">
                  Dernier mois disponible
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{
                  background: 'rgba(245,158,11,0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245,158,11,0.3)'
                }}>
                  <MapPin size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Volume facturé</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val">
                      {num(Number(billingKpis.volumeBilled) || 0)} m³
                    </span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">
                  Cumul de la période
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{
                  background: 'rgba(147,51,234,0.15)',
                  color: '#c084fc',
                  border: '1px solid rgba(147,51,234,0.3)'
                }}>
                  <Radio size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Chiffre d'affaires TTC</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{
                      fontSize: '16px',
                      overflowWrap: 'anywhere'
                    }}>
                      {Number(billingKpis.revenueTTC || 0).toLocaleString('fr-FR')}
                      {' GNF'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">
                  Facturation cumulée
                </span>
              </div>
            </div>
          </div>
        )}

        {facturationLoading ? (
          <div style={{
            padding: '28px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)'
          }}>
            Chargement des centres depuis Supabase…
          </div>
        ) : facturationError ? (
          <div style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)'
          }}>
            Les cartes de facturation ne sont pas disponibles.
          </div>
        ) : billingCenters.length === 0 ? (
          <div style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)'
          }}>
            Aucun centre trouvé pour cet exercice.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
            marginTop: '8px'
          }}>
            {billingCenters.map((center: any) => {
              const revenue =
                Number(center.revenueTTC ?? center.revenue) || 0;

              const revenueShare = Math.min(
                (revenue / maxBillingRevenue) * 100,
                100
              );

              return (
                <div
                  key={center.name}
                  style={{
                    background: 'var(--bg-inner)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                    color: 'inherit',
                    minWidth: 0
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--text-strong)',
                        overflowWrap: 'anywhere'
                      }}>
                        {center.name}
                      </div>

                      <div style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '4px'
                      }}>
                        {num(Number(center.subscribers) || 0)}
                        {' abonnés facturés'}
                      </div>
                    </div>

                    <span className="badge-pill green" style={{
                      fontSize: '9.5px',
                      flexShrink: 0
                    }}>
                      Facturation
                    </span>
                  </div>

                  <div style={{
                    height: '4px',
                    background: '#1e3a5f',
                    borderRadius: 999,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${revenueShare}%`,
                      height: '100%',
                      background: '#10b981',
                      borderRadius: 999,
                      transition: 'width .3s ease'
                    }} />
                  </div>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '11px'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        Volume consommé
                      </span>
                      <strong style={{ color: 'var(--text-secondary)' }}>
                        {num(Number(center.volumeConsumed) || 0)} m³
                      </strong>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        Volume facturé
                      </span>
                      <strong style={{ color: 'var(--text-secondary)' }}>
                        {num(Number(center.volumeBilled) || 0)} m³
                      </strong>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        Chiffre d'affaires TTC
                      </span>
                      <strong style={{
                        color: '#10b981',
                        textAlign: 'right'
                      }}>
                        {revenue.toLocaleString('fr-FR')}
                        {' GNF'}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '14px'
        }}>
          Source : Supabase · seg_facturation_centres_mensuelle.
          Les barres représentent le chiffre d'affaires TTC de chaque centre
          par rapport au centre ayant le montant le plus élevé.
        </div>
      </section>

    </div>
  );
}
