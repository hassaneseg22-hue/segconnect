'use client';

import { useEffect, useState } from 'react';
import { Download, RotateCw, Share2 } from 'lucide-react';

type Props = {
  firstName?: string;
  lastName?: string;
  displayName: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: string;
  initials?: string;
};

type Ctx = CanvasRenderingContext2D;
type Draw = {
  name: string; title: string; email: string; phone: string; initials: string;
  logo: HTMLImageElement | null; photo: HTMLImageElement | null; qr: HTMLImageElement | null;
};

const W = 1050;
const H = 600;
const SC = 2;
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, system-ui, sans-serif";
const RED = '#ce1126';
const YEL = '#fcd116';
const GRN = '#009460';

const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });

const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

const ls = (c: Ctx, px: number) => {
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
};

function fit(c: Ctx, text: string, maxW: number, start: number, weight: number | string, min = 24) {
  let size = start;
  c.font = `${weight} ${size}px ${FONT}`;
  while (size > min && c.measureText(text).width > maxW) {
    size -= 2;
    c.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function flagBar(c: Ctx, x: number, y: number, w: number, h: number) {
  const t = Math.ceil(w / 3);
  c.fillStyle = RED; c.fillRect(x, y, t, h);
  c.fillStyle = YEL; c.fillRect(x + t, y, t, h);
  c.fillStyle = GRN; c.fillRect(x + 2 * t, y, w - 2 * t, h);
}

function drawLogo(c: Ctx, d: Draw, x: number, y: number, size: number) {
  c.save();
  rr(c, x, y, size, size, size * 0.22);
  c.clip();
  if (d.logo) c.drawImage(d.logo, x, y, size, size);
  else { c.fillStyle = '#0284c7'; c.fillRect(x, y, size, size); }
  c.restore();
}

function drawFront(c: Ctx, d: Draw) {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#06101d'); g.addColorStop(0.55, '#0b2745'); g.addColorStop(1, '#0a3d5f');
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  c.save();
  c.strokeStyle = 'rgba(56,189,248,0.10)'; c.lineWidth = 2;
  for (let i = 1; i <= 6; i++) { c.beginPath(); c.arc(W - 60, H + 30, 90 + i * 85, 0, Math.PI * 2); c.stroke(); }
  c.restore();

  const cx = W - 175, cy = 255;
  const rg = c.createRadialGradient(cx, cy, 20, cx, cy, 340);
  rg.addColorStop(0, 'rgba(56,189,248,0.22)'); rg.addColorStop(1, 'rgba(56,189,248,0)');
  c.fillStyle = rg; c.fillRect(0, 0, W, H);

  flagBar(c, 0, H - 12, W, 12);

  drawLogo(c, d, 60, 52, 84);
  c.fillStyle = '#ffffff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  ls(c, 2); c.font = `700 22px ${FONT}`; c.fillText('SOCIÉTÉ DES EAUX DE GUINÉE', 164, 92);
  ls(c, 3); c.font = `600 15px ${FONT}`; c.fillStyle = '#7dd3fc'; c.fillText('RÉPUBLIQUE DE GUINÉE', 164, 122);
  ls(c, 0);

  // Photo + anneau tricolore
  const R = 112;
  c.save();
  c.lineWidth = 11; c.lineCap = 'butt';
  [[RED, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3], [YEL, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3], [GRN, -Math.PI / 2 + (4 * Math.PI) / 3, Math.PI * 1.5]].forEach(([col, a0, a1]) => {
    c.strokeStyle = col as string; c.beginPath(); c.arc(cx, cy, R + 8, a0 as number, a1 as number); c.stroke();
  });
  c.restore();
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
  if (d.photo) {
    const s = Math.max((R * 2) / d.photo.width, (R * 2) / d.photo.height);
    const w = d.photo.width * s, h = d.photo.height * s;
    c.drawImage(d.photo, cx - w / 2, cy - h / 2, w, h);
  } else {
    const pg = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    pg.addColorStop(0, '#1e3a5f'); pg.addColorStop(1, '#0f2038');
    c.fillStyle = pg; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    c.fillStyle = '#38bdf8'; c.font = `800 84px ${FONT}`; c.textAlign = 'center';
    c.fillText(d.initials || 'DG', cx, cy + 30);
    c.textAlign = 'left';
  }
  c.restore();

  // Nom
  const maxW = W - 60 - 360;
  c.fillStyle = '#ffffff';
  fit(c, d.name, maxW, 66, 800, 30);
  c.fillText(d.name, 60, 360);

  // Titre (étiquette)
  ls(c, 3);
  const tsize = fit(c, d.title.toUpperCase(), maxW - 70, 25, 700, 15);
  const tw = c.measureText(d.title.toUpperCase()).width;
  const pw = tw + 74, px = 60, py = 392, ph = 54;
  const pg2 = c.createLinearGradient(px, 0, px + pw, 0);
  pg2.addColorStop(0, 'rgba(206,17,38,0.28)'); pg2.addColorStop(0.5, 'rgba(252,209,22,0.18)'); pg2.addColorStop(1, 'rgba(0,148,96,0.28)');
  rr(c, px, py, pw, ph, ph / 2); c.fillStyle = pg2; c.fill();
  c.strokeStyle = 'rgba(252,209,22,0.55)'; c.lineWidth = 2; c.stroke();
  flagBar(c, px + 22, py + ph / 2 - 9, 30, 18);
  c.fillStyle = '#fde68a'; c.font = `700 ${tsize}px ${FONT}`;
  c.fillText(d.title.toUpperCase(), px + 64, py + ph / 2 + tsize * 0.35);
  ls(c, 0);

  ls(c, 4); c.fillStyle = '#5d7a99'; c.font = `600 16px ${FONT}`;
  c.fillText('TRAVAIL · JUSTICE · SOLIDARITÉ', 60, H - 44);
  ls(c, 0);
}

function icon(c: Ctx, kind: 'mail' | 'phone' | 'globe', cx: number, cy: number) {
  c.save();
  c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.lineJoin = 'round'; c.lineCap = 'round';
  if (kind === 'mail') {
    rr(c, cx - 13, cy - 9, 26, 18, 3); c.stroke();
    c.beginPath(); c.moveTo(cx - 12, cy - 7); c.lineTo(cx, cy + 2); c.lineTo(cx + 12, cy - 7); c.stroke();
  } else if (kind === 'phone') {
    rr(c, cx - 8, cy - 13, 16, 26, 4); c.stroke();
    c.beginPath(); c.arc(cx, cy + 8, 1.4, 0, Math.PI * 2); c.stroke();
  } else {
    c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(cx, cy, 5, 11, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx - 11, cy); c.lineTo(cx + 11, cy); c.stroke();
  }
  c.restore();
}

function drawBack(c: Ctx, d: Draw) {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e3eefa');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  flagBar(c, 0, 0, W, 14);

  drawLogo(c, d, 60, 56, 84);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  ls(c, 2); c.fillStyle = '#0b2745'; c.font = `700 22px ${FONT}`; c.fillText('SOCIÉTÉ DES EAUX DE GUINÉE', 164, 96);
  ls(c, 3); c.fillStyle = '#0e7490'; c.font = `600 15px ${FONT}`; c.fillText('RÉPUBLIQUE DE GUINÉE', 164, 126);
  ls(c, 0);

  c.fillStyle = '#0b1b30';
  fit(c, d.name, 590, 50, 800, 28);
  c.fillText(d.name, 60, 232);
  flagBar(c, 60, 252, 120, 6);
  ls(c, 2);
  c.fillStyle = '#475569';
  fit(c, d.title.toUpperCase(), 590, 22, 700, 14);
  c.fillText(d.title.toUpperCase(), 60, 296);
  ls(c, 0);

  const items: { k: 'mail' | 'phone' | 'globe'; t: string }[] = [];
  if (d.email) items.push({ k: 'mail', t: d.email });
  if (d.phone) items.push({ k: 'phone', t: d.phone });
  items.push({ k: 'globe', t: 'seg.gn' });
  items.forEach((it, i) => {
    const y = 362 + i * 70;
    c.beginPath(); c.arc(83, y, 26, 0, Math.PI * 2);
    const ig = c.createLinearGradient(57, y - 26, 109, y + 26); ig.addColorStop(0, '#0284c7'); ig.addColorStop(1, '#0b2745');
    c.fillStyle = ig; c.fill();
    icon(c, it.k, 83, y);
    c.fillStyle = '#0b1b30'; fit(c, it.t, 520, 27, 600, 16);
    c.fillText(it.t, 126, y + 9);
  });

  // QR
  const qx = W - 60 - 300, qy = 160;
  c.save();
  c.shadowColor = 'rgba(11,39,69,0.18)'; c.shadowBlur = 28; c.shadowOffsetY = 10;
  rr(c, qx, qy, 300, 300, 26); c.fillStyle = '#ffffff'; c.fill();
  c.restore();
  rr(c, qx, qy, 300, 300, 26); c.strokeStyle = '#cbd5e1'; c.lineWidth = 2; c.stroke();
  if (d.qr) c.drawImage(d.qr, qx + 20, qy + 20, 260, 260);
  c.textAlign = 'center'; c.fillStyle = '#475569'; c.font = `600 18px ${FONT}`;
  c.fillText('Scannez pour ajouter le contact', qx + 150, qy + 340);
  c.textAlign = 'left';

  ls(c, 4); c.fillStyle = '#94a3b8'; c.font = `600 15px ${FONT}`;
  c.fillText('TRAVAIL · JUSTICE · SOLIDARITÉ', 60, H - 36);
  ls(c, 0);
}

function render(d: Draw, side: 'front' | 'back') {
  const cv = document.createElement('canvas');
  cv.width = W * SC; cv.height = H * SC;
  const c = cv.getContext('2d') as Ctx;
  c.scale(SC, SC);
  if (side === 'front') drawFront(c, d); else drawBack(c, d);
  return cv.toDataURL('image/png');
}

/** Toujours avec l'indicatif +224 ; format guinéen : +224 XXX XX XX XX */
export function fmtPhone(raw: string) {
  let d = String(raw).replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (!d.startsWith('+')) d = '+224' + d.replace(/^0+/, '');
  const m = d.match(/^\+224(\d{9})$/);
  if (m) {
    const n = m[1];
    return `+224 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
  }
  return d;
}

export function BusinessCard(p: Props) {
  const [showEmail, setShowEmail] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [faces, setFaces] = useState<{ front: string; back: string } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [msg, setMsg] = useState('');

  const name = [p.firstName, (p.lastName || '').toUpperCase()].filter(Boolean).join(' ').trim() || p.displayName;
  const title = (p.jobTitle || '').trim() || 'Société des Eaux de Guinée';
  const email = showEmail && p.email ? p.email : '';
  const phoneFull = p.phone ? fmtPhone(p.phone) : '';
  const phone = showPhone && phoneFull ? phoneFull : '';
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dg';

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const mod = await import('qrcode');
        const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
        const vcard = [
          'BEGIN:VCARD', 'VERSION:3.0',
          `N:${(p.lastName || '').trim()};${(p.firstName || '').trim()};;;`,
          `FN:${name}`, 'ORG:Société des Eaux de Guinée', 'URL:https://seg.gn', `TITLE:${title}`,
          phone ? `TEL;TYPE=CELL:${phone.replace(/\s/g, '')}` : '', email ? `EMAIL;TYPE=WORK:${email}` : '',
          'END:VCARD',
        ].filter(Boolean).join('\n');
        const qrUrl = await QR.toDataURL(vcard, { errorCorrectionLevel: 'M', margin: 1, width: 520, color: { dark: '#0b1b30', light: '#ffffff' } });
        const [logo, photo, qr] = await Promise.all([
          loadImg('/ico.jpeg'), p.avatar ? loadImg(p.avatar) : Promise.resolve(null), loadImg(qrUrl),
        ]);
        const d: Draw = { name, title, email, phone, initials: p.initials || 'DG', logo, photo, qr };
        const front = render(d, 'front');
        const back = render(d, 'back');
        if (!off) { setFaces({ front, back }); setMsg(''); }
      } catch {
        if (!off) setMsg('Impossible de générer la carte.');
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, title, email, phone, p.avatar, p.initials, p.firstName, p.lastName]);

  const save = (url: string, side: string) => {
    const a = document.createElement('a');
    a.href = url; a.download = `carte-visite-${slug}-${side}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const share = async () => {
    if (!faces) return;
    try {
      const toFile = async (u: string, s: string) =>
        new File([await (await fetch(u)).blob()], `carte-visite-${slug}-${s}.png`, { type: 'image/png' });
      const files = [await toFile(faces.front, 'recto'), await toFile(faces.back, 'verso')];
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files })) {
        await nav.share({ files, title: `Carte de visite — ${name}` });
      } else {
        save(faces.front, 'recto');
        setTimeout(() => save(faces.back, 'verso'), 400);
        setMsg('Le partage direct n’est pas disponible sur cet appareil : les deux images ont été téléchargées.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('Partage impossible.');
    }
  };

  return (
    <section className="users-card bc-section">
      <h3 className="section-title">Carte de visite numérique</h3>
      <div className="bc-layout">
        <div className="bc-stage">
          <div
            className="bc-scene"
            role="button"
            tabIndex={0}
            aria-label={flipped ? 'Voir le recto de la carte' : 'Voir le verso de la carte'}
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((f) => !f); } }}
          >
            <div className={`bc-card${flipped ? ' is-flipped' : ''}`}>
              {faces ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bc-face" src={faces.front} alt="Carte de visite, recto" draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bc-face bc-back" src={faces.back} alt="Carte de visite, verso" draggable={false} />
                </>
              ) : (
                <div className="bc-face bc-loading">Préparation de la carte…</div>
              )}
            </div>
          </div>
          <div className="bc-hint"><RotateCw size={13} /> Touchez la carte pour la retourner</div>
        </div>

        <div className="bc-side">
          <p className="bc-text">Partagez votre carte en image (PNG, haute définition). Le QR code du verso ajoute directement votre contact sur le téléphone de la personne qui le scanne.</p>
          <div className="bc-options">
            {p.email && (
              <label><input type="checkbox" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} /> Afficher l’e-mail sur la carte</label>
            )}
            {p.phone && (
              <label><input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} /> Afficher le téléphone sur la carte</label>
            )}
          </div>
          <div className="bc-actions">
            <button type="button" className="btn-primary" onClick={() => void share()} disabled={!faces}>
              <Share2 size={15} /> Partager
            </button>
            <button type="button" className="bc-ghost" onClick={() => faces && save(faces.front, 'recto')} disabled={!faces}>
              <Download size={14} /> PNG recto
            </button>
            <button type="button" className="bc-ghost" onClick={() => faces && save(faces.back, 'verso')} disabled={!faces}>
              <Download size={14} /> PNG verso
            </button>
          </div>
          {msg && <div className="bc-msg" role="status">{msg}</div>}
        </div>
      </div>
    </section>
  );
}
