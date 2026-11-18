'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Package, PackageX, AlertTriangle, AlertOctagon, XCircle, MapPin, Info,
  FileSpreadsheet, Printer, Filter, LayoutGrid
} from 'lucide-react';
import { NewFeatureBubble } from '@/components/NewFeatureBubble';
import { num } from '@/lib/format';

/* ───────────────────────── Types ───────────────────────── */

type StockSynthese = {
  sourceId: number;
  sourceCode: string;
  sourceNom: string;
  famille: 'SEG' | 'PROJET';
  bailleur: string | null;
  categorie: string | null;
  nbArticles: number;
  nbRuptures: number;
  nbObsoletes: number;
  nbMauvaisEtat: number;
  nbSansCode: number;
  valeurGnf: number | null;
};

type StockLigne = {
  id: number;
  codeArticle: string | null;
  numeroOrdre: number | null;
  designation: string;
  quantite: number | null;
  unite: string;
  lieu: string | null;
  observation: string | null;
  etat: string;
  enRupture: boolean;
  quantiteTexteOrigine: string | null;
  sourceCode: string | null;
  sourceNom: string | null;
  famille: string | null;
  bailleur: string | null;
  categorie: string | null;
};

type StocksResponse = {
  periode: string | null;
  synthese: StockSynthese[];
  totaux: { nbArticles: number; nbRuptures: number; nbObsoletes: number; nbMauvaisEtat: number };
  detail: StockLigne[];
  detailTotal: number;
};

type StatusTab = 'all' | 'rupture' | 'obsolete' | 'mauvais' | 'bon';
type AttnKey = 'rupture' | 'obsolete' | 'mauvais';
type Attn = { items: StockLigne[]; total: number };
type StoreState = { items: StockLigne[]; loading: boolean; error: string };

/* ───────────────────────── Constantes ───────────────────────── */

const PAGE_SIZE = 50;

const COLORS = {
  obsolete: '#f59e0b',
  rupture: '#ef4444',
  mauvais: '#f97316',
  sain: '#2b7a8c',
  ok: '#10b981',
  info: '#0e9f9a'
};

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

const ATTN_LABEL: Record<AttnKey, string> = {
  rupture: 'Ruptures',
  obsolete: 'Obsolètes',
  mauvais: 'Mauvais état'
};

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'rupture', label: 'Ruptures' },
  { key: 'obsolete', label: 'Obsolètes' },
  { key: 'mauvais', label: 'Mauvais état' },
  { key: 'bon', label: 'Bon état' }
];

function periodeLabel(periode: string | null) {
  if (!periode) return '';
  const [y, m] = periode.split('-').map(Number);
  if (!y || !m) return periode;
  return `${MOIS[m - 1]} ${y}`;
}

