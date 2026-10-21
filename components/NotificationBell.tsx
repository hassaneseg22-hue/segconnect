'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Eye, ExternalLink, RefreshCw } from 'lucide-react';
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

const TYPE_META: Record<Notif['type'], { label: string; icon: string; color: string; bg: string }> = {
  critical: { label: 'CRITIQUE', icon: '🔴', color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  warning: { label: 'ATTENTION', icon: '🟠', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)' },
  info: { label: 'INFORMATION', icon: '🔵', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
  success: { label: 'SYSTÈME', icon: '🟢', color: '#34d399', bg: 'rgba(16,185,129,0.12)' }
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `à l'instant`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [counts, setCounts] = useState<Counts>({ unread: 0, critical: 0, warning: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Notif['type']>('all');
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = async () => {
    try {
      const r = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) {
        setNotifs(j.data);
        setCounts(j.counts);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000); // rafraîchissement léger
    return () => clearInterval(id);
  }, []);

  // Fermer au clic extérieur
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markAll = async () => {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    setCounts((c) => ({ ...c, unread: 0, critical: 0, warning: 0 }));
    setNotifs((n) => n.map((x) => ({ ...x, is_read: 1 })));
  };

  const openNotif = async (n: Notif) => {
    if (!n.is_read) {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id })
      });
      setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - 1), critical: n.type === 'critical' ? Math.max(0, c.critical - 1) : c.critical }));
      setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
    }
    setOpen(false);
    if (n.target_url) router.push(n.target_url);
  };

  const filtered = filter === 'all' ? notifs : notifs.filter((n) => n.type === filter);
  const grouped = (['critical', 'warning', 'info', 'success'] as const)
    .map((t) => ({ t, items: filtered.filter((n) => n.type === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="header-icon-btn"
        title="Centre de notifications DG"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={17} />
        {counts.unread > 0 && (
          <span className={`header-badge ${counts.critical > 0 ? 'badge-critical-pulse' : ''}`}>
            {counts.unread > 99 ? '99+' : counts.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          {/* Header */}
          <div className="notif-panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} style={{ color: '#38bdf8' }} />
              <strong style={{ color: 'var(--text-strong)' }}>Centre de notifications</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {counts.unread > 0 && (
                <button className="notif-link-btn" onClick={markAll} title="Tout marquer comme lu">
                  <CheckCheck size={13} /> Tout lire
                </button>
              )}
              <button className="notif-link-btn" onClick={() => { load(); }} title="Actualiser">
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Filtres par catégorie */}
          <div className="notif-filters">
            {([['all', 'Tout'], ['critical', 'Critique'], ['warning', 'Attention'], ['info', 'Info'], ['success', 'Système']] as const).map(([k, label]) => (
              <button
                key={k}
                className={`notif-filter-chip ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k as any)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div className="notif-panel-list">
            {loading && notifs.length === 0 && (
              <div className="notif-empty">Chargement des notifications…</div>
            )}
            {!loading && grouped.length === 0 && (
              <div className="notif-empty">Aucune notification. Cliquez « Système » puis actualisez le moteur d'alertes.</div>
            )}
            {grouped.map(({ t, items }) => (
              <div key={t}>
                <div className="notif-group-label" style={{ color: TYPE_META[t].color }}>
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </div>
                {items.map((n) => (
                  <button key={n.id} className={`notif-item ${n.is_read ? 'read' : ''}`} onClick={() => openNotif(n)}>
                    <div style={{ width: 3, height: '100%', background: TYPE_META[n.type].color, opacity: n.is_read ? 0.25 : 1, borderRadius: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="notif-item-head">
                        <span className="notif-item-title">{n.title}</span>
                        <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                      </div>
                      <div className="notif-item-msg">{n.message.split('\n').map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}</div>
                      {n.target_url && (
                        <span className="notif-item-act">
                          <ExternalLink size={10} /> Analyser
                        </span>
                      )}
                    </div>
                    {!n.is_read && <span className="notif-unread-dot" />}
                    {n.is_read && <Eye size={11} style={{ color: '#475569' }} />}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="notif-panel-foot">
            <button className="notif-link-btn" style={{ fontWeight: 700, color: '#38bdf8' }} onClick={() => { setOpen(false); router.push('/notifications'); }}>
              Voir toutes les notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
