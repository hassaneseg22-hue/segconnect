'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, Minimize2, Maximize2, Square as Carre, RotateCcw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { SegeAssistant, Orbe, type Etat } from '@/components/journal/SegeAssistant';

/* Sege sur toutes les pages : orbe flottante en bas à droite.
   Un clic ouvre la conversation ; l'appel vocal « Sege » fonctionne partout.
   Masquée sur /journal (Sege y est déjà intégrée) et pour les comptes sans journal.view. */

const MASQUEE = ['/journal'];

/* Position, taille du panneau et taille de l'orbe, mémorisées dans le navigateur */
type Reglages = { r: number; b: number; w: number; h: number; orbe: 'petite' | 'normale' };
const DEFAUT: Reglages = { r: 24, b: 54, w: 430, h: 660, orbe: 'normale' };
const TAILLES = { compact: { w: 360, h: 480 }, normal: { w: 430, h: 660 }, grand: { w: 580, h: 820 } };
const lire = (): Reglages => { try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem('sege-reglages') || '{}') }; } catch { return DEFAUT; } };
const borner = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function SegeGlobal() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<Etat>('repos');
  const [voixOk, setVoixOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [rg, setRg] = useState<Reglages>(DEFAUT);
  const [vue, setVue] = useState({ w: 1600, h: 900 });
  const [glisse, setGlisse] = useState(false);
  const deplace = useRef(false);

  useEffect(() => {
    setRg(lire());
    const maj = () => setVue({ w: window.innerWidth, h: window.innerHeight });
    maj();
    window.addEventListener('resize', maj);
    return () => window.removeEventListener('resize', maj);
  }, []);
  const enregistrer = useCallback((n: Reglages) => { setRg(n); try { localStorage.setItem('sege-reglages', JSON.stringify(n)); } catch {} }, []);

  /* Déplacement (orbe ou barre du panneau) */
  const debutDeplacement = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, r0 = rg.r, b0 = rg.b;
    deplace.current = false;
    let dernier = rg;
    const bouge = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!deplace.current && Math.hypot(dx, dy) < 5) return;
      deplace.current = true; setGlisse(true);
      dernier = { ...rg, r: borner(r0 - dx, 8, window.innerWidth - 70), b: borner(b0 - dy, 8, window.innerHeight - 70) };
      setRg(dernier);
    };
    const fin = () => {
      window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin);
      setGlisse(false);
      if (deplace.current) enregistrer(dernier);
    };
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin);
  };

  /* Redimensionnement libre par le coin haut-gauche du panneau */
  const debutTaille = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, w0 = rg.w, h0 = rg.h;
    let dernier = rg;
    const bouge = (ev: PointerEvent) => {
      setGlisse(true);
      dernier = { ...rg, w: borner(w0 + (x0 - ev.clientX), 320, window.innerWidth - 16), h: borner(h0 + (y0 - ev.clientY), 380, window.innerHeight - 40) };
      setRg(dernier);
    };
    const fin = () => { window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin); setGlisse(false); enregistrer(dernier); };
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin);
  };

  useEffect(() => {
    setVoixOk(typeof window !== 'undefined' && 'speechSynthesis' in window);
    const w = window as any;
    setMicOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const dire = useCallback((texte: string, onStart?: () => void) => new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR'; u.rate = 0.98;
    const v = window.speechSynthesis.getVoices();
    const fr = v.find((x) => x.lang?.toLowerCase().startsWith('fr') && /google|natural|online/i.test(x.name)) || v.find((x) => x.lang?.toLowerCase().startsWith('fr'));
    if (fr) u.voice = fr;
    u.onstart = () => onStart?.();
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  }), []);
  const arreter = useCallback(() => { try { window.speechSynthesis.cancel(); } catch {} }, []);
  const lireJournal = useCallback(() => router.push('/journal'), [router]);
  const onCentre = useCallback(() => {}, []);
  const repondreLocal = useCallback(() => 'Je n’arrive pas à joindre le dashboard pour le moment. Réessayez dans un instant.', []);

  useEffect(() => {
    if (!ouvert) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.fb-overlay, .sg-appel')) setOuvert(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ouvert]);

  if (!user || !hasPermission('journal.view') || MASQUEE.some((p) => pathname === p || pathname?.startsWith(`${p}/`))) return null;

  /* Placement : l'orbe à sa position, le panneau au-dessus (ou en dessous s'il manque de place) */
  const tailleOrbe = rg.orbe === 'petite' ? 38 : 50;
  const r = borner(rg.r, 8, vue.w - tailleOrbe - 20);
  const b = borner(rg.b, 8, vue.h - tailleOrbe - 20);
  const w = Math.min(rg.w, vue.w - 16);
  const h = Math.min(rg.h, vue.h - 40);
  const pr = borner(r, 8, vue.w - w - 8);
  const auDessus = b + tailleOrbe + 24 + h <= vue.h - 8;
  const pb = auDessus ? b + tailleOrbe + 18 : borner(b - h - 10, 8, vue.h - h - 8);
  const style = {
    ['--sgg-r' as string]: `${r}px`, ['--sgg-b' as string]: `${b}px`,
    ['--sgg-pr' as string]: `${pr}px`, ['--sgg-pb' as string]: `${pb}px`,
    ['--sgg-w' as string]: `${w}px`, ['--sgg-h' as string]: `${h}px`,
  } as React.CSSProperties;
  const tailleActive = (Object.keys(TAILLES) as (keyof typeof TAILLES)[]).find((k) => TAILLES[k].w === rg.w && TAILLES[k].h === rg.h);

  return (
    <div className={`sgg ${glisse ? 'glisse' : ''}`} style={style}>
      <style>{CSS}</style>
      <div className={`sgg-panel ${ouvert ? 'ouvert' : 'ferme'} ${w < 400 ? 'etroit' : ''}`} aria-hidden={!ouvert}>
        <div className="sgg-barre" onPointerDown={debutDeplacement} onDoubleClick={() => enregistrer({ ...DEFAUT, orbe: rg.orbe })} title="Glisser pour déplacer · double-clic pour remettre en place">
          <span className="sgg-coin" onPointerDown={debutTaille} title="Tirer pour agrandir ou réduire" />
          <GripHorizontal size={15} />
          <span className="sgg-barre-titre">Déplacer</span>
          <div className="sgg-tailles" onPointerDown={(e) => e.stopPropagation()}>
            <button className={tailleActive === 'compact' ? 'on' : ''} onClick={() => enregistrer({ ...rg, ...TAILLES.compact })} title="Petit panneau"><Minimize2 size={12} /></button>
            <button className={tailleActive === 'normal' ? 'on' : ''} onClick={() => enregistrer({ ...rg, ...TAILLES.normal })} title="Panneau normal"><Carre size={11} /></button>
            <button className={tailleActive === 'grand' ? 'on' : ''} onClick={() => enregistrer({ ...rg, ...TAILLES.grand })} title="Grand panneau"><Maximize2 size={12} /></button>
            <i />
            <button className={rg.orbe === 'petite' ? 'on' : ''} onClick={() => enregistrer({ ...rg, orbe: rg.orbe === 'petite' ? 'normale' : 'petite' })} title={rg.orbe === 'petite' ? 'Agrandir l’orbe' : 'Réduire l’orbe'}>
              <span className={`sgg-pastille ${rg.orbe}`} />
            </button>
            <button onClick={() => enregistrer({ ...DEFAUT })} title="Remettre Sege en place"><RotateCcw size={12} /></button>
          </div>
        </div>
        <SegeAssistant
          parleExterne={false}
          voixOk={voixOk}
          micOk={micOk}
          dire={dire}
          arreter={arreter}
          lireJournal={lireJournal}
          onCentre={onCentre}
          repondreLocal={repondreLocal}
          onEtat={setEtat}
          onFermer={() => setOuvert(false)}
        />
      </div>
      <button
        className={`sgg-lanceur e-${etat} ${ouvert ? 'actif' : ''} ${rg.orbe}`}
        onPointerDown={debutDeplacement}
        onClick={() => { if (deplace.current) { deplace.current = false; return; } setOuvert((o) => !o); }}
        title={ouvert ? 'Réduire Sege · glisser pour déplacer' : 'Parler à Sege · glisser pour déplacer'}
        aria-label="Sege"
      >
        <Orbe etat={etat} taille={tailleOrbe} />
        {!ouvert && rg.orbe === 'normale' && <span className="sgg-etiquette">{etat === 'parole' ? 'Sege parle…' : etat === 'ecoute' ? 'Je vous écoute…' : etat === 'reflexion' ? 'Je cherche…' : 'Sege'}</span>}
      </button>
    </div>
  );
}

const CSS = `
.sgg-lanceur { position: fixed; z-index: 1050; right: var(--sgg-r, 24px); bottom: var(--sgg-b, 54px); touch-action: none; user-select: none; display: flex; align-items: center; gap: 10px; padding: 6px; border-radius: 999px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--brand-cyan) 35%, var(--border-color)); background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  box-shadow: 0 12px 34px rgba(0,0,0,.45); backdrop-filter: blur(8px); transition: transform .2s, box-shadow .2s; color: var(--text-strong); font: inherit; }
.sgg-lanceur:hover { transform: translateY(-2px); box-shadow: 0 16px 40px rgba(0,0,0,.5), 0 0 0 4px color-mix(in srgb, #22d3ee 18%, transparent); }
.sgg-lanceur.e-parole, .sgg-lanceur.e-ecoute { box-shadow: 0 12px 34px rgba(0,0,0,.45), 0 0 0 4px color-mix(in srgb, #22d3ee 30%, transparent); }
.sgg-lanceur.e-ecoute { border-color: var(--accent-red); }
.sgg-etiquette { padding-right: 12px; font-size: 13px; font-weight: 800; white-space: nowrap; }
.sgg-panel { position: fixed; z-index: 1049; right: var(--sgg-pr, 24px); bottom: var(--sgg-pb, 122px); width: var(--sgg-w, 430px); height: var(--sgg-h, 660px); display: flex; flex-direction: column; }
.sgg.glisse, .sgg.glisse * { cursor: grabbing !important; user-select: none; }
.sgg.glisse .sgg-panel, .sgg.glisse .sgg-lanceur { transition: none; }
.sgg-lanceur.petite { padding: 4px; }
.sgg-barre { position: relative; flex-shrink: 0; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 8px 0 22px; margin-bottom: 6px; border-radius: 12px; cursor: grab; touch-action: none; user-select: none;
  color: var(--text-muted); background: color-mix(in srgb, var(--bg-card) 92%, transparent); border: 1px solid var(--border-color); backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.sgg-barre:hover { color: var(--text-strong); border-color: color-mix(in srgb, var(--brand-cyan) 45%, var(--border-color)); }
.sgg-barre-titre { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.sgg-coin { position: absolute; left: 4px; top: 4px; width: 14px; height: 14px; cursor: nwse-resize; border-left: 2px solid currentColor; border-top: 2px solid currentColor; border-radius: 4px 0 0 0; opacity: .7; }
.sgg-coin:hover { opacity: 1; color: var(--brand-cyan); }
.sgg-tailles { margin-left: auto; display: flex; align-items: center; gap: 3px; cursor: default; }
.sgg-tailles i { width: 1px; height: 14px; background: var(--border-color); margin: 0 3px; }
.sgg-tailles button { width: 24px; height: 22px; border-radius: 6px; display: grid; place-items: center; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
.sgg-tailles button:hover { background: var(--bg-card-hover); color: var(--text-strong); }
.sgg-tailles button.on { background: color-mix(in srgb, var(--brand-cyan) 18%, transparent); color: var(--brand-cyan); }
.sgg-pastille { border-radius: 50%; background: radial-gradient(circle at 35% 30%, #e0f2fe, #38bdf8 30%, #4f46e5 80%); }
.sgg-pastille.petite { width: 8px; height: 8px; } .sgg-pastille.normale { width: 12px; height: 12px; }
.sgg-panel.ferme { visibility: hidden; pointer-events: none; }
.sgg-panel.ouvert { animation: sgg-ouvre .28s cubic-bezier(.2,.9,.3,1.2); }
@keyframes sgg-ouvre { from { opacity: 0; translate: 0 16px; } }
.sgg-panel > .sg { flex: 1; height: auto; min-height: 0; box-shadow: 0 30px 80px rgba(0,0,0,.55); }
.sgg-panel .sg-fil { max-height: none; }
.sgg-panel .sg-themes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sgg-panel.etroit .sg-accueil-orbe { display: none; }
.sgg-panel.etroit .sg-accueil h4 { font-size: 15px; }
.sgg-panel.etroit .sg-accueil p { font-size: 12px; }
.sgg-panel.etroit .sg-theme { padding: 8px; gap: 8px; }
.sgg-panel.etroit .sg-barre-titre, .sgg-panel.etroit .sgg-barre-titre { display: none; }
.sgg-panel.etroit .sg-id span { display: none; }
/* La bulle d'appel et les fiches restent visibles même quand le panneau est réduit */
.sgg-panel .sg-appel, .sgg-panel .fb-overlay { visibility: visible; pointer-events: auto; }
.sgg-panel .sg-appel { right: var(--sgg-pr, 24px); bottom: calc(var(--sgg-b, 54px) + 72px); }
@media (max-width: 640px) { .sgg-etiquette { display: none; } }
.sgg-panel .sg-veille span, .sgg-panel .sg-aide { display: none; }
.sgg-panel .sg-id span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
