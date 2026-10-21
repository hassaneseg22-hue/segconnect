'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Users, Banknote, TrendingUp, Search, ChevronRight, Droplets} from 'lucide-react';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';
import { gnf, num, pct } from '@/lib/format';

function gnfCompact(value: number) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md GNF`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`;
  return gnf(value);
}

function volumeCompact(value: number) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mm³`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km³`;
  return `${num(value)} m³`;
}

export default function AgencesCentresPage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const [tab, setTab] = useState<'agences' | 'centres'>('agences');
  const [search, setSearch] = useState('');

  const [billingCenters, setBillingCenters] = useState<any[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadBillingCenters() {
      setBillingLoading(true);
      setBillingError('');

      try {
        const params = new URLSearchParams({
          year: String(year),
        });

        const response = await fetch(
          `/api/kpi/facturation-centres?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const json = await response.json();

        if (!response.ok || !json.ok) {
          throw new Error(
            json.error || 'Impossible de charger les centres.'
          );
        }

        setBillingCenters(
          Array.isArray(json.data?.centers)
            ? json.data.centers
            : []
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error('[Agences & Centres]', error);

        setBillingError(
          error instanceof Error
            ? error.message
            : 'Erreur de chargement des centres.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setBillingLoading(false);
        }
      }
    }

    loadBillingCenters();

    return () => controller.abort();
  }, [year]);

  const filteredBillingCenters = billingCenters.filter(
    (item: any) =>
      !search ||
      String(item.name || '')
        .toLowerCase()
        .includes(search.toLowerCase())
  );


  const billingTotals = billingCenters.reduce(
    (acc: {
      subscribers: number;
      volumeConsumed: number;
      volumeBilled: number;
      revenueHT: number;
      revenueTTC: number;
    }, item: any) => {
      acc.subscribers += Number(item.subscribers) || 0;
      acc.volumeConsumed += Number(item.volumeConsumed) || 0;
      acc.volumeBilled += Number(item.volumeBilled) || 0;
      acc.revenueHT += Number(item.revenueHT) || 0;
      acc.revenueTTC += Number(item.revenueTTC ?? item.revenue) || 0;
      return acc;
    },
    {
      subscribers: 0,
      volumeConsumed: 0,
      volumeBilled: 0,
      revenueHT: 0,
      revenueTTC: 0,
    }
  );

  const { data, loading, error } = useOverview(year, clientType);





  // Référentiel administratif historique des agences SEG.
  const kpis = data?.kpis || {};
  const agencies: any[] = data?.agencies || [];
  const regions = data?.regions || [];
  const coveredRegions = regions.filter((r: any) => r.connected);

  const recovery = Number(kpis.recovery) || 0;
  const revenue = Number(kpis.revenue) || 0;
  const subscribers = Number(kpis.subscribers) || 0;

  const filtered = agencies.filter(
    (a: any) =>
      !search ||
      String(a.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const recoveryMean = agencies.length
    ? agencies.reduce(
        (sum: number, a: any) => sum + (Number(a.recovery) || 0),
        0
      ) / agencies.length
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Agences & Centres</span>
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

      {/* Header + tabs */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Agences & Centres</h2>
          <p>Vue territoriale et performance du réseau — agences issues des relevés technico-commerciaux</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <button
          onClick={() => setTab('agences')}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '8px',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1px solid transparent',
            background: tab === 'agences' ? 'rgba(56,189,248,0.15)' : 'transparent',
            color: tab === 'agences' ? '#38bdf8' : '#8ca2ba'
          }}
        >
          <Building2 size={15} /> Agences
        </button>
        <button
          onClick={() => setTab('centres')}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '8px',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1px solid transparent',
            background: tab === 'centres' ? 'rgba(147,51,234,0.15)' : 'transparent',
            color: tab === 'centres' ? '#c084fc' : '#8ca2ba'
          }}
        >
          🏢 Centres
        </button>
      </div>

      {tab === 'agences' ? (
        <>
          {/* KPI row */}
          <div className="subpage-kpi-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                  <Building2 size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Agences suivies</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{ fontSize: '17px' }}>{agencies.length || '—'}</span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">Relevés technico-commerciaux</span>
                <span className="kpi-period">{year}</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <Users size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Abonnés</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{ fontSize: '17px' }}>{num(subscribers)}</span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">Abonnés totaux</span>
                <span className="kpi-period">{year}</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}>
                  <Banknote size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Chiffre d'affaires</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{ fontSize: '17px' }}>{gnfCompact(revenue)}</span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">CA facturé</span>
                <span className="kpi-period">{year}</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <TrendingUp size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">Recouvrement moyen</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{ fontSize: '17px', color: recovery >= 0.85 ? '#10b981' : '#f59e0b' }}>{pct(recoveryMean)}</span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className="kpi-trend positive">Moyenne agences</span>
                <span className="kpi-period">Cible 85%</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ width: '280px', flex: '0 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px' }}>
                <Search size={15} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une agence..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>
            </div>
            <span className="badge-pill cyan">{agencies.length} agences · {clientType || 'Tous segments'}</span>
          </div>

          {/* Performance table */}
          <div className="dashboard-card">
            <div className="card-header-flex">
              <h3>Performance des agences — exercice {year}</h3>
              <span className="badge-pill green">Données réelles MySQL</span>
            </div>
            {agencies.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', padding: '24px', textAlign: 'center' }}>
                {loading ? 'Chargement des données…' : 'Aucune agence pour cette sélection'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Agence</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Abonnés</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Production</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Consommation</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Chiffre d'affaires</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Recouvrement</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px' }}>État</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a: any) => {
                      const rec = Number(a.recovery) || 0;
                      const recPct = rec >= 0.85;
                      return (
                        <tr key={a.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background .15s', cursor: 'pointer' }} onClick={() => { window.location.href = `/agences/${encodeURIComponent(a.name)}?year=${year}${clientType ? `&clientType=${encodeURIComponent(clientType)}` : ''}`; }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-strong)' }}>{a.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{num(Number(a.subscribers) || 0)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{volumeCompact(Number(a.production) || 0)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{volumeCompact(Number(a.technicalConsumption) || 0)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{gnfCompact(Number(a.revenue) || 0)}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <span style={{ fontWeight: 700, color: recPct ? '#10b981' : '#f59e0b' }}>{pct(rec)}</span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span className={`badge-pill ${recPct ? 'green' : 'amber'}`} style={{ fontSize: '10.5px' }}>{recPct ? '🟢 Conforme' : '🟠 À surveiller'}</span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: '#38bdf8' }}>
                            <ChevronRight size={16} style={{ display: 'inline' }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="dark-alert-box info">
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Cliquez sur une agence pour ouvrir sa fiche détaillée : indicateurs réels, évolution mensuelle, performances commerciale et technique. La comparaison et le score de performance agrégé <strong>ne sont pas encore activés</strong> (V0.3 — à définir avec les objectifs officiels SEG).
            </p>
          </div>
        </>
      ) : (
        
/* ===== Centres et agences : facturation Supabase ===== */
        <div className="dashboard-card">
          <div className="card-header-flex">
            <div>
              <h3>Centres et agences — facturation</h3>
              <p style={{
                margin: '6px 0 0',
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5
              }}>
                Performance commerciale des centres pour l'exercice {year}.
              </p>
            </div>

            <span className="badge-pill green">
              {billingLoading
                ? 'Chargement…'
                : `${filteredBillingCenters.length} centres`}
            </span>
          </div>

          <p style={{
            margin: '14px 0',
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.6
          }}>
            Les indicateurs proviennent de la facturation importée dans
            Supabase. Les noms sources restent distincts du référentiel
            administratif officiel des agences SEG.
          </p>

          {/* Résumé de la sélection */}
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
                  <div className="kpi-title">Centres affichés</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val">
                      {billingLoading
                        ? '…'
                        : num(filteredBillingCenters.length)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="kpi-foot-row">
                <span className="kpi-trend positive">
                  Résultats de la recherche
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
                  <Banknote size={20} />
                </div>

                <div className="kpi-title-value">
                  <div className="kpi-title">Chiffre d'affaires TTC</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{
                      fontSize: 17,
                      overflowWrap: 'anywhere'
                    }}>
                      {gnfCompact(billingTotals.revenueTTC)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="kpi-foot-row">
                <span className="kpi-trend positive">
                  Total des centres de l'exercice
                </span>
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
                      {num(billingTotals.subscribers)}
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
                  <Droplets size={20} />
                </div>

                <div className="kpi-title-value">
                  <div className="kpi-title">Volume facturé</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val">
                      {volumeCompact(billingTotals.volumeBilled)}
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
          </div>

          {/* Recherche */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 18
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              width: 340,
              maxWidth: '100%',
              background: 'var(--bg-inner)',
              border: '1px solid var(--border-color)',
              borderRadius: 9,
              padding: '10px 13px'
            }}>
              <Search size={16} style={{
                color: 'var(--text-dim)',
                flexShrink: 0
              }} />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un centre ou une agence..."
                aria-label="Rechercher un centre de facturation"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }}
              />
            </div>

            <span style={{
              fontSize: 11,
              color: 'var(--text-muted)'
            }}>
              Classement par chiffre d'affaires TTC
            </span>
          </div>

          {/* États de chargement */}
          {billingLoading ? (
            <div style={{
              padding: '35px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              Chargement des centres depuis Supabase…
            </div>
          ) : billingError ? (
            <div className="db-error-banner">
              Impossible de charger les centres : {billingError}
            </div>
          ) : filteredBillingCenters.length === 0 ? (
            <div style={{
              padding: '35px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              Aucun centre ne correspond à votre recherche.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
              gap: 14
            }}>
              {filteredBillingCenters.map((item: any, index: number) => {
                const revenue =
                  Number(item.revenueTTC ?? item.revenue) || 0;

                const revenueShare =
                  billingTotals.revenueTTC > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          revenue / billingTotals.revenueTTC * 100
                        )
                      )
                    : 0;

                const subscribers = Number(item.subscribers) || 0;
                const volumeConsumed = Number(item.volumeConsumed) || 0;
                const volumeBilled = Number(item.volumeBilled) || 0;
                const revenueHT = Number(item.revenueHT) || 0;

                return (
                  <article
                    key={item.name}
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      padding: 16,
                      background: 'var(--bg-inner)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 12,
                      transition: 'border-color .2s, transform .2s'
                    }}
                  >
                    {/* Identité et classement */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 10
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        minWidth: 0
                      }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(56,189,248,0.12)',
                          border: '1px solid rgba(56,189,248,0.23)',
                          borderRadius: 10,
                          color: '#38bdf8'
                        }}>
                          <Building2 size={19} />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 750,
                            lineHeight: 1.45,
                            color: 'var(--text-strong)',
                            overflowWrap: 'anywhere'
                          }}>
                            {item.name}
                          </div>

                          <div style={{
                            marginTop: 3,
                            fontSize: 10.5,
                            color: 'var(--text-muted)'
                          }}>
                            Centre de facturation
                          </div>
                        </div>
                      </div>

                      <span style={{
                        minWidth: 32,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        borderRadius: 7,
                        background: index === 0
                          ? 'rgba(16,185,129,0.15)'
                          : 'rgba(148,163,184,0.10)',
                        color: index === 0
                          ? '#10b981'
                          : 'var(--text-muted)',
                        fontSize: 11,
                        fontWeight: 800
                      }}>
                        #{String(index + 1).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Chiffre d'affaires TTC */}
                    <div style={{
                      padding: 13,
                      background: 'rgba(16,185,129,0.055)',
                      border: '1px solid rgba(16,185,129,0.17)',
                      borderRadius: 9
                    }}>
                      <div style={{
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        marginBottom: 6
                      }}>
                        Chiffre d'affaires TTC
                      </div>

                      <div
                        title={`${revenue.toLocaleString('fr-FR')} GNF`}
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          lineHeight: 1.35,
                          color: '#10b981',
                          overflowWrap: 'anywhere'
                        }}
                      >
                        {gnfCompact(revenue)}
                      </div>

                      <div style={{
                        height: 5,
                        marginTop: 11,
                        background: 'rgba(148,163,184,0.15)',
                        borderRadius: 999,
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${revenueShare}%`,
                          background: 'linear-gradient(90deg, #059669, #34d399)',
                          borderRadius: 999
                        }} />
                      </div>

                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginTop: 7,
                        fontSize: 10,
                        color: 'var(--text-muted)'
                      }}>
                        <span>Part du CA total</span>
                        <strong style={{ color: '#10b981' }}>
                          {revenueShare.toLocaleString('fr-FR', {
                            maximumFractionDigits: 2
                          })}%
                        </strong>
                      </div>
                    </div>

                    {/* Indicateurs opérationnels */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 9
                    }}>
                      <div style={{
                        padding: 10,
                        background: 'rgba(56,189,248,0.055)',
                        border: '1px solid rgba(56,189,248,0.13)',
                        borderRadius: 8,
                        minWidth: 0
                      }}>
                        <div style={{
                          fontSize: 10,
                          color: 'var(--text-muted)'
                        }}>
                          Abonnés facturés
                        </div>
                        <div style={{
                          marginTop: 6,
                          fontSize: 15,
                          fontWeight: 750,
                          color: 'var(--text-strong)',
                          overflowWrap: 'anywhere'
                        }}>
                          {num(subscribers)}
                        </div>
                      </div>

                      <div style={{
                        padding: 10,
                        background: 'rgba(245,158,11,0.055)',
                        border: '1px solid rgba(245,158,11,0.13)',
                        borderRadius: 8,
                        minWidth: 0
                      }}>
                        <div style={{
                          fontSize: 10,
                          color: 'var(--text-muted)'
                        }}>
                          Volume facturé
                        </div>
                        <div style={{
                          marginTop: 6,
                          fontSize: 15,
                          fontWeight: 750,
                          color: 'var(--text-strong)',
                          overflowWrap: 'anywhere'
                        }}>
                          {num(volumeBilled)} m³
                        </div>
                      </div>
                    </div>

                    {/* Détails complémentaires */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 9,
                      paddingTop: 11,
                      borderTop: '1px solid rgba(255,255,255,0.055)',
                      fontSize: 11
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Volume consommé
                        </span>
                        <strong style={{ color: 'var(--text-secondary)' }}>
                          {num(volumeConsumed)} m³
                        </strong>
                      </div>

                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Chiffre d'affaires HT
                        </span>
                        <strong style={{ color: 'var(--text-secondary)' }}>
                          {gnfCompact(revenueHT)}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 17,
            paddingTop: 12,
            borderTop: '1px solid var(--border-color)',
            fontSize: 11,
            color: 'var(--text-muted)'
          }}>
            <span>Source : Supabase · seg_facturation_centres_mensuelle</span>
            <span>Classement calculé à partir du chiffre d'affaires TTC</span>
          </div>
        </div>
      )}
    </div>
  );
}