'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Newspaper, Volume2, Pause, Play, Square, RefreshCw,
  AlertOctagon, Activity, Fuel, FlaskConical, Droplet, Zap, Clock, MapPin, User, CalendarDays,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { GuineaJournalMap } from '@/components/journal/GuineaJournalMap';
import { SegeAssistant } from '@/components/journal/SegeAssistant';
import { NewFeatureBubble } from '@/components/NewFeatureBubble';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type Probleme = {
  id: number;
  numero_ordre: number | null;
  centre: string;
  region: string;
  probleme: string;
  categories: string[];
  solution: string | null;
  responsable: string | null;
  impacts: string | null;
  observation: string | null;
  statut: 'arret' | 'perturbe' | 'en_cours' | 'resolu';
  gravite: 'critique' | 'elevee' | 'moyenne' | 'faible';
  date_debut: string | null;
  date_debut_precision: string | null;
  heures_production_jour: number | null;
  jours: number | null;
  production?: { volume_produit_m3: number; ratio_capacite: number | null; taux_annuel: number | null; capacite_m3j: number | null; periode_debut: string; periode_fin: string } | null;
};
type Synthese = {
  total: number; arret: number; perturbe: number; critiques: number;
  carburant: number; produits_chimiques: number; fuites: number; edg: number;
  plus_long_jours: number | null;
};
type Evenement = { id: number; title: string; location: string | null; starts_at: string; all_day: boolean };
type Journal = {
  rapport_date: string | null;
  generated_at: string;
  problemes: Probleme[];
  synthese: Synthese;
  agenda: Evenement[];
};

/* ------------------------------------------------------------------ */
/* Libellés                                                            */
/* ------------------------------------------------------------------ */
const STATUT: Record<string, { label: string; color: string }> = {
  arret: { label: 'ARRÊT TOTAL', color: 'var(--accent-red)' },
  perturbe: { label: 'PERTURBÉ', color: 'var(--accent-amber)' },
  en_cours: { label: 'EN TRAITEMENT', color: 'var(--brand-cyan)' },
  resolu: { label: 'RÉSOLU', color: 'var(--accent-green)' },
};
const GRAVITE: Record<string, string> = { critique: 'Critique', elevee: 'Élevée', moyenne: 'Moyenne', faible: 'Faible' };
const CATEGORIE: Record<string, string> = {
  carburant: 'Carburant',
  produits_chimiques: 'Produits chimiques',
  fuite: 'Fuite',
  panne_equipement: 'Panne d’équipement',
  electricite_edg: 'Électricité EDG',
  vandalisme: 'Vandalisme',
  travaux: 'Travaux',
  consommables: 'Consommables',
};

const DUREE_DEFILEMENT_MS = 9000;

/* ------------------------------------------------------------------ */
/* Outils texte                                                        */
/* ------------------------------------------------------------------ */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

