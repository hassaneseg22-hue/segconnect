'use client';

import { Users, ClipboardCheck, CheckCircle2, AlertTriangle, MessageSquare, Wallet, ArrowRight } from 'lucide-react';
import { KpiItem } from '@/lib/dashboard-data';
import Link from 'next/link';

const iconMap = {
  users: Users,
  clipboard: ClipboardCheck,
  check: CheckCircle2,
  alert: AlertTriangle,
  chat: MessageSquare,
  wallet: Wallet
};

// Map KPI id → detail page route
const kpiRoutes: Record<string, string> = {
  subscribers:    '/kpi/abonnes',
  production:     '/kpi/production',
  'volume-billed':'/kpi/volume-facture',
  revenue:        '/kpi/chiffre-affaires',
  balance:        '/kpi/impayes',
  recovery:       '/kpi/recouvrement',
};

export function KpiCard({ item }: { item: KpiItem }) {
  const IconComponent = iconMap[item.icon];
  const route = kpiRoutes[item.id];

  const cardContent = (
    <>
      <div className="kpi-header">
        <div
          className="kpi-icon-wrap"
          style={{
            background: `${item.color}20`,
            color: item.color,
            border: `1px solid ${item.color}40`
          }}
        >
          <IconComponent size={20} />
        </div>
        <div className="kpi-title-value">
          <div className="kpi-title">{item.title}</div>
          <div className="kpi-num-row">
            <span className="kpi-main-val">{item.value}</span>
            {item.total && <span className="kpi-total-val">{item.total}</span>}
          </div>
        </div>
      </div>

      <div className="kpi-foot-row">
        <div className={`kpi-trend ${item.trendType || 'positive'}`}>
          <span>{item.trend}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {item.period && <div className="kpi-period">{item.period}</div>}
          {route && (
            <span style={{
              fontSize: '9px',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              opacity: 0.7
            }}>
              <ArrowRight size={10} />
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (route) {
    return (
      <Link
        href={route}
        className="kpi-card"
        style={{
          textDecoration: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'pointer',
          position: 'relative',
          transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s',
        }}
        title={`Voir le détail : ${item.title}`}
      >
        {cardContent}
        {/* Subtle "clickable" glow indicator */}
        <span style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: item.color,
          boxShadow: `0 0 6px ${item.color}`,
          opacity: 0.5
        }} />
      </Link>
    );
  }

  return (
    <div className="kpi-card">
      {cardContent}
    </div>
  );
}

export function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-grid-6">
      {items.map((kpi) => (
        <KpiCard key={kpi.id} item={kpi} />
      ))}
    </div>
  );
}

// Backward compatibility export
export function Kpi({ label, value, foot }: { label: string; value: string; foot?: string; delay?: number }) {
  return (
    <div className="kpi-card">
      <div className="kpi-title">{label}</div>
      <div className="kpi-main-val">{value}</div>
      {foot && <div className="kpi-period">{foot}</div>}
    </div>
  );
}
