'use client';

import { useEffect, useState } from 'react';

/* Fil d'actualités : dernières notifications réelles de SEG CONNECT
 * (imports, alertes qualité…). Plus aucun message de démonstration. */

type Notif = { id?: number | string; title?: string; message?: string; created_at?: string; createdAt?: string };

export function NewsTicker() {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/notifications?limit=8', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const rows: Notif[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.items) ? json.data.items : [];
        const lines = rows
          .map((n) => {
            const text = String(n.title || n.message || '').trim();
            if (!text) return '';
            const date = n.created_at || n.createdAt;
            const d = date ? new Date(date) : null;
            const stamp = d && !Number.isNaN(d.getTime())
              ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '';
            return stamp ? `${stamp} — ${text}` : text;
          })
          .filter(Boolean);
        if (!cancelled) setItems(lines);
      } catch {
        /* le bandeau reste sur le message par défaut */
      }
    }

    void load();
    const timer = window.setInterval(load, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const list = items.length ? items : ['Aucune actualité récente — les notifications SEG CONNECT s’afficheront ici.'];

  return (
    <footer className="news-ticker-bar">
      <div className="ticker-left">
        <span className="pulse-dot" />
        <span>Fil d&apos;actualités</span>
      </div>

      <div className="ticker-center">
        <div className="ticker-items-flex">
          {[...list, ...list].map((item, idx) => (
            <div key={idx} className="ticker-item">{item}</div>
          ))}
        </div>
      </div>

      <div className="ticker-right">
        <span className="status-green-dot" />
        <span>Système opérationnel</span>
      </div>
    </footer>
  );
}
