'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ArrowLeft, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Notif = {
  id: number;
  type: 'critical' | 'warning' | 'info' | 'success';
  category: string;
  title: string;
  message: string;
  source: string | null;
  severity_score: number;
  target_url: string | null;
  is_read: number;
  created_at: string;
};
type Counts = { unread: number; critical: number; warning: number };

const TYPE_META: Record<Notif['type'], { label: string; icon: string; color: string }> = {
  critical: { label: 'CRITIQUE', icon: '🔴', color: '#f87171' },
  warning: { label: 'ATTENTION', icon: '🟠', color: '#fbbf24' },
  info: { label: 'INFORMATION', icon: '🔵', color: '#38bdf8' },
  success: { label: 'SYSTÈME', icon: '🟢', color: '#34d399' }
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [counts, setCounts] = useState<Counts>({ unread: 0, critical: 0, warning: 0 });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterType, setFilterType] = useState<'all' | Notif['type']>('all');
  const [showRead, setShowRead] = useState(true);
  const [genMsg, setGenMsg] = useState('');
  const router = useRouter();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notifications?limit=200', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) { setNotifs(j.data); setCounts(j.counts); }
    } catch { /* empty */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const regenerate = async () => {
    setRunning(true);
    setGenMsg('');
    try {
      const r = await fetch('/api/notifications', { method: 'POST' });
      const j = await r.json();
      if (j.ok) {
        setCounts(j.counts);
        setGenMsg(`Moteur d'alertes exécuté : ${j.generated} notification(s) émise(s), ${j.skipped} écrasée(s)/dédupliquée(s).`);
      } else {
        setGenMsg(`Erreur : ${j.error}`);
      }
    } catch { setGenMsg("Impossible de contacter le moteur d'alertes (MySQL ?)."); }
    finally { setRunning(false); load(); }
  };

  const markAll = async () => {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    setNotifs((n) => n.map((x) => ({ ...x, is_read: 1 })));
    setCounts((c) => ({ ...c, unread: 0, critical: 0, warning: 0 }));
  };

  const markOne = async (n: Notif) => {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) });
    setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
    setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - 1), critical: n.type === 'critical' ? Math.max(0, c.critical - 1) : c.critical }));
  };

  const filtered = notifs.filter((n) =>
    (filterType === 'all' || n.type === filterType) &&
    (showRead || !n.is_read)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} /> Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Centre de notifications</span>
      </div>

      {/* Header + actions */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><Bell size={20} style={{ display: 'inline', marginRight: 6, color: '#38bdf8' }} />Centre de Notifications DG</h2>
          <p>Alertes financières, techniques, commerciales, qualité des données et système — générées depuis MySQL</p>
        </div>
        <div className="subpage-filters">
          <button className="btn-brand" onClick={regenerate} disabled={running} style={{ fontSize: '11.5px', padding: '8px 12px' }}>
            <RefreshCw size={13} className={running ? 'spin' : ''} />
            {running ? 'Analyse en cours…' : 'Régénérer les alertes'}
          </button>
          {counts.unread > 0 && (
            <button className="btn-brand ghost" onClick={markAll} style={{ fontSize: '11.5px', padding: '8px 12px' }}>
              <CheckCheck size={13} /> Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {/* Résumé */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
              <Bell size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Notifications non lues</div>
              <div className="kpi-num-row"><span className="kpi-main-val">{counts.unread}</span></div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Critiques non lues</div>
              <div className="kpi-num-row"><span className="kpi-main-val" style={{ color: '#f87171' }}>{counts.critical}</span></div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Alertes non lues</div>
              <div className="kpi-num-row"><span className="kpi-main-val" style={{ color: '#fbbf24' }}>{counts.warning}</span></div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              <CheckCheck size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Total reçues</div>
              <div className="kpi-num-row"><span className="kpi-main-val">{notifs.length}</span></div>
            </div>
          </div>
        </div>
      </div>

      {genMsg && <div className="dark-alert-box info"><p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{genMsg}</p></div>}

      {/* Filtres */}
      <div className="dashboard-filter-bar" style={{ marginBottom: '2px' }}>
        {([['all', 'Tout'], ['critical', '🔴 Critique'], ['warning', '🟠 Attention'], ['info', '🔵 Info'], ['success', '🟢 Système']] as const).map(([k, label]) => (
          <button key={k} className={`notif-filter-chip ${filterType === k ? 'active' : ''}`} onClick={() => setFilterType(k as any)} style={{ width: 'auto', display: 'inline-flex' }}>
            {label}
          </button>
        ))}
        <button className="notif-filter-chip" onClick={() => setShowRead((s) => !s)} style={{ width: 'auto', display: 'inline-flex', marginLeft: 'auto' }}>
          {showRead ? 'Cacher les lues' : 'Afficher les lues'}
        </button>
      </div>

      {/* Liste complète */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading && <div className="dark-alert-box info"><p style={{ color: 'var(--text-secondary)' }}>Chargement…</p></div>}
        {!loading && filtered.length === 0 && (
          <div className="dashboard-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}>
            Aucune notification pour ce filtre. Lancez « Régénérer les alertes » pour analyser les données MySQL.
          </div>
        )}
        {filtered.map((n) => {
          const meta = TYPE_META[n.type];
          return (
            <div key={n.id} className={`dashboard-card notif-row ${n.is_read ? 'read' : ''}`} style={{ padding: '14px 16px' }}>
              <div style={{ width: 4, borderRadius: 3, background: meta.color, opacity: n.is_read ? 0.25 : 1, alignSelf: 'stretch' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '18px' }}>{meta.icon}</span>
                  <strong style={{ color: 'var(--text-strong)', fontSize: '14px' }}>{n.title}</strong>
                  <span className={`badge-pill ${n.type === 'critical' ? 'red' : n.type === 'warning' ? 'amber' : n.type === 'info' ? 'cyan' : 'green'}`} style={{ fontSize: '10px' }}>
                    {meta.label}
                  </span>
                  {!n.is_read && <span className="badge-pill purple" style={{ fontSize: '9.5px' }}>Non lue</span>}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{n.message}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '11px', color: 'var(--text-dim)' }}>
                  <span>🕐 {fmtDate(n.created_at)}</span>
                  {n.source && <span style={{ color: 'var(--text-muted)' }}>{n.source}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {!n.is_read && (
                      <button className="notif-link-btn" onClick={() => markOne(n)}><CheckCheck size={12} /> Marquer lu</button>
                    )}
                    {n.target_url && (
                      <button className="notif-link-btn" style={{ color: '#38bdf8' }} onClick={() => router.push(n.target_url!)}>
                        <ExternalLink size={12} /> Analyser
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
