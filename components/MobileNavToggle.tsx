'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

/** Bouton burger + fond assombri : le menu latéral devient un tiroir sous 900 px (CSS .mnav-*). */
export function MobileNavToggle() {
  const pathname = usePathname();
  const [hasSidebar, setHasSidebar] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    const check = () => setHasSidebar(!!document.querySelector('.sidebar-container'));
    check();
    const t1 = setTimeout(check, 300);
    const t2 = setTimeout(check, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('nav-open', open);
    return () => document.body.classList.remove('nav-open');
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => { if (window.innerWidth > 900) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  if (!hasSidebar) return null;

  return (
    <>
      <button
        type="button"
        className="mnav-btn"
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && <div className="mnav-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