const pctFmt = (n: number, total: number) =>
  total > 0 ? `${((n / total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—';

/** Nombre pour une phrase : espace insécable classique (l'espace fine de toLocaleString disparaît dans certaines polices en gras). */
const nb = (v: number) => num(v).replace(/\u202f/g, '\u00a0');

/** L'observation n'est gardée que si elle apporte une information (emplacement, conditionnement…). */
function obsUtile(l: StockLigne) {
  const o = l.observation?.trim();
  if (!o) return null;
  return /^(obsol[eè]te|bon [ée]tat|mauvais [ée]tat)$/i.test(o) ? null : o;
}

/* ───────────────────────── Tableau des articles ───────────────────────── */

type EtatKey = 'stock' | 'rupture' | 'obsolete' | 'mauvais' | 'bon';
type SortKey = 'code' | 'designation' | 'quantite' | 'emplacement';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

/** État affiché : un article compté sans remarque particulière est « En stock ». */
function etatInfo(l: StockLigne): { key: EtatKey; label: string; tone: 'green' | 'red' | 'amber' | 'orange' } {
  if (l.enRupture) return { key: 'rupture', label: 'Rupture', tone: 'red' };
  if (l.etat === 'obsolete') return { key: 'obsolete', label: 'Obsolète', tone: 'amber' };
  if (l.etat === 'mauvais') return { key: 'mauvais', label: 'Mauvais état', tone: 'orange' };
  if (l.etat === 'bon') return { key: 'bon', label: 'Bon état', tone: 'green' };
  return { key: 'stock', label: 'En stock', tone: 'green' };
}

const ETAT_OPTIONS: { key: EtatKey; label: string }[] = [
  { key: 'stock', label: 'En stock' },
  { key: 'bon', label: 'Bon état' },
  { key: 'rupture', label: 'Rupture' },
  { key: 'obsolete', label: 'Obsolète' },
  { key: 'mauvais', label: 'Mauvais état' }
];

function EtatBadge({ l }: { l: StockLigne }) {
  const e = etatInfo(l);
  return (
    <span className={`stk-st ${e.tone}`}>
      {e.tone === 'green' ? <i className="stk-st-dot" /> : e.key === 'rupture' ? <XCircle size={14} /> : <AlertTriangle size={14} />}
      {e.label}
    </span>
  );
}

function ArticlesTable({ rows, withStore, sort, onSort, empty }: {
  rows: StockLigne[];
  withStore: boolean;
  sort?: Sort;
  onSort?: (k: SortKey) => void;
  empty: string;
}) {
  const th = (label: string, k?: SortKey, className?: string) => {
    if (!k || !onSort) return <th className={className}>{label}</th>;
    const active = sort?.key === k;
    return (
      <th className={className} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`stk-th-btn${active ? ' on' : ''}`} onClick={() => onSort(k)}>
          {label}
          {active && sort!.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </th>
    );
  };
  return (
    <table className="stk-t2">
      <colgroup>
        <col style={{ width: '12%' }} />
        <col style={{ width: '38%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '17%' }} />
      </colgroup>
      <thead>
        <tr>
          {th('Code', 'code')}
          {th('Désignation', 'designation')}
          {th('Quantité', 'quantite', 'c')}
          {th('Emplacement', 'emplacement')}
          {th('État')}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => {
          const obs = obsUtile(l);
          return (
            <tr key={l.id}>
              <td className="stk-t2-code">{l.codeArticle ?? '–'}</td>
              <td>
                <span className="stk-t2-des">
                  <Package size={18} className="stk-t2-ico" aria-hidden="true" />
                  <span>
                    <span className="stk-t2-name">{l.designation}</span>
                    {withStore && <span className="stk-t2-sub">{l.sourceNom}</span>}
                  </span>
                </span>
              </td>
              <td className="c">
                <span className={`stk-qpill${l.enRupture ? ' zero' : ''}`} title={l.quantiteTexteOrigine ? `Saisi : ${l.quantiteTexteOrigine}` : undefined}>
                  {l.quantite === null ? '—' : num(l.quantite)}
                </span>
                {l.unite !== 'u' && <span className="stk-t2-unit">{l.unite}</span>}
              </td>
              <td>
                <span className="stk-loc2">
                  <MapPin size={14} aria-hidden="true" />
                  {l.lieu ?? '—'}
                  {obs && <em>({obs})</em>}
                </span>
              </td>
              <td><EtatBadge l={l} /></td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="stk-t2-empty">{empty}</td></tr>
        )}
      </tbody>
    </table>
  );
}

/** Numéros de page affichés : 1 … 4 5 6 … 12 (‑1 = points de suspension) */
function pageWindow(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const out = new Set([0, pages - 1, page - 1, page, page + 1].filter((n) => n >= 0 && n < pages));
  const sorted = Array.from(out).sort((a, b) => a - b);
  const res: number[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) res.push(-1);
    res.push(n);
  });
  return res;
}

function TableFooter({ from, to, total, page, pages, onPage, size, onSize, onExport, onPrint, busy }: {
  from: number; to: number; total: number; page: number; pages: number;
  onPage: (p: number) => void;
  size?: number; onSize?: (n: number) => void;
  onExport: () => void; onPrint: () => void; busy?: boolean;
}) {
  return (
    <div className="stk-tfoot">
      <div className="stk-tfoot-info">
        <Info size={16} aria-hidden="true" />
        <span>{total === 0 ? 'Aucun article' : `Affichage de ${num(from)} à ${num(to)} sur ${num(total)} articles`}</span>
        {onSize && (
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Lignes par page">
            <option value={25}>25 par page</option>
            <option value={50}>50 par page</option>
            <option value={100}>100 par page</option>
            <option value={0}>Tout afficher</option>
          </select>
        )}
      </div>
      <div className="stk-pages">
        <button type="button" aria-label="Page précédente" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>
        {pageWindow(page, pages).map((n, i) =>
          n === -1 ? <span key={`g${i}`} className="stk-pages-gap">…</span> : (
            <button key={n} type="button" className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>
              {n + 1}
            </button>
          )
        )}
        <button type="button" aria-label="Page suivante" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
      </div>
      <div className="stk-tfoot-actions">
        <button type="button" className="stk-b green" onClick={onExport} disabled={busy || total === 0}>
          <FileSpreadsheet size={16} /> {busy ? 'Préparation…' : 'Exporter Excel'}
        </button>
        <button type="button" className="stk-b blue" onClick={onPrint} disabled={busy || total === 0}>
          <Printer size={16} /> Imprimer
        </button>
      </div>
    </div>
  );
}

/* Export Excel : CSV point‑virgule + BOM, s'ouvre directement dans Excel en français */
function downloadExcel(rows: StockLigne[], fileName: string) {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ['Code', 'Désignation', 'Quantité', 'Unité', 'Lieu', 'Emplacement', 'État', 'Stock'];
  const lines = rows.map((l) =>
    [l.codeArticle ?? '', l.designation, l.quantite ?? '', l.unite, l.lieu ?? '', obsUtile(l) ?? '', etatInfo(l).label, l.sourceNom ?? '']
      .map(esc).join(';')
  );
  const blob = new Blob(['\ufeff' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printArticles(rows: StockLigne[], titre: string, sousTitre: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
  const body = rows.map((l) => {
    const obs = obsUtile(l);
    return `<tr><td>${esc(l.codeArticle ?? '–')}</td><td>${esc(l.designation)}</td><td class="n">${esc(l.quantite === null ? '—' : num(l.quantite))} ${esc(l.unite)}</td><td>${esc(l.lieu ?? '')}${obs ? ` (${esc(obs)})` : ''}</td><td>${esc(etatInfo(l).label)}</td></tr>`;
  }).join('');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#0f1d2e}h1{font-size:18px;margin:0}p{margin:4px 0 16px;color:#5b6f84;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0b2a4f;color:#fff;text-align:left;padding:7px 8px}
td{padding:6px 8px;border-bottom:1px solid #dde5ee}tr:nth-child(even) td{background:#f4f8fd}.n{text-align:right;white-space:nowrap}
@page{margin:14mm}</style></head><body><h1>${esc(titre)}</h1><p>${esc(sousTitre)} · ${rows.length} articles · imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
<table><thead><tr><th>Code</th><th>Désignation</th><th>Quantité</th><th>Emplacement</th><th>État</th></tr></thead><tbody>${body}</tbody></table>
<script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}

/* Contenu déplié d'un magasin : barre d'outils, tableau trié, pagination, export */
function StoreTable({ store, state, onReload, sousTitre }: {
  store: StockSynthese;
  state: StoreState | undefined;
  onReload: () => void;
  sousTitre: string;
}) {
  const [search, setSearch] = useState('');
  const [lieu, setLieu] = useState('');
  const [etat, setEtat] = useState<'' | EtatKey>('');
  const [sort, setSort] = useState<Sort>({ key: 'designation', dir: 'asc' });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  const items = state?.items ?? [];
  const lieux = useMemo(
    () => Array.from(new Set(items.map((l) => l.lieu).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'fr')),
    [items]
  );

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    const filtered = items.filter((l) =>
      (!t || l.designation.toLowerCase().includes(t) || (l.codeArticle ?? '').toLowerCase().includes(t)) &&
      (!lieu || l.lieu === lieu) &&
      (!etat || etatInfo(l).key === etat)
    );
    const val = (l: StockLigne): string | number =>
      sort.key === 'code' ? l.codeArticle ?? '' :
      sort.key === 'quantite' ? l.quantite ?? -1 :
      sort.key === 'emplacement' ? `${l.lieu ?? ''} ${obsUtile(l) ?? ''}` : l.designation;
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'fr', { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [items, search, lieu, etat, sort]);

  useEffect(() => { setPage(0); }, [search, lieu, etat, sort, size]);

  if (!state || state.loading) return <p className="stk-dim stk-pad">Chargement des {num(store.nbArticles)} articles…</p>;
  if (state.error) {
    return (
      <p className="stk-dim stk-pad">
        {state.error}. <button type="button" className="stk-reset" onClick={onReload}>Réessayer</button>
      </p>
    );
  }

  const pages = size ? Math.max(1, Math.ceil(rows.length / size)) : 1;
  const slice = size ? rows.slice(page * size, page * size + size) : rows;
  const from = rows.length === 0 ? 0 : size ? page * size + 1 : 1;
  const to = size ? Math.min(rows.length, page * size + size) : rows.length;
  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'quantite' ? 'desc' : 'asc' }));

  return (
    <div className="stk-acc-body">
      <div className="stk-tb">
        <label className="stk-tb-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="text"
            placeholder="Rechercher un article, une référence…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Rechercher dans ${store.sourceNom}`}
          />
        </label>
        {lieux.length > 1 && (
          <label className="stk-tb-select">
            <LayoutGrid size={16} aria-hidden="true" />
            <select value={lieu} onChange={(e) => setLieu(e.target.value)} aria-label="Filtrer par emplacement">
              <option value="">Tous les emplacements</option>
              {lieux.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <ChevronDown size={16} className="stk-tb-chev" aria-hidden="true" />
          </label>
        )}
        <label className="stk-tb-select">
          <Filter size={16} aria-hidden="true" />
          <select value={etat} onChange={(e) => setEtat(e.target.value as '' | EtatKey)} aria-label="Filtrer par état">
            <option value="">Tous les états</option>
            {ETAT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <ChevronDown size={16} className="stk-tb-chev" aria-hidden="true" />
        </label>
        <button type="button" className="stk-b blue lg" onClick={onReload}>
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      <div className="stk-t2wrap">
        <div className="stk-t2scroll">
          <ArticlesTable
            rows={slice}
            withStore={false}
            sort={sort}
            onSort={onSort}
            empty={search || lieu || etat ? 'Aucun article ne correspond à ces filtres.' : 'Aucun article dans ce stock.'}
          />
        </div>
        <TableFooter
          from={from}
          to={to}
          total={rows.length}
          page={page}
          pages={pages}
          onPage={setPage}
          size={size}
          onSize={setSize}
          onExport={() => downloadExcel(rows, `stock-${store.sourceCode.toLowerCase()}.csv`)}
          onPrint={() => printArticles(rows, `SEG · ${store.sourceNom}`, sousTitre)}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function StocksPage() {
  const [data, setData] = useState<StocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Recherche dans l'inventaire */
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  /* Points d'attention */
  const [attn, setAttn] = useState<Record<AttnKey, Attn>>({
    rupture: { items: [], total: 0 },
    obsolete: { items: [], total: 0 },
    mauvais: { items: [], total: 0 }
  });
  const [attnTab, setAttnTab] = useState<AttnKey>('rupture');

  /* Stock complet, magasin par magasin */
  const [openStores, setOpenStores] = useState<Record<string, boolean>>({});
  const [storeItems, setStoreItems] = useState<Record<string, StoreState>>({});
  const [storeQuery, setStoreQuery] = useState<Record<string, string>>({});
  const loadedStores = useRef<Set<string>>(new Set());

  const detailRef = useRef<HTMLDivElement>(null);

  /* Une recherche ou un filtre d'état est actif : on affiche la liste des résultats au lieu des magasins */
  const searching = !!(q || statusTab !== 'all');

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => { if (!searching) setSourceFilter(null); }, [searching]);

  /* Filtres de recherche communs à l'affichage et à l'export */
  const baseQuery = useMemo(() => {
    const params = new URLSearchParams();
    const safeQ = q.replace(/[,()"\\]/g, ' ').trim();
    if (safeQ) params.set('q', safeQ);
    if (statusTab === 'rupture') params.set('rupture', '1');
    else if (statusTab !== 'all') params.set('etat', statusTab);
    if (sourceFilter) params.set('source', sourceFilter);
    return params.toString();
  }, [q, statusTab, sourceFilter]);

  /* Synthèse + résultats de recherche */
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');

    const params = new URLSearchParams(baseQuery);
    params.set('limit', String(searching ? PAGE_SIZE : 1));
    params.set('offset', String(searching ? page * PAGE_SIZE : 0));

    fetch(`/api/stocks?${params.toString()}`, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Connexion aux données impossible');
        setData(j.data);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setError(e?.message || 'Connexion aux données impossible'); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    return () => ctrl.abort();
  }, [baseQuery, page, searching]);

  /* Points d'attention : 8 premiers articles de chaque catégorie, indépendamment des filtres */
  useEffect(() => {
    const ctrl = new AbortController();
    const get = (qs: string) =>
      fetch(`/api/stocks?${qs}&limit=8`, { signal: ctrl.signal, cache: 'no-store' }).then((r) => r.json());
    const pick = (j: any): Attn =>
      j?.ok ? { items: j.data.detail ?? [], total: j.data.detailTotal ?? 0 } : { items: [], total: 0 };

    Promise.all([get('rupture=1'), get('etat=obsolete'), get('etat=mauvais')])
      .then(([a, b, c]) => setAttn({ rupture: pick(a), obsolete: pick(b), mauvais: pick(c) }))
      .catch(() => { /* bloc vide, le reste de la page reste utilisable */ });

    return () => ctrl.abort();
  }, []);

  const synthese = data?.synthese ?? [];
  const totaux = data?.totaux ?? { nbArticles: 0, nbRuptures: 0, nbObsoletes: 0, nbMauvaisEtat: 0 };
  const results = data?.detail ?? [];
  const resultsTotal = searching ? data?.detailTotal ?? 0 : 0;
  const totalPages = Math.max(1, Math.ceil(resultsTotal / PAGE_SIZE));
  const periode = periodeLabel(data?.periode ?? null);

  /* ── Chargement intégral d'un magasin (500 lignes max par appel ; le plus grand stock en compte 383) ── */
  const loadStore = useCallback((code: string) => {
    if (loadedStores.current.has(code)) return;
    loadedStores.current.add(code);
    setStoreItems((p) => ({ ...p, [code]: { items: [], loading: true, error: '' } }));
    fetch(`/api/stocks?source=${encodeURIComponent(code)}&limit=500&offset=0`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Chargement impossible');
        setStoreItems((p) => ({ ...p, [code]: { items: j.data.detail ?? [], loading: false, error: '' } }));
      })
      .catch((e) => {
        loadedStores.current.delete(code);
        setStoreItems((p) => ({ ...p, [code]: { items: [], loading: false, error: e?.message || 'Chargement impossible' } }));
      });
  }, []);

  const reloadStore = useCallback((code: string) => {
    loadedStores.current.delete(code);
    loadStore(code);
  }, [loadStore]);

  const toggleStore = useCallback((code: string) => {
    setOpenStores((p) => ({ ...p, [code]: !p[code] }));
    loadStore(code);
  }, [loadStore]);

  const expandAll = useCallback(() => {
    synthese.forEach((s) => loadStore(s.sourceCode));
    setOpenStores(Object.fromEntries(synthese.map((s) => [s.sourceCode, true])));
  }, [synthese, loadStore]);

  const collapseAll = useCallback(() => setOpenStores({}), []);

  const resetFilters = useCallback(() => {
    setQInput(''); setQ(''); setStatusTab('all'); setSourceFilter(null); setPage(0);
  }, []);

  const scrollToDetail = () =>
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

  /* Depuis le classement : ouvre le magasin dans l'inventaire détaillé */
  const openStore = useCallback((code: string) => {
    resetFilters();
    setOpenStores((p) => ({ ...p, [code]: true }));
    loadStore(code);
    setTimeout(() => document.getElementById(`stk-store-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);
  }, [resetFilters, loadStore]);

  const openAttnList = useCallback((key: AttnKey) => {
    setQInput(''); setQ(''); setSourceFilter(null); setStatusTab(key); setPage(0);
    scrollToDetail();
  }, []);

  const openItem = useCallback((l: StockLigne) => {
    const term = l.codeArticle ?? l.designation;
    setSourceFilter(l.sourceCode);
    setStatusTab(l.enRupture ? 'rupture' : l.etat === 'obsolete' ? 'obsolete' : l.etat === 'mauvais' ? 'mauvais' : 'all');
    setQInput(term); setQ(term); setPage(0);
    scrollToDetail();
  }, []);

  /* Regroupement des stocks : magasins SEG / stocks projets
     (pas de total d'alertes : un même article peut être à la fois en rupture et obsolète) */
  const groups = useMemo(() => {
    const bailleurs = Array.from(new Set(synthese.filter((s) => s.bailleur).map((s) => s.bailleur as string))).join(' et ');
    return [
      { famille: 'SEG' as const, titre: 'Magasins SEG', sous: 'Aviation, Simbaya, Almamya' },
      { famille: 'PROJET' as const, titre: 'Stocks projets', sous: bailleurs ? `Financés par ${bailleurs}` : 'Projets PACT' }
    ]
      .map((g) => {
        const rows = synthese.filter((s) => s.famille === g.famille);
        return { ...g, rows, articles: rows.reduce((a, s) => a + s.nbArticles, 0) };
      })
      .filter((g) => g.rows.length > 0);
  }, [synthese]);

  const maxArticles = useMemo(() => Math.max(1, ...synthese.map((s) => s.nbArticles)), [synthese]);

  /* Phrase de tête : le stock qui concentre le plus d'alertes */
  const headline = useMemo(() => {
    if (synthese.length === 0) return null;
    const poids = (s: StockSynthese) => s.nbObsoletes + s.nbRuptures + s.nbMauvaisEtat;
    const top = synthese.reduce((a, b) => (poids(b) > poids(a) ? b : a));
    if (poids(top) === 0) {
      return { top: null as StockSynthese | null, text: `Les ${nb(totaux.nbArticles)} articles inventoriés ne présentent aucune rupture, aucun article obsolète ni en mauvais état.` };
    }
    const parts: string[] = [];
    if (top.nbObsoletes > 0) parts.push(`${nb(top.nbObsoletes)} articles obsolètes`);
    if (top.nbRuptures > 0) parts.push(`${nb(top.nbRuptures)} des ${nb(totaux.nbRuptures)} ruptures`);
    if (top.nbMauvaisEtat > 0) parts.push(`${nb(top.nbMauvaisEtat)} des ${nb(totaux.nbMauvaisEtat)} articles en mauvais état`);
    const liste = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0];
    return { top, text: `Sur ${nb(totaux.nbArticles)} articles inventoriés, ${top.sourceNom} concentre l’essentiel des alertes : ${liste}.` };
  }, [synthese, totaux]);

  /* Phrases « À retenir », calculées sur les données réelles */
  const notes = useMemo(() => {
    const out: { color: string; text: ReactNode }[] = [];
    if (synthese.length === 0) return out;
    const top = headline?.top ?? null;

    const withObs = synthese.filter((s) => s.nbObsoletes > 0);
    if (withObs.length > 0) {
      const worst = withObs.reduce((a, b) => (b.nbObsoletes / b.nbArticles > a.nbObsoletes / a.nbArticles ? b : a));
      out.push({
        color: COLORS.obsolete,
        text: <>À <strong>{worst.sourceNom}</strong>, {pctFmt(worst.nbObsoletes, worst.nbArticles)} des articles sont déclarés obsolètes ({num(worst.nbObsoletes)} sur {num(worst.nbArticles)}).</>
      });
    }

    const autresRuptures = synthese.filter((s) => s.nbRuptures > 0 && s.sourceCode !== top?.sourceCode);
    if (autresRuptures.length > 0) {
      out.push({
        color: COLORS.rupture,
        text: <>Autres ruptures : {autresRuptures.map((s) => `${num(s.nbRuptures)} à ${s.sourceNom}`).join(', ')}.</>
      });
    }

    const mauvais = synthese.filter((s) => s.nbMauvaisEtat > 0);
    if (mauvais.length > 0) {
      out.push({
        color: COLORS.mauvais,
        text: <><strong>{num(totaux.nbMauvaisEtat)} articles</strong> sont signalés en mauvais état, à {mauvais.map((s) => s.sourceNom).join(', ')}.</>
      });
    }

    const projets = synthese.filter((s) => s.famille === 'PROJET');
    if (projets.length > 0 && projets.every((s) => s.nbRuptures + s.nbObsoletes + s.nbMauvaisEtat === 0)) {
      out.push({ color: COLORS.ok, text: <>Les {projets.length} stocks projets ne signalent aucune rupture, aucun article obsolète ni en mauvais état.</> });
    }

    const sansCode = synthese.reduce((a, s) => a + s.nbSansCode, 0);
    if (sansCode > 0) {
      out.push({
        color: COLORS.info,
        text: <>{num(sansCode)} articles des magasins SEG n’ont pas de code : leur suivi d’un mois à l’autre sera fiable une fois codés.</>
      });
    }
    return out;
  }, [synthese, totaux, headline]);

  const valeurAbsente = synthese.length > 0 && synthese.every((s) => s.valeurGnf === null);

  /* ── Rendus ── */

  /* Une ligne du classement des stocks */
  const renderStore = (s: StockSynthese) => {
    const active = !!openStores[s.sourceCode] && !searching;
    const sain = Math.max(0, s.nbArticles - s.nbRuptures - s.nbObsoletes - s.nbMauvaisEtat);
    const sum = sain + s.nbRuptures + s.nbObsoletes + s.nbMauvaisEtat;
    const scale = sum > 0 ? s.nbArticles / sum : 0;
    const w = (n: number) => `${((n * scale) / maxArticles) * 100}%`;
    const clean = s.nbRuptures + s.nbObsoletes + s.nbMauvaisEtat === 0;

    return (
      <button
        key={s.sourceCode}
        type="button"
        className={`stk-row${active ? ' is-active' : ''}`}
        onClick={() => openStore(s.sourceCode)}
      >
        <span className="stk-row-name">
          <strong>{s.sourceNom}</strong>
          <small>
            {clean ? (
              <span style={{ color: COLORS.ok }}>Aucune alerte</span>
            ) : (
              <>
                {s.nbObsoletes > 0 && <span style={{ color: COLORS.obsolete }}>{num(s.nbObsoletes)} obsolètes </span>}
                {s.nbRuptures > 0 && <span style={{ color: COLORS.rupture }}>{num(s.nbRuptures)} ruptures </span>}
                {s.nbMauvaisEtat > 0 && <span style={{ color: COLORS.mauvais }}>{num(s.nbMauvaisEtat)} mauvais état</span>}
              </>
            )}
          </small>
        </span>
        <span className="stk-track" aria-hidden="true">
          <span className="stk-seg" style={{ width: w(s.nbObsoletes), background: COLORS.obsolete }} />
          <span className="stk-seg" style={{ width: w(s.nbRuptures), background: COLORS.rupture }} />
          <span className="stk-seg" style={{ width: w(s.nbMauvaisEtat), background: COLORS.mauvais }} />
          <span className="stk-seg" style={{ width: w(sain), background: COLORS.sain, opacity: 0.55 }} />
        </span>
        <span className="stk-row-n">{num(s.nbArticles)}</span>
      </button>
    );
  };

  /* Export / impression de tous les résultats de recherche (toutes pages) */
  const [busy, setBusy] = useState(false);
  const withAllResults = async (action: (rows: StockLigne[]) => void) => {
    setBusy(true);
    try {
      const all: StockLigne[] = [];
      for (let offset = 0; ; offset += 500) {
        const j = await fetch(`/api/stocks?${baseQuery}&limit=500&offset=${offset}`, { cache: 'no-store' }).then((r) => r.json());
        if (!j.ok) throw new Error(j.error || 'Export impossible');
        all.push(...(j.data.detail ?? []));
        if (offset + 500 >= (j.data.detailTotal ?? 0) || (j.data.detail ?? []).length === 0) break;
      }
      action(all);
    } catch (e: any) {
      alert(e?.message || 'Export impossible');
    } finally {
      setBusy(false);
    }
  };
  const sousTitre = `Inventaire physique${periode ? ` ${/^[aeiouéè]/i.test(periode) ? 'd’' : 'de '}${periode}` : ''}`;

  const attnCurrent = attn[attnTab];
  const allOpen = synthese.length > 0 && synthese.every((s) => openStores[s.sourceCode]);

  return (
    <div className="stk">
      <style>{CSS}</style>

      {/* Fil d'Ariane */}
      <div className="stk-crumb">
        <Link href="/"><ArrowLeft size={14} /> Tableau de bord</Link>
        <span>›</span>
        <span>Stocks &amp; Magasins</span>
      </div>

      {/* En-tête */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2 style={{ fontSize: '24px' }}>Stocks &amp; Magasins</h2>
          <p>Inventaire physique{periode ? ` ${/^[aeiouéè]/i.test(periode) ? 'd’' : 'de '}${periode}` : ''} : magasins SEG et stocks projets.</p>
        </div>
        <div className="dashboard-filter-bar" style={{ margin: 0, alignItems: 'center', alignSelf: 'flex-end' }}>
          <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
            <span />
            {loading ? 'Actualisation…' : error ? 'Données indisponibles' : 'Données synchronisées'}
          </div>
          <button
            className="btn-brand"
            style={{ fontSize: '11.5px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={13} />
            Actualiser
          </button>
        </div>
      </div>
      {error && <div className="db-error-banner">{error}. Réessayez dans un instant ou cliquez sur « Actualiser ».</div>}

      {/* 1. Chiffres clés + À retenir */}
      <div className="stk-top">
        <div className="stk-figures">
          <div className="stk-kpi" style={{ ['--g1' as any]: '#2f80f7', ['--g2' as any]: '#1450c8' }}>
            <span className="stk-kpi-icon"><Package size={34} strokeWidth={2.1} /></span>
            <span className="stk-kpi-txt">
              <b>{num(totaux.nbArticles)}</b>
              <span>Articles inventoriés</span>
            </span>
            <em className="stk-kpi-badge">{synthese.length} stocks</em>
          </div>
          <div className="stk-kpi" style={{ ['--g1' as any]: '#f25a5a', ['--g2' as any]: '#c0262d' }}>
            <span className="stk-kpi-icon"><PackageX size={34} strokeWidth={2.1} /></span>
            <span className="stk-kpi-txt">
              <b>{num(totaux.nbRuptures)}</b>
              <span>Articles en rupture</span>
            </span>
            <em className="stk-kpi-badge">{pctFmt(totaux.nbRuptures, totaux.nbArticles)} des articles</em>
          </div>
          <div className="stk-kpi" style={{ ['--g1' as any]: '#ffb21a', ['--g2' as any]: '#f26d0c' }}>
            <span className="stk-kpi-icon"><AlertTriangle size={34} strokeWidth={2.1} /></span>
            <span className="stk-kpi-txt">
              <b>{num(totaux.nbObsoletes)}</b>
              <span>Articles obsolètes</span>
            </span>
            <em className="stk-kpi-badge light">À vérifier</em>
          </div>
          <div className="stk-kpi" style={{ ['--g1' as any]: '#8b5cf6', ['--g2' as any]: '#4f2bd1' }}>
            <span className="stk-kpi-icon"><AlertOctagon size={34} strokeWidth={2.1} /></span>
            <span className="stk-kpi-txt">
              <b>{num(totaux.nbMauvaisEtat)}</b>
              <span>En mauvais état</span>
            </span>
            <em className="stk-kpi-badge">{pctFmt(totaux.nbMauvaisEtat, totaux.nbArticles)} des articles</em>
          </div>
        </div>

        <div className="stk-panel">
          <div className="stk-panel-head">
            <h3>À retenir</h3>
            {valeurAbsente && <p>La valeur du stock en GNF s’affichera dès que les prix unitaires seront intégrés.</p>}
          </div>
          {headline && <p className="stk-lead">{headline.text}</p>}
          {notes.length > 0 ? (
            <ul className="stk-notes">
              {notes.map((n, i) => (
                <li key={i} style={{ ['--c' as any]: n.color }}>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stk-dim">{loading ? 'Chargement…' : 'Aucun inventaire disponible.'}</p>
          )}
        </div>
      </div>

      {/* 2. Classement des stocks + points d'attention */}
      <div className="stk-cols">
        <div className="stk-panel">
          <div className="stk-panel-head">
            <h3>Où sont les problèmes</h3>
            <p>Touchez un stock pour afficher tous ses articles.</p>
          </div>

          <div className="stk-legend">
            <span><i style={{ background: COLORS.obsolete }} />Obsolètes</span>
            <span><i style={{ background: COLORS.rupture }} />Ruptures</span>
            <span><i style={{ background: COLORS.mauvais }} />Mauvais état</span>
            <span><i style={{ background: COLORS.sain, opacity: 0.55 }} />Sans alerte</span>
            <span className="stk-dim">La longueur de la barre suit le nombre d’articles.</span>
          </div>

          {groups.map((g) => (
            <div key={g.famille}>
              <div className="stk-group-title">
                <strong>{g.titre}</strong>
                <span>{g.sous} · {num(g.articles)} articles</span>
              </div>
              {g.rows.map(renderStore)}
            </div>
          ))}
          {groups.length === 0 && !loading && <p className="stk-dim">Aucun inventaire disponible.</p>}
        </div>

        <div className="stk-panel">
          <div className="stk-panel-head">
            <h3>À traiter en priorité</h3>
          </div>
          <div className="stk-tabs" role="tablist">
            {(['rupture', 'obsolete', 'mauvais'] as AttnKey[]).map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                className="stk-tab"
                aria-selected={attnTab === k}
                style={{ ['--c' as any]: COLORS[k] }}
                onClick={() => setAttnTab(k)}
              >
                {ATTN_LABEL[k]}
                <b>{num(attn[k].total)}</b>
              </button>
            ))}
          </div>

          {attnCurrent.items.map((l) => (
            <button key={l.id} type="button" className="stk-item" onClick={() => openItem(l)}>
              <span>
                <div className="stk-item-t">{l.designation}</div>
                <div className="stk-item-s">
                  {[l.codeArticle, l.sourceNom, l.lieu].filter(Boolean).join(' · ')}
                </div>
              </span>
              <span className="stk-item-q" style={{ color: attnTab === 'rupture' ? COLORS.rupture : 'var(--text-strong)' }}>
                {l.quantite !== null ? `${num(l.quantite)} ${l.unite}` : '—'}
              </span>
            </button>
          ))}
          {attnCurrent.items.length === 0 && (
            <p className="stk-dim" style={{ padding: '14px 4px' }}>Aucun article dans cette catégorie.</p>
          )}
          {attnCurrent.total > attnCurrent.items.length && (
            <button type="button" className="stk-more" onClick={() => openAttnList(attnTab)}>
              Voir les {num(attnCurrent.total)} articles dans l’inventaire
            </button>
          )}
        </div>
      </div>

      {/* 3. Inventaire détaillé : stock complet par magasin, ou résultats de recherche */}
      <div className="stk-panel" ref={detailRef}>
        <NewFeatureBubble
          id="stocks-complet-v1"
          block
          align="left"
          title="Nouveau : le stock complet"
          lines={[
            'Dépliez un magasin pour voir tous ses articles, sans pagination.',
            'La recherche fouille les 10 stocks à la fois.'
          ]}
        >
          <div className="stk-panel-head">
            <div>
              <h3>Inventaire détaillé · stock complet</h3>
              <p>
                {num(totaux.nbArticles)} articles dans {synthese.length} stocks. Dépliez un stock pour voir tous ses articles, ou cherchez dans tous les stocks.
              </p>
            </div>
            {!searching && (
              <button type="button" className="stk-btn" onClick={allOpen ? collapseAll : expandAll}>
                {allOpen ? 'Tout replier' : 'Tout déplier'}
              </button>
            )}
          </div>
        </NewFeatureBubble>

        <div className="stk-filters">
          <div className="stk-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Rechercher un code ou une désignation dans tous les stocks"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              aria-label="Rechercher un article"
            />
          </div>
          <div className="stk-tabs inline" role="tablist" aria-label="Filtrer par état">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                className="stk-tab"
                aria-selected={statusTab === t.key}
                onClick={() => { setStatusTab(t.key); setPage(0); }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {searching && (
            <select
              value={sourceFilter ?? ''}
              onChange={(e) => { setSourceFilter(e.target.value || null); setPage(0); }}
              aria-label="Limiter à un stock"
            >
              <option value="">Tous les stocks</option>
              {synthese.map((s) => <option key={s.sourceCode} value={s.sourceCode}>{s.sourceNom}</option>)}
            </select>
          )}
        </div>

        {searching ? (
          <>
            <div className="stk-count">
              <span>
                {loading ? 'Recherche…' : `${num(resultsTotal)} article${resultsTotal > 1 ? 's' : ''} trouvé${resultsTotal > 1 ? 's' : ''}`}
                {sourceFilter ? ` dans ${synthese.find((s) => s.sourceCode === sourceFilter)?.sourceNom ?? ''}` : ''}
              </span>
              <button type="button" className="stk-reset" onClick={resetFilters}>Revenir à la liste par stock</button>
            </div>
            <div className="stk-t2wrap">
              <div className="stk-t2scroll">
                <ArticlesTable
                  rows={results}
                  withStore
                  empty={loading ? 'Recherche…' : 'Aucun article ne correspond. Modifiez la recherche ou revenez à la liste par stock.'}
                />
              </div>
              <TableFooter
                from={resultsTotal === 0 ? 0 : page * PAGE_SIZE + 1}
                to={Math.min((page + 1) * PAGE_SIZE, resultsTotal)}
                total={resultsTotal}
                page={page}
                pages={totalPages}
                onPage={setPage}
                busy={busy}
                onExport={() => withAllResults((rows) => downloadExcel(rows, 'stock-recherche.csv'))}
                onPrint={() => withAllResults((rows) => printArticles(rows, 'SEG · Recherche dans les stocks', sousTitre))}
              />
            </div>
          </>
        ) : (
          groups.map((g) => (
            <div key={g.famille} className="stk-group">
              <div className="stk-group-title">
                <strong>{g.titre}</strong>
                <span>{g.sous} · {num(g.articles)} articles</span>
              </div>
              {g.rows.map((s) => {
                const open = !!openStores[s.sourceCode];
                const sous = s.famille === 'SEG' ? s.categorie : `Projet ${s.bailleur ?? ''}`.trim();
                return (
                  <div key={s.sourceCode} id={`stk-store-${s.sourceCode}`} className={`stk-acc${open ? ' is-open' : ''}`}>
                    <button type="button" className="stk-acc-head" aria-expanded={open} onClick={() => toggleStore(s.sourceCode)}>
                      <ChevronDown size={16} className="stk-chev" />
                      <span className="stk-acc-name">
                        <strong>{s.sourceNom}</strong>
                        {sous && !s.sourceNom.toLowerCase().includes(sous.toLowerCase()) && <small>{sous}</small>}
                      </span>
                      <span className="stk-acc-flags">
                        {s.nbObsoletes > 0 && <span className="stk-tag amber">{num(s.nbObsoletes)} obsolètes</span>}
                        {s.nbRuptures > 0 && <span className="stk-tag red">{num(s.nbRuptures)} ruptures</span>}
                        {s.nbMauvaisEtat > 0 && <span className="stk-tag orange">{num(s.nbMauvaisEtat)} mauvais état</span>}
                      </span>
                      <span className="stk-acc-n">{num(s.nbArticles)} articles</span>
                    </button>
                    {open && <StoreTable store={s} state={storeItems[s.sourceCode]} onReload={() => reloadStore(s.sourceCode)} sousTitre={sousTitre} />}
                  </div>
                );
              })}
            </div>
          ))
        )}
        <p className="stk-foot">Quantités exprimées dans l’unité propre à chaque article : u (unité), ml (mètre linéaire), paquet, carton.</p>
      </div>
    </div>
  );
}

/* ───────────────────────── Styles propres à la page ───────────────────────── */

const CSS = `
.stk{--stk-accent:#0e9f9a;--stk-accent-soft:rgba(14,159,154,.11);display:flex;flex-direction:column;gap:22px;max-width:1680px;margin:0 auto;padding-bottom:32px;color:var(--text-main)}
.stk *{box-sizing:border-box}
.stk-dim{color:var(--text-muted);font-size:12.5px;line-height:1.55}
.stk-crumb{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--text-dim);margin-bottom:-12px}
.stk-crumb a{color:var(--stk-accent);text-decoration:none;display:flex;align-items:center;gap:6px;font-weight:650;transition:color .18s}
.stk-crumb a:hover{color:#0b7e79}
.stk-crumb span:last-child{color:var(--text-muted)}
.stk .subpage-header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:4px 0 2px}
.stk .subpage-title h2{font-size:clamp(24px,3vw,32px)!important;letter-spacing:-.035em;line-height:1.12;margin:0;color:var(--text-strong)}
.stk .subpage-title p{max-width:65ch;margin:8px 0 0;color:var(--text-muted);font-size:13.5px;line-height:1.55}
.stk .dashboard-filter-bar{display:flex;flex-wrap:wrap;gap:10px!important;align-items:center}
.stk .db-status{display:inline-flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid var(--border-color);border-radius:999px;background:var(--bg-card);font-size:11.5px;font-weight:600;color:var(--text-muted)}
.stk .db-status span{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.13)}
.stk .db-status.loading span{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.14);animation:stk-pulse 1.3s infinite}
.stk .db-status.error span{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.13)}
.stk .btn-brand{border-radius:9px!important;padding:9px 13px!important;font-size:12px!important;box-shadow:0 4px 12px rgba(14,159,154,.14);transition:transform .18s,filter .18s}
.stk .btn-brand:hover{transform:translateY(-1px);filter:brightness(1.06)}
.stk .db-error-banner{border:1px solid rgba(239,68,68,.28);border-radius:10px;padding:12px 15px;background:rgba(239,68,68,.08);color:var(--text-secondary);font-size:13px}
.stk-top{display:flex;flex-direction:column;gap:18px}
.stk-figures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;background:transparent;border:0;overflow:visible}
.stk-panel{min-width:0;padding:20px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-card);box-shadow:0 5px 18px rgba(2,12,27,.035)}
.stk-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;margin-bottom:17px}
.stk-panel-head h3{margin:0;font-size:16px;line-height:1.35;font-weight:750;letter-spacing:-.015em;color:var(--text-strong)}
.stk-panel-head p{margin:2px 0 0;font-size:12px;line-height:1.5;color:var(--text-muted)}
.stk-notes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.stk-notes li{position:relative;display:flex;gap:11px;min-width:0;padding:13px 14px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-inner);font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.stk-notes li:before{content:'';flex:0 0 4px;border-radius:3px;background:var(--c);margin:1px 0}
.stk-notes strong{color:var(--text-strong)}
.stk-cols{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(340px,.9fr);gap:16px;align-items:start}
.stk-cols>.stk-panel{height:100%}
.stk-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px 15px;margin-bottom:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-inner);font-size:11.5px;color:var(--text-muted)}
.stk-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.stk-legend .stk-dim{flex-basis:100%;font-size:11px}
.stk-group-title{display:flex;justify-content:space-between;align-items:baseline;gap:6px 12px;flex-wrap:wrap;margin-top:13px;padding:11px 3px 8px;border-bottom:1px solid var(--border-color)}
.stk-group-title strong{font-size:12px;letter-spacing:.055em;text-transform:uppercase;color:var(--text-muted)}
.stk-group-title span{font-size:11px;color:var(--text-dim)}
.stk-row{width:100%;display:grid;grid-template-columns:minmax(0,220px) minmax(70px,1fr) 52px;gap:14px;align-items:center;text-align:left;padding:12px 10px;border:1px solid transparent;border-bottom-color:var(--border-subtle);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background .16s,border-color .16s}
.stk-row:hover{background:var(--stk-accent-soft);border-color:color-mix(in srgb,var(--stk-accent) 20%,transparent)}
.stk-row.is-active{background:var(--stk-accent-soft);border-color:color-mix(in srgb,var(--stk-accent) 45%,var(--border-color));box-shadow:inset 3px 0 var(--stk-accent)}
.stk-row:focus-visible,.stk-item:focus-visible,.stk-tab:focus-visible,.stk-more:focus-visible,.stk-pager button:focus-visible{outline:2px solid var(--stk-accent);outline-offset:2px}
.stk-row-name strong{display:block;font-size:12.5px;font-weight:700;color:var(--text-strong);line-height:1.35}
.stk-row-name small{display:block;margin-top:4px;font-size:10.5px;line-height:1.45;color:var(--text-muted)}
.stk-track{display:flex;height:9px;border-radius:999px;overflow:hidden;background:var(--border-color)}
.stk-seg{display:block;height:100%;transition:width .25s ease}
.stk-row-n{text-align:right;font-size:13px;font-weight:750;font-variant-numeric:tabular-nums;color:var(--text-strong)}
.stk-tabs{display:flex;gap:4px;padding:4px;background:var(--bg-inner);border:1px solid var(--border-color);border-radius:9px;margin-bottom:12px}
.stk-tabs.inline{margin-bottom:0;flex-wrap:wrap}
.stk-tab{flex:1;border:0;background:transparent;color:var(--text-muted);font:inherit;font-size:11.5px;font-weight:650;padding:8px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background .16s,color .16s,box-shadow .16s}
.stk-tab b{margin-left:6px;font-variant-numeric:tabular-nums}
.stk-tab:hover{color:var(--text-strong)}
.stk-tab[aria-selected=true]{background:var(--bg-card);color:var(--text-strong);box-shadow:0 1px 4px rgba(2,12,27,.12),inset 0 -2px var(--c,var(--stk-accent))}
.stk-item{width:100%;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;text-align:left;padding:12px 8px;border:0;border-bottom:1px solid var(--border-subtle);border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background .16s}
.stk-item:hover{background:var(--bg-inner)}
.stk-item-t{font-size:12.5px;font-weight:650;line-height:1.4;color:var(--text-strong)}
.stk-item-s{margin-top:4px;font-size:10.5px;line-height:1.4;color:var(--text-muted)}
.stk-item-q{font-size:12.5px;font-weight:750;white-space:nowrap;font-variant-numeric:tabular-nums}
.stk-more{margin-top:12px;width:100%;padding:10px 12px;border-radius:8px;border:1px solid color-mix(in srgb,var(--stk-accent) 30%,var(--border-color));background:var(--stk-accent-soft);color:var(--stk-accent);font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;transition:background .16s,border-color .16s}
.stk-more:hover{border-color:var(--stk-accent);background:color-mix(in srgb,var(--stk-accent) 15%,var(--bg-card))}
.stk-filters{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-bottom:14px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-inner)}
.stk-search{position:relative;flex:1 1 240px;min-width:200px}
.stk-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted)}
.stk-search input{width:100%;min-height:38px;padding:9px 12px 9px 36px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;color:var(--text-strong);font:inherit;font-size:12px;transition:border-color .16s,box-shadow .16s}
.stk-search input::placeholder{color:var(--text-dim)}
.stk-search input:focus{outline:0;border-color:var(--stk-accent);box-shadow:0 0 0 3px var(--stk-accent-soft)}
.stk-filters select{min-height:38px;max-width:240px;padding:8px 32px 8px 11px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);color:var(--text-secondary);font:inherit;font-size:12px}
.stk-filters select:focus{outline:2px solid var(--stk-accent);outline-offset:1px}
.stk-reset{border:0;background:transparent;color:var(--stk-accent);font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;padding:6px 4px}
.stk-tablewrap{overflow:auto;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-card)}
.stk-table{width:100%;min-width:780px;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:12px}
.stk-table th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:750;color:var(--text-muted);padding:12px 14px;background:var(--bg-inner);border-bottom:1px solid var(--border-color);white-space:nowrap}
.stk-table th:first-child{border-top-left-radius:9px}.stk-table th:last-child{border-top-right-radius:9px}
.stk-table td{padding:12px 14px;vertical-align:top;color:var(--text-secondary);border-bottom:1px solid var(--border-subtle);overflow-wrap:anywhere;line-height:1.45}
.stk-table tbody tr:last-child td{border-bottom:0}
.stk-table tbody tr:hover td{background:var(--bg-inner)}
.stk-table .num{text-align:right;font-variant-numeric:tabular-nums}
.stk-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:var(--text-muted)}
.stk-name{font-weight:650;line-height:1.4;color:var(--text-strong)}
.stk-sub{margin-top:3px;font-size:10.5px;font-weight:400;color:var(--text-muted);line-height:1.4}
.stk-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;border:1px solid transparent;font-size:10.5px;font-weight:700;white-space:nowrap}
.stk-tag:before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.stk-tag.red{color:#dc2626;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.22)}
.stk-tag.amber{color:#b77905;background:rgba(245,158,11,.11);border-color:rgba(245,158,11,.24)}
.stk-tag.orange{color:#c2410c;background:rgba(249,115,22,.1);border-color:rgba(249,115,22,.22)}
.stk-tag.green{color:#07845e;background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.23)}
html:not(.light) .stk-tag.red{color:#fca5a5}html:not(.light) .stk-tag.amber{color:#fcd34d}html:not(.light) .stk-tag.orange{color:#fdba74}html:not(.light) .stk-tag.green{color:#6ee7b7}
.stk-pager{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;font-size:11.5px;color:var(--text-muted)}
.stk-pager div{display:flex;gap:7px}
.stk-pager button{display:inline-flex;align-items:center;gap:5px;padding:8px 11px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-inner);color:var(--text-strong);font:inherit;font-size:11.5px;font-weight:650;cursor:pointer;transition:border-color .16s,color .16s}
.stk-pager button:hover:not(:disabled){border-color:var(--stk-accent);color:var(--stk-accent)}
.stk-pager button:disabled{opacity:.45;cursor:not-allowed}
@keyframes stk-pulse{50%{opacity:.45}}
@media(max-width:1100px){.stk-cols{grid-template-columns:minmax(0,1fr)}.stk-cols>.stk-panel{height:auto}}
@media(max-width:900px){.stk-figures{grid-template-columns:repeat(2,minmax(0,1fr))}.stk-notes{grid-template-columns:minmax(0,1fr)}}
@media(max-width:700px){.stk .subpage-header{align-items:flex-start;flex-direction:column}.stk .dashboard-filter-bar{align-self:flex-start!important}.stk-row{grid-template-columns:minmax(0,1fr) 50px;gap:9px}.stk-track{grid-column:1/-1;order:3}.stk-filters select{flex:1 1 180px;max-width:none}.stk-tabs.inline{width:100%;overflow:auto}.stk-tab{flex:0 0 auto}}
@media(max-width:520px){.stk{gap:16px}.stk-panel{padding:15px}.stk-figures{gap:8px}.stk-crumb{font-size:11px}.stk-crumb a{gap:4px}}
@media(prefers-reduced-motion:reduce){.stk *{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
/* — Inventaire détaillé · stock complet — */
.stk-lead{margin:0 0 14px;max-width:72ch;font-size:15px;line-height:1.55;font-weight:650;letter-spacing:-.01em;color:var(--text-strong)}
.stk-btn{padding:8px 13px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-inner);color:var(--text-strong);font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;transition:border-color .16s,color .16s}
.stk-btn:hover{border-color:var(--stk-accent);color:var(--stk-accent)}
.stk-count{display:flex;justify-content:space-between;align-items:center;gap:8px 12px;flex-wrap:wrap;margin:0 0 10px;font-size:12.5px;font-weight:650;color:var(--text-secondary)}
.stk-pad{padding:14px 6px}
.stk-group{margin-top:4px}
.stk-acc{border-bottom:1px solid var(--border-subtle,var(--border-color))}
.stk-acc-head{width:100%;display:grid;grid-template-columns:18px minmax(0,1fr) auto 92px;gap:12px;align-items:center;text-align:left;padding:12px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background .16s,border-color .16s}
.stk-acc-head:hover{background:var(--stk-accent-soft)}
.stk-acc.is-open>.stk-acc-head{background:var(--stk-accent-soft);border-color:color-mix(in srgb,var(--stk-accent) 35%,var(--border-color));box-shadow:inset 3px 0 var(--stk-accent)}
.stk-chev{color:var(--text-muted);transition:transform .18s}
.stk-acc.is-open .stk-chev{transform:rotate(180deg);color:var(--stk-accent)}
.stk-acc-name strong{display:block;font-size:13px;font-weight:700;line-height:1.35;color:var(--text-strong)}
.stk-acc-name small{display:block;margin-top:3px;font-size:10.5px;color:var(--text-muted)}
.stk-acc-flags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.stk-acc-n{text-align:right;font-size:12.5px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--text-strong)}
.stk-acc-body{padding:10px 0 16px 12px}
.stk-acc-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.stk-search.small{flex:0 1 320px}
.stk-search.small input{min-height:34px;padding:7px 10px 7px 32px;background:var(--bg-inner)}
.stk-tablewrap.tall{max-height:520px}
.stk-table th{position:sticky;top:0;z-index:1}
.stk-table td.stk-cell-tight{padding-top:10px;padding-bottom:10px}
.stk-qty{font-weight:750;color:var(--text-strong)}
.stk-unit{margin-left:4px;font-size:10.5px;color:var(--text-muted)}
.stk-loc{margin-left:8px;font-size:10.5px;color:var(--text-muted)}
.stk-empty{padding:26px 16px!important;text-align:center;color:var(--text-muted)!important}
.stk-foot{margin:14px 0 0;font-size:11px;color:var(--text-dim)}
.stk-acc-head:focus-visible,.stk-btn:focus-visible,.stk-reset:focus-visible{outline:2px solid var(--stk-accent);outline-offset:2px}
@media(max-width:700px){.stk-acc-head{grid-template-columns:18px minmax(0,1fr) auto}.stk-acc-flags{display:none}.stk-acc-body{padding-left:0}}

/* — Cartes indicateurs — */
.stk-kpi{position:relative;overflow:hidden;isolation:isolate;display:flex;align-items:center;gap:16px;min-height:118px;padding:20px 22px 26px;border-radius:16px;color:#fff;background:linear-gradient(135deg,var(--g1),var(--g2));box-shadow:0 12px 26px -16px var(--g2)}
.stk-kpi::before{content:'';position:absolute;z-index:-1;left:28%;right:-30%;bottom:-62%;height:120%;border-radius:50%;background:rgba(255,255,255,.11)}
.stk-kpi::after{content:'';position:absolute;z-index:-1;right:-34px;top:-46px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.08)}
.stk-kpi-icon{flex:0 0 64px;width:64px;height:64px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.17);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.stk-kpi-txt{min-width:0}
.stk-kpi-txt b{display:block;font-size:clamp(26px,2.6vw,34px);line-height:1;font-weight:800;letter-spacing:-.025em;font-variant-numeric:tabular-nums}
.stk-kpi-txt span{display:block;margin-top:7px;font-size:14px;font-weight:650;opacity:.96}
.stk-kpi-badge{position:absolute;right:12px;bottom:10px;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.2);font-size:11.5px;font-weight:700;font-style:normal;white-space:nowrap}
.stk-kpi-badge.light{background:#fff;color:#d9480f}

/* — Barre d'outils du tableau — */
.stk-tb{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.stk-tb-search{position:relative;flex:1 1 300px;min-width:220px}
.stk-tb-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-strong);pointer-events:none}
.stk-tb-search input{width:100%;height:44px;padding:0 14px 0 44px;border:1px solid var(--border-color);border-radius:11px;background:var(--bg-card);color:var(--text-strong);font:inherit;font-size:13.5px;box-shadow:0 1px 2px rgba(2,12,27,.05)}
.stk-tb-search input::placeholder{color:var(--text-dim)}
.stk-tb-search input:focus{outline:0;border-color:#2f80f7;box-shadow:0 0 0 3px rgba(47,128,247,.18)}
.stk-tb-select{position:relative;display:inline-flex;align-items:center;flex:0 1 250px;min-width:220px}
.stk-tb-select > svg:first-child{position:absolute;left:13px;color:var(--text-strong);pointer-events:none}
.stk-tb-select select{width:100%;height:44px;padding:0 38px 0 40px;border:1px solid var(--border-color);border-radius:11px;background:var(--bg-card);color:var(--text-strong);font:inherit;font-size:13.5px;font-weight:600;appearance:none;-webkit-appearance:none;cursor:pointer}
.stk-tb-select select:focus{outline:0;border-color:#2f80f7;box-shadow:0 0 0 3px rgba(47,128,247,.18)}
.stk-tb-chev{position:absolute;right:13px;color:var(--text-muted);pointer-events:none}
.stk-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 15px;border:0;border-radius:10px;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:filter .15s,transform .15s}
.stk-b:hover:not(:disabled){filter:brightness(1.07);transform:translateY(-1px)}
.stk-b:disabled{opacity:.5;cursor:not-allowed}
.stk-b.lg{height:44px;padding:0 20px;font-size:14px}
.stk-b.blue{background:linear-gradient(135deg,#2f80f7,#1659d6)}
.stk-b.green{background:linear-gradient(135deg,#1fa855,#13853f)}
.stk-b:focus-visible,.stk-th-btn:focus-visible,.stk-pages button:focus-visible{outline:2px solid #2f80f7;outline-offset:2px}

/* — Tableau — */
.stk-t2wrap{border:1px solid var(--border-color);border-radius:14px;overflow:hidden;background:var(--bg-card);box-shadow:0 8px 22px -14px rgba(2,12,27,.35)}
.stk-t2scroll{overflow:auto;max-height:600px}
.stk-t2{width:100%;min-width:860px;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:13.5px}
.stk-t2 thead th{position:sticky;top:0;z-index:2;padding:13px 16px;background:#0b2a55;color:#fff;font-size:13.5px;font-weight:700;text-align:left;white-space:nowrap}
.stk-t2 thead th.c{text-align:center}
.stk-th-btn{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
.stk-th-btn svg{opacity:.55}
.stk-th-btn.on svg{opacity:1}
.stk-t2 tbody td{padding:9px 16px;vertical-align:middle;color:var(--text-secondary);border-bottom:1px solid var(--border-subtle,var(--border-color))}
.stk-t2 tbody tr:nth-child(even) td{background:color-mix(in srgb,#2f80f7 5%,transparent)}
.stk-t2 tbody tr:hover td{background:color-mix(in srgb,#2f80f7 10%,transparent)}
.stk-t2 tbody tr:last-child td{border-bottom:0}
.stk-t2 td.c{text-align:center}
.stk-t2-code{font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-strong)}
.stk-t2-des{display:flex;align-items:center;gap:12px}
.stk-t2-ico{flex:0 0 18px;color:#2f80f7}
.stk-t2-name{display:block;font-weight:650;line-height:1.35;color:var(--text-strong);overflow-wrap:anywhere}
.stk-t2-sub{display:block;margin-top:2px;font-size:11.5px;color:var(--text-muted)}
.stk-qpill{display:inline-block;min-width:70px;padding:5px 12px;border-radius:999px;background:rgba(47,128,247,.15);color:var(--text-strong);font-weight:800;font-variant-numeric:tabular-nums;text-align:center}
.stk-qpill.zero{background:rgba(239,68,68,.15);color:#e03131}
.stk-t2-unit{display:block;margin-top:3px;font-size:11px;color:var(--text-muted)}
.stk-loc2{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--text-strong)}
.stk-loc2 svg{flex:0 0 14px;color:#2f80f7}
.stk-loc2 em{font-style:normal;font-size:12px;color:var(--text-muted)}
.stk-st{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap}
.stk-st-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:currentColor}
.stk-st.green{background:rgba(16,185,129,.14);color:#047857}
.stk-st.red{background:rgba(239,68,68,.13);color:#c92a2a}
.stk-st.amber{background:rgba(245,158,11,.18);color:#b45309}
.stk-st.orange{background:rgba(249,115,22,.15);color:#c2410c}
html:not(.light) .stk-st.green{color:#6ee7b7}html:not(.light) .stk-st.red{color:#fca5a5}html:not(.light) .stk-st.amber{color:#fcd34d}html:not(.light) .stk-st.orange{color:#fdba74}
html:not(.light) .stk-qpill.zero{color:#fca5a5}
.stk-t2-empty{padding:30px 16px!important;text-align:center;color:var(--text-muted)!important}

/* — Pied du tableau — */
.stk-tfoot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border-color);background:var(--bg-inner)}
.stk-tfoot-info{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:650;color:var(--text-strong)}
.stk-tfoot-info svg{color:#2f80f7}
.stk-tfoot-info select{height:30px;padding:0 8px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);color:var(--text-secondary);font:inherit;font-size:12px}
.stk-pages{display:flex;align-items:center;gap:6px}
.stk-pages button{min-width:36px;height:36px;padding:0 8px;display:inline-grid;place-items:center;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-card);color:var(--text-strong);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.stk-pages button:hover:not(:disabled){border-color:#2f80f7;color:#2f80f7}
.stk-pages button.on{background:linear-gradient(135deg,#2f80f7,#1659d6);border-color:transparent;color:#fff}
.stk-pages button:disabled{opacity:.4;cursor:not-allowed}
.stk-pages-gap{padding:0 2px;color:var(--text-muted)}
.stk-tfoot-actions{display:flex;gap:8px;flex-wrap:wrap}

@media(max-width:1100px){.stk-figures{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){
  .stk-tb-select{flex:1 1 160px}
  .stk-tfoot{justify-content:center}
  .stk-tfoot-info{width:100%;justify-content:center}
}
@media(max-width:520px){
  .stk-figures{grid-template-columns:minmax(0,1fr)}
  .stk-kpi{min-height:100px;padding:16px 18px 24px}
  .stk-kpi-icon{flex-basis:48px;width:48px;height:48px}
  .stk-b{flex:1 1 auto}
}
`;

