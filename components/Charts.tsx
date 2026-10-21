'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  LabelList,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { ChevronDown } from 'lucide-react';

// Custom tooltip for dark mode
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: 'var(--bg-inner)',
          border: '1px solid var(--border-color)',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          color: 'var(--text-strong)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ color: '#38bdf8', fontWeight: 700, marginTop: '2px' }}>
          {payload[0].value.toLocaleString('fr-FR')} m³
        </div>
      </div>
    );
  }
  return null;
};

// 1. Production d'eau — série mensuelle réelle (aucune donnée de démonstration)
function compactM3(value: number): string {
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3).toLocaleString('fr-FR')} k`;
  return String(Math.round(value));
}

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export function WaterProductionCard({ data, total, target: _target, period, title, source }: {
  data?: any[];
  total?: number;
  target?: number;
  period?: string;
  title?: string;
  source?: string;
}) {
  const rows = (data ?? [])
    .map((x: any) => {
      const month = String(x.month ?? '');
      const m = Number(month.slice(5, 7));
      return { hour: m >= 1 && m <= 12 ? MONTH_SHORT[m - 1] : month, prod: Number(x.production) || 0 };
    })
    .filter((x) => x.prod > 0);

  return (
    <div className="dashboard-card production-card">
      <div className="card-header-flex">
        <h3>{title || "Production d'Eau (m³)"}</h3>
        <div className="dropdown-badge">
          <span>{period || 'Cumul période'}</span>
        </div>
      </div>

      <div className="prod-kpi-row">
        <div className="prod-volume">{(total ?? 0).toLocaleString('fr-FR')} m³</div>
        <div className="prod-target-badge">
          <span>Cumul</span>
          <div className="circle-progress-badge">
            <span className="circle-progress-text">{rows.length} mois</span>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ height: 165, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          Aucune donnée de production pour cette période.
        </div>
      ) : (
        <div style={{ width: '100%', height: 165 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="waterProdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00b4d8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
              <XAxis dataKey="hour" stroke="#556c84" fontSize={10} tickLine={false} axisLine={{ stroke: '#172c47' }} />
              <YAxis stroke="#556c84" fontSize={10} tickLine={false} axisLine={false} width={44}
                tickFormatter={(val) => compactM3(Number(val))} domain={[0, 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="prod" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#waterProdGrad)"
                dot={{ r: 3, fill: '#ffffff', stroke: '#0284c7', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#38bdf8', stroke: '#ffffff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {source && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>Source : {source}</div>}
    </div>
  );
}

// 2. Regional Donut Chart
export function RegionalDistributionCard({ data, period }: { data?: any[]; period?: string }) {
  const chartData = data !== undefined
    ? data.map((item: any) => ({
        ...item,
        agents: Number(item.value ?? item.agents ?? 0),
      }))
    : [];

  const totalValue = chartData.reduce(
    (sum: number, item: any) =>
      sum + Number(item.value ?? item.agents ?? 0),
    0
  );

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Répartition du CA par centre</h3>
        <div className="dropdown-badge">
          <span>{period || 'Cumul de l’exercice'}</span>
          <ChevronDown size={12} />
        </div>
      </div>

      <div className="donut-layout">
        {/* Donut Chart with Centered Total */}
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={56}
                paddingAngle={3}
                dataKey="agents"
              >
                {(chartData).map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#0c1b2e" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center-label">
            <div className="sub">Total</div>
            <div className="num">{totalValue.toLocaleString('fr-FR')}</div>
            <div className="sub">CA / centre</div>
          </div>
        </div>

        {/* Legend listing */}
        <div className="donut-legend-list">
          {chartData.map((r: any) => (
            <div key={r.name} className="donut-legend-item">
              <div className="donut-legend-left">
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: r.color,
                    display: 'inline-block'
                  }}
                />
                <span>{r.name}</span>
              </div>
              <div className="donut-legend-right">
                {(r.agents ?? r.value ?? 0).toLocaleString('fr-FR')} <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>GNF</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. Availability card: missions are not present in the current Excel sources.
export function MissionsStatusBarCard({ available = false }: { available?: boolean }) {
  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Missions par Statut</h3>
        <div className="dropdown-badge"><span>Source SEG</span><ChevronDown size={12} /></div>
      </div>
      <div style={{ minHeight: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{available ? 'Données missions disponibles' : 'Données non disponibles dans les sources actuelles'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 7, lineHeight: 1.5 }}>
            {available ? 'Ce bloc sera alimenté par la source opérationnelle dédiée.' : 'Aucune donnée de missions n’a été inventée. Le module est prêt à être connecté à la future source opérationnelle.'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Legacy helpers for subpages
export function Evolution({ data }: { data: any[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="mois" stroke="var(--text-dim)" fontSize={11} />
          <YAxis stroke="var(--text-dim)" fontSize={11} />
          <Tooltip contentStyle={{ background: 'var(--bg-inner)', borderColor: 'var(--border-color)' }} />
          <Legend />
          <Line type="monotone" dataKey="production" name="Production" stroke="#38bdf8" strokeWidth={2.5} />
          <Line type="monotone" dataKey="consommation" name="Consommation" stroke="#10b981" strokeWidth={2.5} />
          <Line type="monotone" dataKey="facturation" name="Volume facturé" stroke="#f59e0b" strokeWidth={2.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RecouvChart({ data }: { data: any[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="mois" stroke="var(--text-dim)" fontSize={11} />
          <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip contentStyle={{ background: 'var(--bg-inner)', borderColor: 'var(--border-color)' }} formatter={(v: any) => `${Math.round(v * 100)}%`} />
          <Bar dataKey="recouvrement" name="Recouvrement" fill="#0284c7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