function dateLongue(d = new Date()) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function dateCourte(iso: string | null) {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function heure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function depuis(p: Probleme) {
  if (p.jours == null) return 'date de début inconnue';
  const approx = p.date_debut_precision && p.date_debut_precision !== 'jour' ? 'environ ' : '';
  if (p.jours === 0) return 'depuis aujourd’hui';
  return `depuis ${approx}${p.jours} jour${p.jours > 1 ? 's' : ''}`;
}
function pluriel(n: number, s: string, p?: string) {
  return `${n} ${n > 1 ? (p ?? s + 's') : s}`;
}
function listeNoms(ps: Probleme[]) {
  const n = ps.map((p) => p.centre);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`;
}

/* Une phrase lue pour un problème */
function phraseProbleme(p: Probleme) {
  const etat = p.statut === 'arret' ? 'en arrêt total' : p.statut === 'perturbe' ? 'perturbé' : 'en traitement';
  const resp = p.responsable ? ` Responsable : ${p.responsable}.` : '';
  const prod = p.production && p.production.ratio_capacite != null ? ` Depuis janvier, le centre a produit ${Math.round(Number(p.production.ratio_capacite) * 100)} % de sa capacité.` : '';
  return `Centre de ${p.centre}, région de ${p.region} : ${etat}, ${depuis(p)}. ${p.probleme}.${resp}${prod}`;
}

/* ------------------------------------------------------------------ */
/* Agent : réponses à partir des données du journal                    */
/* ------------------------------------------------------------------ */
function resume(j: Journal) {
  const s = j.synthese;
  if (s.total === 0) return 'Aucun problème ouvert dans le dernier rapport des centres. La situation est normale.';
  const arrets = j.problemes.filter((p) => p.statut === 'arret');
  let t = `Selon le rapport du ${dateCourte(j.rapport_date)}, ${pluriel(s.total, 'centre')} ${s.total > 1 ? 'ont' : 'a'} un problème ouvert : ${s.arret} en arrêt total et ${s.perturbe} ${s.perturbe > 1 ? 'perturbés' : 'perturbé'}. `;
  if (arrets.length) t += `Centres à l’arrêt : ${listeNoms(arrets)}. `;
  if (s.carburant) t += `Le manque de carburant touche ${pluriel(s.carburant, 'centre')}. `;
  if (s.plus_long_jours != null) {
    const p = j.problemes.find((x) => x.jours === s.plus_long_jours);
    if (p) t += `Le problème le plus ancien est à ${p.centre}, ${depuis(p)}.`;
  }
  return t.trim();
}

function repondre(question: string, j: Journal | null): string {
  if (!j) return 'Les données du journal ne sont pas encore chargées.';
  const q = norm(question);
  const ps = j.problemes;
  const s = j.synthese;

  if (/^(bonjour|bonsoir|salut|hello)/.test(q)) {
    return `Bonjour Monsieur le Directeur Général. ${resume(j)} Que souhaitez-vous savoir ?`;
  }
  if (/agenda|rendez|reunion|programme|calendrier/.test(q)) {
    if (!j.agenda.length) return 'Aucun rendez-vous inscrit à votre agenda pour aujourd’hui.';
    return 'Votre agenda du jour : ' + j.agenda.map((e) => `${e.all_day ? 'toute la journée' : 'à ' + heure(e.starts_at)}, ${e.title}${e.location ? ', à ' + e.location : ''}`).join(' ; ') + '.';
  }

  // Un centre précis ?
  const centre = ps.find((p) => q.includes(norm(p.centre)));
  if (centre && !/region/.test(q)) {
    const extra = [
      centre.impacts ? `Impact : ${centre.impacts}.` : '',
      centre.solution ? `Solution prévue : ${centre.solution}.` : '',
      centre.observation ? `Observation : ${centre.observation}.` : '',
    ].filter(Boolean).join(' ');
    return `${phraseProbleme(centre)} Gravité ${GRAVITE[centre.gravite]?.toLowerCase() ?? centre.gravite}. ${extra}`.trim();
  }
  // Une région ?
  const regions = Array.from(new Set(ps.map((p) => p.region)));
  const region = regions.find((r) => q.includes(norm(r)));
  if (region) {
    const l = ps.filter((p) => p.region === region);
    return `Région de ${region} : ${pluriel(l.length, 'centre')} en difficulté. ` + l.map((p) => `${p.centre}, ${STATUT[p.statut].label.toLowerCase()}, ${p.probleme}`).join(' ; ') + '.';
  }

  // Catégories
  const cats: [RegExp, string][] = [
    [/carburant|gasoil|gazoil|essence|fuel/, 'carburant'],
    [/chimique|chlore|traitement/, 'produits_chimiques'],
    [/fuite|conduite/, 'fuite'],
    [/edg|electricite|courant|energie/, 'electricite_edg'],
    [/panne|equipement|forage|pompe|groupe/, 'panne_equipement'],
    [/vandal|vol|cambriol|cable/, 'vandalisme'],
    [/travaux|route/, 'travaux'],
    [/huile|consommable/, 'consommables'],
  ];
  for (const [re, cat] of cats) {
    if (re.test(q)) {
      const l = ps.filter((p) => p.categories.includes(cat));
      if (!l.length) return `Aucun centre ne signale de problème de type « ${CATEGORIE[cat]} ».`;
      return `${pluriel(l.length, 'centre')} ${l.length > 1 ? 'sont concernés' : 'est concerné'} par « ${CATEGORIE[cat]} » : ${listeNoms(l)}.`;
    }
  }

  if (/plus long|plus ancien|depuis quand|le plus vieux/.test(q)) {
    const l = ps.filter((p) => p.jours != null).sort((a, b) => (b.jours ?? 0) - (a.jours ?? 0)).slice(0, 3);
    if (!l.length) return 'Les dates de début ne sont pas renseignées.';
    return 'Les problèmes les plus anciens : ' + l.map((p) => `${p.centre}, ${depuis(p)}`).join(' ; ') + '.';
  }
  if (/arret|arrete|ne produit/.test(q)) {
    const l = ps.filter((p) => p.statut === 'arret');
    return l.length ? `${pluriel(l.length, 'centre')} en arrêt total : ${listeNoms(l)}.` : 'Aucun centre en arrêt total.';
  }
  if (/perturb/.test(q)) {
    const l = ps.filter((p) => p.statut === 'perturbe');
    return l.length ? `${pluriel(l.length, 'centre')} ${l.length > 1 ? 'perturbés' : 'perturbé'} : ${listeNoms(l)}.` : 'Aucun centre perturbé.';
  }
  if (/critique|urgent|priorit|grave/.test(q)) {
    const l = ps.filter((p) => p.gravite === 'critique');
    return l.length
      ? `${pluriel(l.length, 'situation critique', 'situations critiques')}. Les trois premières à traiter : ` + l.slice(0, 3).map((p) => `${p.centre}, ${p.probleme}`).join(' ; ') + '.'
      : 'Aucune situation critique ouverte.';
  }
  if (/responsable|qui (doit|s occupe|gere)|direction/.test(q)) {
    const g = new Map<string, string[]>();
    ps.forEach((p) => { const k = p.responsable || 'Non attribué'; g.set(k, [...(g.get(k) ?? []), p.centre]); });
    return 'Répartition par responsable : ' + Array.from(g.entries()).map(([k, v]) => `${k}, ${pluriel(v.length, 'centre')} (${v.join(', ')})`).join(' ; ') + '.';
  }
  if (/combien|nombre|total/.test(q)) {
    return `${pluriel(s.total, 'centre')} avec un problème ouvert : ${s.arret} en arrêt, ${s.perturbe} ${s.perturbe > 1 ? 'perturbés' : 'perturbé'}, dont ${s.critiques} ${s.critiques > 1 ? 'critiques' : 'critique'}.`;
  }
  if (/resume|synthese|situation|point|briefing|quoi de neuf|journal/.test(q)) return resume(j);

  return 'Je peux vous répondre sur : la situation générale, les centres en arrêt ou perturbés, un centre ou une région précise (par exemple « Kankan »), le carburant, les produits chimiques, les fuites, l’électricité EDG, les responsables, les problèmes les plus anciens, ou votre agenda du jour.';
}

/* ------------------------------------------------------------------ */
/* Composant                                                           */
/* ------------------------------------------------------------------ */
export function JournalDG() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [filtre, setFiltreBrut] = useState<string>('tous');
  const setFiltre = useCallback((f: string) => { setFiltreBrut(f); setIndex(0); }, []);
  const [defile, setDefile] = useState(true);
  const [lecture, setLecture] = useState<'stop' | 'lecture' | 'pause'>('stop');
  const [voixOk, setVoixOk] = useState(true);
  const [micOk, setMicOk] = useState(true);

  const lectureId = useRef(0);

  /* Chargement */
  const charger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/journal', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Erreur');
      setJournal(j.data);
      setIndex(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Impossible de charger le journal');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  /* Agenda du jour : lu dans le calendrier du DG (mêmes rendez-vous que le calendrier et que Sege) */
  const chargerAgenda = useCallback(async () => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    try {
      const r = await fetch(`/api/calendrier?from=${f(d)}&to=${f(new Date(d.getTime() + 86400000))}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) return;
      const agenda = (j.events ?? []).map((e: { id: number; title: string; location: string | null; starts_at: string; all_day: boolean }) => ({ id: e.id, title: e.title, location: e.location, starts_at: e.starts_at, all_day: e.all_day }));
      setJournal((jr) => (jr ? { ...jr, agenda } : jr));
    } catch { /* calendrier indisponible : on garde l'agenda du journal */ }
  }, []);
  useEffect(() => {
    if (!journal) return;
    chargerAgenda();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal?.generated_at]);
  useEffect(() => {
    const maj = () => { chargerAgenda(); };
    window.addEventListener('sege-agenda-maj', maj);
    return () => window.removeEventListener('sege-agenda-maj', maj);
  }, [chargerAgenda]);

  /* Capacités du navigateur */
  useEffect(() => {
    setVoixOk(typeof window !== 'undefined' && 'speechSynthesis' in window);
    const w = window as any;
    setMicOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { try { window.speechSynthesis?.cancel(); } catch {} };
  }, []);

  /* Défilement automatique */
  const liste = useMemo(() => {
    if (!journal) return [] as Probleme[];
    if (filtre === 'tous') return journal.problemes;
    if (filtre === 'arret' || filtre === 'perturbe') return journal.problemes.filter((p) => p.statut === filtre);
    return journal.problemes.filter((p) => p.categories.includes(filtre));
  }, [journal, filtre]);
  const total = liste.length;
  useEffect(() => {
    if (!defile || lecture !== 'stop' || total < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % total), DUREE_DEFILEMENT_MS);
    return () => clearInterval(t);
  }, [defile, lecture, total]);


  /* Voix */
  const voixFr = useCallback(() => {
    const v = window.speechSynthesis.getVoices();
    return v.find((x) => x.lang?.toLowerCase().startsWith('fr') && /google|natural|online/i.test(x.name))
      || v.find((x) => x.lang?.toLowerCase().startsWith('fr')) || null;
  }, []);

  const dire = useCallback((texte: string, onStart?: () => void) => new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR';
    u.rate = 0.98;
    const v = voixFr();
    if (v) u.voice = v;
    u.onstart = () => onStart?.();
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  }), [voixFr]);

  const arreterLecture = useCallback(() => {
    lectureId.current++;
    try { window.speechSynthesis.cancel(); } catch {}
    setLecture('stop');
  }, []);

  const lireBriefing = useCallback(async () => {
    if (!journal || !('speechSynthesis' in window)) return;
    arreterLecture();
    const id = ++lectureId.current;
    setFiltreBrut('tous');
    setLecture('lecture');
    const segments: { texte: string; i?: number }[] = [
      { texte: `Bonjour Monsieur le Directeur Général, ici Sege. Nous sommes le ${dateLongue()}. Voici le journal de la Société des Eaux de Guinée.` },
      { texte: resume(journal) },
      ...journal.problemes.map((p, i) => ({ texte: phraseProbleme(p), i })),
    ];
    try {
      const res = await fetch('/api/journal/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'point général hors centres' }),
      });
      const j = await res.json();
      if (j.ok && j.reponse) {
        segments.push({ texte: 'Point sur les autres activités.' });
        String(j.reponse).split(/(?<=\.)\s+/).filter(Boolean).forEach((t: string) => segments.push({ texte: t }));
      }
    } catch { /* synthèse indisponible */ }
    if (journal.agenda.length) {
      segments.push({ texte: 'Votre agenda du jour : ' + journal.agenda.map((e) => `${e.all_day ? 'toute la journée' : 'à ' + heure(e.starts_at)}, ${e.title}`).join(' ; ') + '.' });
    }
    segments.push({ texte: 'Fin du journal. Je reste à votre écoute, posez-moi une question à tout moment.' });
    for (const s of segments) {
      if (lectureId.current !== id) return;
      await dire(s.texte, () => { if (s.i != null) setIndex(s.i); });
    }
    if (lectureId.current === id) setLecture('stop');
  }, [journal, dire, arreterLecture]);

  const basculerPause = () => {
    if (lecture === 'lecture') { window.speechSynthesis.pause(); setLecture('pause'); }
    else if (lecture === 'pause') { window.speechSynthesis.resume(); setLecture('lecture'); }
  };

  /* Sege : le centre cité dans une question s'affiche à la une */
  const selectionnerCentre = useCallback((question: string) => {
    if (!journal) return;
    const c = journal.problemes.findIndex((p) => norm(question).includes(norm(p.centre)));
    if (c >= 0) { setFiltreBrut('tous'); setIndex(c); setDefile(false); }
  }, [journal]);
  const repondreLocal = useCallback((question: string) => repondre(question, journal), [journal]);

  /* Rendu */
  const actif = liste[index] ?? liste[0];
  const choisir = (id: number) => {
    const i = liste.findIndex((p) => p.id === id);
    if (i >= 0) { setIndex(i); }
    else if (journal) { setFiltreBrut('tous'); setIndex(Math.max(0, journal.problemes.findIndex((p) => p.id === id))); }
    setDefile(false);
  };
  const plusAncien = journal?.problemes.reduce<Probleme | null>((m, p) => (p.jours != null && (!m || (m.jours ?? -1) < p.jours) ? p : m), null) ?? null;
  const basculer = (f: string) => setFiltre(filtre === f ? 'tous' : f);
  const s = journal?.synthese;

  return (
    <div className="jdg">
      <style>{CSS}</style>

      {/* En-tête */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><Newspaper size={18} /> Journal du DG</h2>
          <p>{dateLongue()} · Rapport des centres du {dateCourte(journal?.rapport_date ?? null)}</p>
        </div>
        <div className="jdg-actions">
          {voixOk && lecture === 'stop' && (
            <button className="jdg-btn jdg-btn-primary" onClick={lireBriefing} disabled={!journal}>
              <Volume2 size={16} /> Lire le journal
            </button>
          )}
          {voixOk && lecture !== 'stop' && (
            <>
              <button className="jdg-btn" onClick={basculerPause}>
                {lecture === 'pause' ? <><Play size={15} /> Reprendre</> : <><Pause size={15} /> Pause</>}
              </button>
              <button className="jdg-btn" onClick={arreterLecture}><Square size={14} /> Arrêter</button>
            </>
          )}
          <button className="jdg-btn" onClick={charger} title="Actualiser"><RefreshCw size={15} className={loading ? 'jdg-spin' : ''} /></button>
        </div>
      </div>

      {error && <div className="jdg-error">{error}</div>}
      {loading && !journal && <div className="jdg-empty">Chargement du journal…</div>}

      {journal && s && (
        <>
          {/* Chiffres clés : cliquer pour filtrer le journal et la carte */}
          <div className="jdg-kpis">
            <Kpi icon={<AlertOctagon size={17} />} label="Centres en arrêt" value={s.arret} total={s.total} sub="production stoppée" color="var(--accent-red)" active={filtre === 'arret'} onClick={() => basculer('arret')} />
            <Kpi icon={<Activity size={17} />} label="Centres perturbés" value={s.perturbe} total={s.total} sub="production réduite" color="var(--accent-amber)" active={filtre === 'perturbe'} onClick={() => basculer('perturbe')} />
            <Kpi icon={<Fuel size={17} />} label="Carburant" value={s.carburant} total={s.total} sub="centres en manque" color="var(--accent-orange)" active={filtre === 'carburant'} onClick={() => basculer('carburant')} />
            <Kpi icon={<FlaskConical size={17} />} label="Produits chimiques" value={s.produits_chimiques} total={s.total} sub="centres en manque" color="var(--accent-purple)" active={filtre === 'produits_chimiques'} onClick={() => basculer('produits_chimiques')} />
            <Kpi icon={<Droplet size={17} />} label="Fuites" value={s.fuites} total={s.total} sub="conduites touchées" color="var(--brand-cyan)" active={filtre === 'fuite'} onClick={() => basculer('fuite')} />
            <Kpi icon={<Zap size={17} />} label="Électricité EDG" value={s.edg} total={s.total} sub="centres dépendants" color="var(--brand-blue)" active={filtre === 'electricite_edg'} onClick={() => basculer('electricite_edg')} />
            <Kpi icon={<Clock size={17} />} label="Plus ancien" value={s.plus_long_jours != null ? `${s.plus_long_jours} j` : '—'} sub={plusAncien ? plusAncien.centre : 'date inconnue'} color="var(--text-muted)" active={false} onClick={() => plusAncien && choisir(plusAncien.id)} />
          </div>
          {filtre !== 'tous' && (
            <div className="jdg-filtre">
              Filtre : <b>{({ arret: 'Centres en arrêt', perturbe: 'Centres perturbés', ...CATEGORIE } as Record<string, string>)[filtre] ?? filtre}</b> · {pluriel(total, 'centre')}
              <button onClick={() => setFiltre('tous')}>Tout afficher</button>
            </div>
          )}

          <div className="jdg-grid">
            {/* Colonne principale : à la une + fil */}
            <div className="jdg-col">
              {actif ? (
                <section className={`jdg-une ${lecture !== 'stop' ? 'jdg-une-live' : ''}`} key={actif.id}>
                  <div className="jdg-une-top">
                    <span className="jdg-badge" style={{ background: STATUT[actif.statut].color }}>{STATUT[actif.statut].label}</span>
                    <span className="jdg-gravite">Gravité {GRAVITE[actif.gravite]}</span>
                    {lecture === 'lecture' && <span className="jdg-onair"><span className="jdg-dot" /> Lecture en cours</span>}
                    <span className="jdg-count">{index + 1} / {total}</span>
                  </div>
                  <h3 className="jdg-une-titre">{actif.centre}</h3>
                  <div className="jdg-une-meta">
                    <span><MapPin size={13} /> Région de {actif.region}</span>
                    <span><Clock size={13} /> {depuis(actif)}{actif.date_debut ? ` (${dateCourte(actif.date_debut)})` : ''}</span>
                    {actif.responsable && <span><User size={13} /> {actif.responsable}</span>}
                  </div>
                  <p className="jdg-une-texte">{actif.probleme}</p>
                  <div className="jdg-une-details">
                    {actif.impacts && <div><b>Impact</b><span>{actif.impacts}</span></div>}
                    {actif.solution && <div><b>Solution</b><span>{actif.solution}</span></div>}
                    {actif.observation && <div><b>Observation</b><span>{actif.observation}</span></div>}
                  </div>
                  {actif.production && (
                    <div className="jdg-prod">
                      <span>Production {new Date(`${actif.production.periode_debut}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}–{new Date(`${actif.production.periode_fin}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                      <b>{Number(actif.production.volume_produit_m3).toLocaleString('fr-FR')} m³</b>
                      <span className="jdg-prod-barre"><i style={{ width: `${Math.min(100, Number(actif.production.ratio_capacite ?? 0) * 100)}%`, background: Number(actif.production.ratio_capacite ?? 0) < 0.5 ? 'var(--accent-red)' : Number(actif.production.ratio_capacite ?? 0) < 0.8 ? 'var(--accent-amber)' : 'var(--accent-green)' }} /></span>
                      <b>{Math.round(Number(actif.production.ratio_capacite ?? 0) * 100)} % de la capacité</b>
                    </div>
                  )}
                  <div className="jdg-tags">
                    {actif.categories.map((c) => <span key={c} className="jdg-tag">{CATEGORIE[c] ?? c}</span>)}
                  </div>
                  <div className="jdg-une-nav">
                    <button className="jdg-btn jdg-btn-ghost" onClick={() => setIndex((i) => (i - 1 + total) % total)} aria-label="Précédent"><ChevronLeft size={16} /></button>
                    <button className="jdg-btn jdg-btn-ghost" onClick={() => setDefile((d) => !d)}>
                      {defile ? <><Pause size={14} /> Figer</> : <><Play size={14} /> Faire défiler</>}
                    </button>
                    <button className="jdg-btn jdg-btn-ghost" onClick={() => setIndex((i) => (i + 1) % total)} aria-label="Suivant"><ChevronRight size={16} /></button>
                  </div>
                  {defile && lecture === 'stop' && total > 1 && <div className="jdg-progress" key={`p-${index}`} />}
                </section>
              ) : (
                <section className="jdg-une"><div className="jdg-empty">Aucun problème ouvert dans le dernier rapport.</div></section>
              )}

              <section className="jdg-card jdg-fil-card">
                <div className="jdg-card-head"><span>Fil des problèmes en cours</span><small>{pluriel(total, 'centre')}</small></div>
                <div className="jdg-fil">
                  {liste.map((p, i) => (
                    <button key={p.id} className={`jdg-fil-item ${i === index ? 'on' : ''}`} onClick={() => { setIndex(i); setDefile(false); }}>
                      <span className="jdg-fil-bar" style={{ background: STATUT[p.statut].color }} />
                      <span className="jdg-fil-main">
                        <b>{p.centre}</b> <small>· {p.region}</small>
                        <span>{p.probleme}</span>
                      </span>
                      <span className="jdg-fil-jours">{p.jours != null ? `${p.jours} j` : '—'}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Colonne droite : agenda + agent */}
            <div className="jdg-col">
              <section className="jdg-card jdg-carte">
                <GuineaJournalMap
                  points={liste.map((p) => ({ id: p.id, centre: p.centre, region: p.region, statut: p.statut }))}
                  actifId={actif?.id ?? null}
                  lecture={lecture === 'lecture'}
                  onSelect={choisir}
                />
              </section>

              <section className="jdg-card">
                <div className="jdg-card-head"><span><CalendarDays size={14} /> Agenda du jour</span></div>
                {journal.agenda.length ? (
                  <ul className="jdg-agenda">
                    {journal.agenda.map((e) => (
                      <li key={e.id}><b>{e.all_day ? 'Journée' : heure(e.starts_at)}</b><span>{e.title}{e.location ? ` · ${e.location}` : ''}</span></li>
                    ))}
                  </ul>
                ) : <div className="jdg-empty small">Aucun rendez-vous aujourd’hui.</div>}
              </section>

              <NewFeatureBubble id="journal-sege-2026-11" block align="left" title="Nouveau : Sege, votre assistante" lines={['Elle parcourt toutes les pages du dashboard, vous répond à voix haute et ouvre les pages pour vous.', 'Essayez : « point général » ou « ouvre les stocks ».']}>
              <SegeAssistant
                parleExterne={lecture === 'lecture'}
                voixOk={voixOk}
                micOk={micOk}
                dire={dire}
                arreter={arreterLecture}
                lireJournal={lireBriefing}
                onCentre={selectionnerCentre}
                repondreLocal={repondreLocal}
              />
              </NewFeatureBubble>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, total, sub, color, active, onClick }: {
  icon: React.ReactNode; label: string; value: number | string; total?: number; sub: string;
  color: string; active: boolean; onClick: () => void;
}) {
  const ratio = typeof value === 'number' && total ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <button type="button" className={`jdg-kpi ${active ? 'on' : ''}`} style={{ ['--kc' as string]: color }} onClick={onClick} title={label}>
      <div className="jdg-kpi-top">
        <span className="jdg-kpi-label">{label}</span>
        <span className="jdg-kpi-icon">{icon}</span>
      </div>
      <div className="jdg-kpi-val">
        <b>{value}</b>
        {ratio != null && <em>{ratio} %</em>}
      </div>
      <small className="jdg-kpi-sub">{sub}</small>
      {ratio != null && <span className="jdg-kpi-bar"><i style={{ width: `${ratio}%` }} /></span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Styles (préfixe jdg- pour ne rien toucher ailleurs)                 */
/* ------------------------------------------------------------------ */
const CSS = `
.jdg { display: flex; flex-direction: column; gap: 16px; }
.jdg-actions { display: flex; gap: 8px; align-items: center; }
.jdg-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.jdg-btn:hover { background: var(--bg-card-hover); }
.jdg-btn:disabled { opacity: .5; cursor: not-allowed; }
.jdg-btn-primary { background: var(--brand-blue); border-color: var(--brand-blue); color: #fff; }
.jdg-btn-primary:hover { background: #1d4ed8; }
.jdg-btn-ghost { background: transparent; }
.jdg-spin { animation: jdg-rot 1s linear infinite; }
@keyframes jdg-rot { to { transform: rotate(360deg); } }
.jdg-error { padding: 12px 14px; border-radius: 10px; border: 1px solid var(--accent-red); color: var(--accent-red); background: color-mix(in srgb, var(--accent-red) 8%, transparent); font-size: 13px; }
.jdg-empty { padding: 28px; text-align: center; color: var(--text-muted); font-size: 13px; }
.jdg-empty.small { padding: 14px; }

.jdg-kpis { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1400px) { .jdg-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 760px) { .jdg-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.jdg-kpi { position: relative; overflow: hidden; text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 14px 14px 16px; border-radius: 14px; cursor: pointer; color: inherit; font: inherit;
  border: 1px solid var(--border-color);
  background: linear-gradient(160deg, color-mix(in srgb, var(--kc) 13%, var(--bg-card)) 0%, var(--bg-card) 55%);
  transition: transform .18s, border-color .18s, box-shadow .18s; }
.jdg-kpi::before { content: ''; position: absolute; left: 0; top: 0; right: 0; height: 3px; background: var(--kc); opacity: .85; }
.jdg-kpi:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--kc) 55%, var(--border-color)); box-shadow: 0 8px 24px color-mix(in srgb, var(--kc) 16%, transparent); }
.jdg-kpi.on { border-color: var(--kc); box-shadow: 0 0 0 1px var(--kc), 0 8px 24px color-mix(in srgb, var(--kc) 22%, transparent); }
.jdg-kpi-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.jdg-kpi-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jdg-kpi-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; color: var(--kc); background: color-mix(in srgb, var(--kc) 16%, transparent); }
.jdg-kpi-val { display: flex; align-items: baseline; gap: 8px; }
.jdg-kpi-val b { font-size: 30px; font-weight: 800; line-height: 1; color: var(--text-strong); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.jdg-kpi-val em { font-style: normal; font-size: 12px; font-weight: 700; color: var(--kc); }
.jdg-kpi-sub { font-size: 11.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jdg-kpi-bar { position: absolute; left: 14px; right: 14px; bottom: 8px; height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--kc) 14%, transparent); overflow: hidden; }
.jdg-kpi-bar i { display: block; height: 100%; background: var(--kc); border-radius: 2px; transition: width .6s; }
.jdg-filtre { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
.jdg-filtre b { color: var(--text-strong); }
.jdg-filtre button { margin-left: 4px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; }

.jdg-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(340px, 1fr); gap: 16px; align-items: stretch; }
@media (max-width: 1100px) { .jdg-grid { grid-template-columns: 1fr; } }
.jdg-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.jdg-col > :last-child { flex: 1; }
.jdg-carte { overflow: hidden; }
.jdg-fil-card { display: flex; flex-direction: column; min-height: 0; }

.jdg-une { position: relative; overflow: hidden; padding: 22px 24px 18px; border-radius: 16px; border: 1px solid var(--border-color);
  background: linear-gradient(135deg, color-mix(in srgb, var(--brand-blue) 14%, var(--bg-card)), var(--bg-card) 60%);
  animation: jdg-in .45s ease; }
.jdg-une-live { border-color: var(--brand-cyan); box-shadow: 0 0 0 1px var(--brand-cyan), 0 8px 30px color-mix(in srgb, var(--brand-cyan) 18%, transparent); }
@keyframes jdg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.jdg-une-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.jdg-badge { color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .06em; padding: 4px 9px; border-radius: 6px; }
.jdg-gravite { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.jdg-onair { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--brand-cyan); font-weight: 700; }
.jdg-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-red); animation: jdg-pulse 1.2s infinite; }
@keyframes jdg-pulse { 50% { opacity: .3; } }
.jdg-count { margin-left: auto; font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.jdg-une-titre { font-size: 30px; font-weight: 800; color: var(--text-strong); margin: 12px 0 6px; letter-spacing: -0.02em; }
.jdg-une-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--text-muted); }
.jdg-une-meta span { display: inline-flex; align-items: center; gap: 5px; }
.jdg-une-texte { font-size: 17px; line-height: 1.5; color: var(--text-primary); margin: 14px 0; font-weight: 500; }
.jdg-une-details { display: grid; gap: 6px; font-size: 13px; }
.jdg-une-details div { display: grid; grid-template-columns: 100px 1fr; gap: 8px; }
.jdg-une-details b { color: var(--text-muted); font-weight: 600; }
.jdg-une-details span { color: var(--text-secondary); }
.jdg-prod { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding: 9px 12px; border-radius: 10px; background: var(--bg-inner); border: 1px solid var(--border-subtle); font-size: 12.5px; color: var(--text-muted); }
.jdg-prod b { color: var(--text-strong); }
.jdg-prod-barre { flex: 1; min-width: 80px; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--brand-cyan) 10%, transparent); overflow: hidden; }
.jdg-prod-barre i { display: block; height: 100%; border-radius: 3px; }
.jdg-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.jdg-tag { font-size: 11.5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-color); color: var(--text-secondary); background: var(--bg-inner); }
.jdg-une-nav { display: flex; justify-content: center; gap: 6px; margin-top: 14px; }
.jdg-progress { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--brand-cyan); animation: jdg-bar ${DUREE_DEFILEMENT_MS}ms linear forwards; }
@keyframes jdg-bar { from { width: 0; } to { width: 100%; } }

.jdg-card { border-radius: 14px; border: 1px solid var(--border-color); background: var(--bg-card); overflow: hidden; }
.jdg-card-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); font-size: 13px; font-weight: 700; color: var(--text-primary); }
.jdg-card-head span { display: inline-flex; align-items: center; gap: 6px; }
.jdg-card-head small { font-size: 11.5px; color: var(--text-dim); font-weight: 500; }

.jdg-fil { flex: 1; max-height: 560px; overflow-y: auto; }
.jdg-fil-item { width: 100%; display: flex; align-items: stretch; gap: 10px; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--border-subtle); background: transparent; text-align: left; cursor: pointer; color: inherit; }
.jdg-fil-item:hover { background: var(--bg-card-hover); }
.jdg-fil-item.on { background: color-mix(in srgb, var(--brand-blue) 12%, transparent); }
.jdg-fil-bar { width: 4px; border-radius: 2px; flex-shrink: 0; }
.jdg-fil-main { flex: 1; min-width: 0; font-size: 13px; color: var(--text-primary); }
.jdg-fil-main small { color: var(--text-dim); }
.jdg-fil-main span { display: block; color: var(--text-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.jdg-fil-jours { font-size: 12px; font-weight: 700; color: var(--text-secondary); font-variant-numeric: tabular-nums; align-self: center; }

.jdg-agenda { list-style: none; margin: 0; padding: 6px 0; }
.jdg-agenda li { display: flex; gap: 10px; padding: 8px 14px; font-size: 13px; }
.jdg-agenda b { color: var(--brand-cyan); min-width: 54px; }
.jdg-agenda span { color: var(--text-primary); }

.jdg-agent { display: flex; flex-direction: column; min-height: 380px; }
.jdg-chat { flex: 1; min-height: 220px; max-height: 520px; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.jdg-chat-vide { color: var(--text-muted); font-size: 13px; line-height: 1.5; }
.jdg-sugg { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.jdg-sugg button { font-size: 12px; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-secondary); cursor: pointer; }
.jdg-sugg button:hover { border-color: var(--brand-cyan); color: var(--text-strong); }
.jdg-msg { max-width: 88%; padding: 9px 12px; border-radius: 12px; font-size: 13px; line-height: 1.45; }
.jdg-msg.dg { align-self: flex-end; background: var(--brand-blue); color: #fff; border-bottom-right-radius: 4px; }
.jdg-msg-fiche { display: block; margin-top: 8px; padding: 6px 10px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--brand-cyan) 45%, transparent); background: color-mix(in srgb, var(--brand-cyan) 10%, transparent); color: var(--brand-cyan); font-size: 12px; font-weight: 700; cursor: pointer; text-align: left; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jdg-msg-fiche:hover { background: color-mix(in srgb, var(--brand-cyan) 18%, transparent); }
.jdg-clear { font-size: 11.5px; font-weight: 600; padding: 4px 9px; border-radius: 7px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; }
.jdg-clear:hover { color: var(--accent-red); border-color: var(--accent-red); }
.jdg-msg.agent { align-self: flex-start; background: var(--bg-inner); border: 1px solid var(--border-subtle); color: var(--text-primary); border-bottom-left-radius: 4px; }
.jdg-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border-subtle); }
.jdg-input input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-primary); font-size: 13px; outline: none; }
.jdg-input input:focus { border-color: var(--brand-cyan); }
.jdg-mic, .jdg-send { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-primary); cursor: pointer; flex-shrink: 0; }
.jdg-mic.on { background: var(--accent-red); border-color: var(--accent-red); color: #fff; animation: jdg-pulse 1.2s infinite; }
.jdg-send { background: var(--brand-blue); border-color: var(--brand-blue); color: #fff; }
.jdg-send:disabled { opacity: .45; cursor: not-allowed; }
`;
