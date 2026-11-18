'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Bulle de nouveauté « une seule fois ».
 * <NewFeatureBubble id="xxx-v1" title="..." lines={['...']} side>…élément…</NewFeatureBubble>
 * - id : unique par mise à jour (changer l'id = la bulle revient pour tous).
 * - side : bulle affichée à droite de l'élément (menu latéral), en position fixe (jamais coupée).
 * - Disparaît au clic sur l'élément, la bulle ou « J'ai compris », puis est mémorisée dans le navigateur.
 */
export function NewFeatureBubble({
  id, title, lines, align = 'right', side = false, block = false, children,
}: {
  id: string;
  title: string;
  lines: string[];
  align?: 'left' | 'right';
  side?: boolean;
  block?: boolean;
  children: ReactNode;
}) {
  const key = `seg_new_${id}`;
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { if (!window.localStorage.getItem(key)) setShow(true); } catch { setShow(true); }
  }, [key]);

  useEffect(() => {
    if (!show || !side) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const narrow = window.innerWidth < 700;
      setPos(r.width === 0 || r.right <= 4 || narrow ? null : { top: r.top + r.height / 2, left: r.right + 14 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('transitionend', update, true);
    return () => {
      window.removeEventListener('transitionend', update, true);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [show, side]);

  const dismiss = useCallback(() => {
    setShow(false);
    try { window.localStorage.setItem(key, '1'); } catch { /* stockage indisponible */ }
  }, [key]);

  const inline = align === 'left' ? { left: 0, right: 'auto' } : { right: 0, left: 'auto' };
  const inlineArrow = align === 'left' ? { left: 34, right: 'auto' } : { right: 34, left: 'auto' };

  const bubbleStyle = side
    ? ({
        position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, transform: 'translateY(-50%)',
        zIndex: 1000, animation: 'none', width: 300, maxWidth: `calc(100vw - ${(pos?.left ?? 0) + 16}px)`,
      } as const)
    : inline;
  const arrowStyle = side
    ? ({ top: '50%', left: -7, right: 'auto', marginTop: -6, transform: 'rotate(-45deg)' } as const)
    : inlineArrow;

  return (
    <div
      ref={ref}
      className={`dg-new-wrap${show ? ' is-new' : ''}`}
      style={{ position: 'relative', display: side || block ? 'block' : 'inline-block' }}
      onClickCapture={() => { if (show) dismiss(); }}
    >
      {children}
      {show && (!side || pos) && (
        <div className="dg-clock-intro" role="status" style={bubbleStyle} onClick={dismiss}>
          <span className="dg-clock-intro-arrow" aria-hidden="true" style={arrowStyle} />
          <div className="dg-clock-intro-badge">Nouveau</div>
          <div className="dg-clock-intro-title">{title}</div>
          {lines.map((l, i) => <div key={i} className="dg-clock-intro-text">{l}</div>)}
          <button type="button" className="dg-clock-intro-btn" onClick={dismiss}>J’ai compris</button>
        </div>
      )}
    </div>
  );
}
