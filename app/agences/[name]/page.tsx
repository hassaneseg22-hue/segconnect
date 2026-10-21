'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Droplets, Scale, Receipt, Banknote, Wallet, TrendingDown, Building2, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Legend } from 'recharts';
import { useOverview } from '@/lib/use-overview';
import { gnf, num, pct } from '@/lib/format';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

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

export default function AgencyDetail({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const agency = decodeURIComponent(name);
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');

  const { data, loading, error } = useOverview(year, clientType, agency);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const y = sp.get('year');
    if (y && !isNaN(Number(y))) setYear(Number(y));
    const c = sp.get('clientType');
    if (c) setClientType(c);
  }, []);

  const kpis = data?.kpis || {};
  const agencies: any[] = data?.agencies || [];
  const row = agencies[0] || {};

  const subscribers = Number(kpis.subscribers) || 0;
  const production = Number(kpis.production) || 0;
  const consumption = Number(kpis.technicalConsumption) || 0;
  const volumeBilled = Number(kpis.volumeBilled) || 0;
  const revenue = Number(kpis.revenue) || 0;
  const paid = Number(kpis.paid) || 0;
  const balance = Number(kpis.balance) || 0;
  const recovery = Number(kpis.recovery) || 0;
  const networkYield = Number(kpis.networkYield) || 0;
  const billedWithPenalty = Number(kpis.billedWithPenalty) || 0;
  const impayePct = billedWithPenalty > 0 ? 1 - recovery : 0;

  const monthly = (data?.agencyMonthly || [])
    .filter((m: any) => m.name === agency)
    .sort((a: any, b: any) => a.month.localeCompare(b.month))
    .map((m: any, i: number) => {
      const mo = Number(String(m.month).slice(5, 7));
      return { mois: MONTHS[(mo - 1 + 12) % 12], production: Number(m.production) || 0, consommation: Number(m.consumption) || 0, facturation: Number(m.billing_volume) || 0 };
    });

  const commercial = [
    { nom: 'CA facturé', valeur: revenue, color: '#38bdf8' },
    { nom: 'Volume facturé', valeur: volumeBilled, color: '#818cf8' },
    { nom: 'Encaissé', valeur: paid, color: '#10b981' },
    { nom: 'Impayés', valeur: balance, color: '#ef4444' }
  ];
  const commercialGnf = commercial.map((c) => ({ nom: c.nom, valeur: c.valeur, color: c.color }));
  const commercialChart = commercial.map((c) => ({ nom: c.nom, valeur: c.valeur }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/agences" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Agences &amp; Centres
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>{agency}</span>
      </div>

      {error && <div className="db-error-banner">{error}. Démarre MySQL dans XAMPP puis recharge la page.</div>}

      {/* Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Agence de {agency}</h2>
          <p>Fiche détaillée — indicateurs réels issus des relevés technico-commerciaux · exercice {year}{clientType ? ` · ${clientType}` : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge-pill green">● Active</span>
          <span className="badge-pill cyan">{pct(recovery)} recouvrement</span>
        </div>
      </div>

      {/* Perf indicator + indicators */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Performance globale — indicateurs réels</h3>
          <span className="badge-pill amber">Score /100 en V0.3 avec objectifs SEG</span>
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>Chargement des données…</div>
        ) : (
          <>
            <div className="subpage-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}><Users size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Abonnés</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{num(subscribers)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">{year}</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}><Droplets size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Production</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{volumeCompact(production)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">volume produit</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}><Activity size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Consommation</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{volumeCompact(consumption)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">volume consommé</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(251,113,133,0.15)', color: '#fb7185', border: '1px solid rgba(251,113,133,0.3)' }}><Scale size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Volume facturé</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{volumeCompact(volumeBilled)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">m³ </span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}><Receipt size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Chiffre d'affaires</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{gnfCompact(revenue)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">CA facturé</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}><Banknote size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Encaissé</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{gnfCompact(paid)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">recouvré</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}><TrendingDown size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Impayés</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>{gnfCompact(balance)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">{pct(impayePct)} du exigible</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}><Wallet size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Recouvrement</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px', color: recovery >= 0.85 ? '#10b981' : '#f59e0b' }}>{pct(recovery)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">{recovery >= 0.85 ? 'Cible atteinte' : 'Sous la cible 85%'}</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header">
                  <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}><Building2 size={18} /></div>
                  <div className="kpi-title-value"><div className="kpi-title">Rendement réseau</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px', color: networkYield >= 1 ? '#ef4444' : '#10b981' }}>{pct(networkYield)}</span></div></div>
                </div>
                <div className="kpi-foot-row"><span className="kpi-period">consommé / produit</span></div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Évolution mensuelle */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Évolution mensuelle — {agency}</h3>
          <span className="badge-pill cyan">{year}</span>
        </div>
        {monthly.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>{loading ? 'Chargement…' : 'Aucune série mensuelle technique pour cette agence.'}</div>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly}>
                <defs>
                  <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gCons" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mois" stroke="#556c84" fontSize={11} />
                <YAxis stroke="#556c84" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="production" name="Production" stroke="#38bdf8" fill="url(#gProd)" strokeWidth={2} />
                <Area type="monotone" dataKey="consommation" name="Consommation" stroke="#a78bfa" fill="url(#gCons)" strokeWidth={2} />
                <Area type="monotone" dataKey="facturation" name="Facturation" stroke="#fbbf24" fill="transparent" strokeWidth={2} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>
        {/* Commercial */}
        <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header-flex">
            <h3>💰 Performance commerciale</h3>
            <span className="badge-pill green">CA | Facturé | Encaissé | Impayés</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            {commercialGnf.map((c) => (
              <div key={c.nom} style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.nom}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: c.color }}>{c.nom === 'Volume facturé' ? volumeCompact(c.valeur) : gnfCompact(c.valeur)}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={commercialChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="nom" stroke="#556c84" fontSize={10} interval={0} />
                <YAxis stroke="#556c84" fontSize={10} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
                <Bar dataKey="valeur" name="GNF" radius={[4, 4, 0, 0]}>
                  {commercialChart.map((c, i) => <Cell key={i} fill={commercialColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Technique */}
        <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header-flex">
            <h3>💧 Performance technique</h3>
            <span className="badge-pill cyan">Production | Consommation | Rendement</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Production</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>{volumeCompact(production)}</div>
            </div>
            <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Consommation</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#a78bfa' }}>{volumeCompact(consumption)}</div>
            </div>
            <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rendement</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: networkYield >= 1 ? '#ef4444' : '#10b981' }}>{pct(networkYield)}</div>
            </div>
            <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Volume facturé</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>{volumeCompact(volumeBilled)}</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mois" stroke="#556c84" fontSize={10} />
                <YAxis stroke="#556c84" fontSize={10} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
                <Bar dataKey="production" name="Production" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="consommation" name="Consommation" fill="#a78bfa" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="dark-alert-box info">
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Les indicateurs affichés sont <strong>issus directement des relevés Excel importés</strong> dans MySQL : aucune valeur n'est estimée. Le score de performance agrégé /100 et le classement entre agences seront activés en V0.3 avec les objectifs officiels SEG (pondérations configurables).
        </p>
      </div>
    </div>
  );
}

const commercialColor = (i: number) => ['#38bdf8', '#818cf8', '#10b981', '#ef4444'][i] || '#38bdf8';