'use client';

import { useClientTypes } from '@/lib/use-overview';

type Props = {
  year: number;
  onYear: (y: number) => void;
  clientType: string;
  onClientType: (c: string) => void;
  loading: boolean;
  error: string;
  label: string;
};

export function DetailFilterBar({ year, onYear, clientType, onClientType, loading, error, label }: Props) {
  const clientTypes = useClientTypes();
  return (
    <div className="dashboard-filter-bar" style={{ marginBottom: '2px' }}>
      <div>
        <span className="filter-label">Exercice</span>
        <select value={year} onChange={(e) => onYear(Number(e.target.value))}>
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
        </select>
      </div>
      <div>
        <span className="filter-label">Segment clientèle</span>
        <select value={clientType} onChange={(e) => onClientType(e.target.value)}>
          <option value="">Tous</option>
          {clientTypes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
        <span />
        {loading ? 'Actualisation…' : error ? 'MySQL indisponible' : 'Données synchronisées'}
      </div>
    </div>
  );
}
