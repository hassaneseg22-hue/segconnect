'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'busy';

function b64ToBytes(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const btn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px',
  borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)',
  color: 'inherit', cursor: 'pointer',
} as const;

export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState('unsupported'); return;
      }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.getSubscription();
        setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
      } catch { setState('unsupported'); }
    })();
  }, []);

  const enable = async () => {
    setState('busy'); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
      const r = await fetch('/api/push/subscribe', { credentials: 'include', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.publicKey) throw new Error(j?.error || 'Clé de notification indisponible.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(j.publicKey) as BufferSource }));
      const s = await fetch('/api/push/subscribe', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), test: true }),
      });
      const sj = await s.json().catch(() => ({}));
      if (!s.ok || !sj.ok) throw new Error(sj?.error || 'Enregistrement refusé.');
      setState('on');
      setMsg(sj.test === 'ok' ? 'Notification de test envoyée.' : '');
    } catch (e) {
      setState('off');
      setMsg(e instanceof Error ? e.message : 'Activation impossible.');
    }
  };

  const disable = async () => {
    setState('busy'); setMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch { setState('on'); }
  };

  if (state === 'loading') return null;
  const note = (t: string) => <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{t}</span>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {state === 'unsupported' && note('Notifications navigateur non prises en charge sur cet appareil.')}
      {state === 'denied' && note('Notifications bloquées : cadenas de la barre d’adresse → Notifications → Autoriser.')}
      {state === 'off' && (
        <button type="button" style={btn} onClick={() => void enable()}>
          <BellRing size={14} /> Activer les notifications sur cet appareil
        </button>
      )}
      {state === 'on' && (
        <>
          <span style={{ fontSize: 12, color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <BellRing size={14} /> Notifications actives sur cet appareil
          </span>
          <button type="button" style={{ ...btn, padding: '3px 8px', fontSize: 11 }} onClick={() => void disable()}>
            <BellOff size={12} /> Désactiver
          </button>
        </>
      )}
      {state === 'busy' && note('…')}
      {msg && note(msg)}
    </div>
  );
}
