'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic, Send, Volume2, VolumeX, RotateCcw, Copy, Check, ExternalLink, FileText,
  Activity, Factory, Banknote, Users, Boxes, CalendarDays, AlertOctagon, Square, Ear, EarOff, X, CalendarCheck, CalendarX, CalendarClock, BellRing,
} from 'lucide-react';
import { FicheBulle, type Carte } from '@/components/journal/FicheBulle';
import { commandeCarte, piloterCarte, phraseCommande } from '@/lib/sege-carte';
import { intention, comprendreRdv, periodeDemandee, meilleurRdv, phraseRdv, dateLongue, heureFr, trouverDate, trouverHeure } from '@/lib/sege-agenda';

/* =====================================================================
   SEGE — assistante du Directeur Général
   Orbe animée (au repos, écoute, réflexion, parole), ondes pendant la voix,
   suggestions par thème, liens vers les pages, relances en un clic.
   ===================================================================== */

type Lien = { label: string; href: string };
type Ev = { id: number; title: string; location: string | null; starts_at: string; ends_at: string | null; all_day: boolean; reminder_minutes: number | null };
type Brouillon = { titre: string; date: string; heure: string; journee: boolean; dureeMin: number; lieu: string; rappelMin: number | null };
type Action =
  | { type: 'creer'; b: Brouillon; etat: 'attente' | 'fait' | 'abandon' | 'erreur'; erreur?: string }
  | { type: 'deplacer'; ev: Ev; b: Brouillon; etat: 'attente' | 'fait' | 'abandon' | 'erreur'; erreur?: string }
  | { type: 'annuler'; ev: Ev; etat: 'attente' | 'fait' | 'abandon' | 'erreur'; erreur?: string };
type Msg = {
  id: number; de: 'dg' | 'sege'; texte: string; heure: string;
  carte?: Carte; liens?: Lien[]; suivantes?: string[]; enCours?: boolean; action?: Action; rappel?: boolean;
};

/* Outils agenda */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const versDate = (b: Brouillon) => { const [y, m, j] = b.date.split('-').map(Number); const [h, mi] = (b.journee ? '00:00' : b.heure || '09:00').split(':').map(Number); return new Date(y, m - 1, j, h, mi, 0, 0); };
const phraseB = (b: Brouillon) => phraseRdv({ titre: b.titre || 'Rendez-vous', debut: versDate(b), journee: b.journee, lieu: b.lieu || null, rappelMin: b.rappelMin });
const phraseEv = (e: Ev) => `${e.title}, ${dateLongue(new Date(e.starts_at))}${e.all_day ? '' : ` à ${heureFr(new Date(e.starts_at))}`}${e.location ? `, ${e.location}` : ''}`;
async function chargerAgenda(de: Date, a: Date): Promise<{ events: Ev[]; auto: { date: string; title: string }[] } | null> {
  const span = Math.max(1, Math.min(120, Math.round((a.getTime() - de.getTime()) / 86400000)));
  const fin = new Date(de.getTime() + span * 86400000);
  try {
    const r = await fetch(`/api/calendrier?from=${ymd(de)}&to=${ymd(fin)}`, { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) return null;
    return { events: (j.events ?? []) as Ev[], auto: j.auto ?? [] };
  } catch { return null; }
}
const RAPPELS: { v: number | null; l: string }[] = [
  { v: null, l: 'Sans rappel' }, { v: 10, l: '10 min avant' }, { v: 15, l: '15 min avant' }, { v: 30, l: '30 min avant' },
  { v: 60, l: '1 h avant' }, { v: 120, l: '2 h avant' }, { v: 1440, l: 'La veille' },
];
export type Etat = 'repos' | 'ecoute' | 'reflexion' | 'parole';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const maintenant = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const salut = () => { const h = new Date().getHours(); return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'; };

const THEMES: { icone: React.ReactNode; titre: string; question: string; c: string }[] = [
  { icone: <Activity size={15} />, titre: 'Situation', question: 'Point général', c: '#38bdf8' },
  { icone: <AlertOctagon size={15} />, titre: 'Centres', question: 'Centres à l’arrêt', c: '#ef4444' },
  { icone: <Factory size={15} />, titre: 'Production', question: 'Taux de réalisation', c: '#06b6d4' },
  { icone: <Banknote size={15} />, titre: 'Commercial', question: 'Impayés par agence', c: '#f59e0b' },
  { icone: <Users size={15} />, titre: 'RH', question: 'Effectif par service', c: '#a78bfa' },
  { icone: <Boxes size={15} />, titre: 'Stocks', question: 'Stocks en rupture', c: '#10b981' },
  { icone: <CalendarDays size={15} />, titre: 'Agenda', question: 'Mon agenda du jour', c: '#f472b6' },
  { icone: <CalendarCheck size={15} />, titre: 'Rendez-vous', question: 'Fixe une réunion demain à 10 h', c: '#34d399' },
];

export function SegeAssistant({
  parleExterne, voixOk, micOk, dire, arreter, lireJournal, onCentre, repondreLocal, onEtat, onFermer,
}: {
  parleExterne: boolean;                       // lecture du journal en cours
  voixOk: boolean; micOk: boolean;
  dire: (texte: string, onStart?: () => void) => Promise<void>;
  arreter: () => void;
  lireJournal: () => void;
  onCentre: (question: string) => void;        // sélectionne le centre cité dans le journal
  repondreLocal: (question: string) => string; // réponse de secours hors ligne
  onEtat?: (etat: Etat) => void;               // pour l'orbe flottante des autres pages
  onFermer?: () => void;                       // bouton de fermeture (version flottante)
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const msgsRef = useRef<Msg[]>([]);
  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  const [saisie, setSaisie] = useState('');
  const [etat, setEtat] = useState<Etat>('repos');
  const [parleId, setParleId] = useState<number | null>(null);
  const [sonActif, setSonActif] = useState(true);
  const [fiche, setFiche] = useState<Carte | null>(null);
  const [copie, setCopie] = useState<number | null>(null);
  const idRef = useRef(1);
  const attenteRef = useRef<number | null>(null);   // message dont l'action attend « oui » / « non »
  const recoRef = useRef<any>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLTextAreaElement>(null);

  /* ---- Mode « Sege » : écoute permanente du mot d'appel ---- */
  const [veille, setVeille] = useState(false);
  const [bulle, setBulle] = useState(false);
  const [entendu, setEntendu] = useState('');
  const [depuis, setDepuis] = useState(0);
  const veilleRef = useRef(false);
  const occupeRef = useRef(false);          // vrai pendant une question / une réponse
  const recoVeilleRef = useRef<any>(null);
  const arreterSessionRef = useRef<() => void>(() => {});
  const fermerBulleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const etatAffiche: Etat = parleExterne ? 'parole' : etat;
  useEffect(() => { onEtat?.(etatAffiche); }, [etatAffiche, onEtat]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs]);
  useEffect(() => () => { try { recoRef.current?.abort(); } catch {} }, []);

  const parler = useCallback(async (id: number, texte: string) => {
    if (!voixOk || !sonActif) { setEtat('repos'); return; }
    arreter();
    setParleId(id);
    setEtat('parole');
    await dire(texte);
    setParleId((p) => (p === id ? null : p));
    setEtat((e) => (e === 'parole' ? 'repos' : e));
  }, [voixOk, sonActif, dire, arreter]);

  const taire = () => { arreter(); try { window.speechSynthesis.cancel(); } catch {} setParleId(null); setEtat('repos'); };

  /* Exécuter une action d'agenda validée (bouton ou « oui ») */
  const executerRef = useRef<(id: number, idQ?: number) => Promise<void>>(async () => {});
  const executer = useCallback((id: number, idQ?: number) => executerRef.current(id, idQ), []);

  const poser = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) return;
    const idQ = idRef.current++; const idR = idRef.current++;
    setMsgs((m) => [...m, { id: idQ, de: 'dg', texte: q, heure: maintenant() }, { id: idR, de: 'sege', texte: '', heure: maintenant(), enCours: true }]);
    setEtat('reflexion');
    occupeRef.current = true;
    onCentre(q);

    /* ---- Réponse « oui / non » à une action d'agenda en attente ---- */
    const qn = norm(q).replace(/^(sege|serge|seje)[\s,.:!]*/, '');
    if (attenteRef.current != null && /^(oui|ok|d accord|confirme|je confirme|valide|vas y|c est bon|parfait|exact)\b/.test(qn)) {
      const cible = attenteRef.current;
      setMsgs((m) => m.filter((x) => x.id !== idR));
      await executer(cible, idQ);
      occupeRef.current = false;
      return;
    }
    if (attenteRef.current != null && /^(non|annule|laisse tomber|pas maintenant|abandonne|stop)\b/.test(qn) && !/rendez|reunion|rdv/.test(qn)) {
      const cible = attenteRef.current; attenteRef.current = null;
      setMsgs((m) => m.filter((x) => x.id !== idR).map((x) => (x.id === cible && x.action ? { ...x, action: { ...x.action, etat: 'abandon' } as Action } : x)));
      await parler(-1, 'Très bien, je n’enregistre rien.');
      occupeRef.current = false;
      return;
    }

    /* ---- Carte nationale : montrer un centre, une région, zoomer, filtrer ---- */
    const cmdCarte = commandeCarte(q);
    if (cmdCarte) {
      const { resultat, ouverte } = await piloterCarte(cmdCarte, (h) => router.push(h));
      let t = phraseCommande(cmdCarte, resultat);
      if (ouverte) t = `J’ouvre le Tableau de bord. ${t}`;
      const liens: Lien[] = ouverte || !resultat ? [{ label: 'Tableau de bord · carte', href: '/' }] : [];
      // Pour un centre ou un site, Sege ajoute ce qu'elle sait de sa situation
      if (cmdCarte.action === 'lieu' && resultat?.ok && cmdCarte.cible) {
        try {
          const res = await fetch('/api/journal/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: cmdCarte.cible }) });
          const j = await res.json();
          const rep = String(j?.reponse ?? '');
          if (j?.ok && norm(rep).includes(norm(cmdCarte.cible)) && !/^Je suis Sege/.test(rep)) t += ` ${rep}`;
        } catch { /* sans détail */ }
      }
      setMsgs((m) => m.map((x) => (x.id === idR ? { ...x, texte: t, liens, enCours: false, heure: maintenant(), suivantes: cmdCarte.action === 'lieu' || cmdCarte.action === 'region' ? ['Zoome', 'Dézoome', 'Recentre la carte'] : ['Montre les centres à l’arrêt sur la carte', 'Recentre la carte'] } : x)));
      await parler(idR, t);
      occupeRef.current = false;
      return;
    }

    /* ---- Agenda : créer, consulter, déplacer, annuler ---- */
    const intent = intention(q);
    if (intent) {
      const fin = (texte: string, extra: Partial<Msg> = {}) => {
        setMsgs((m) => m.map((x) => (x.id === idR ? { ...x, texte, ...extra, enCours: false, heure: maintenant() } : x)));
        return parler(idR, extra.action?.etat === 'attente' ? `${texte} Je confirme ?` : texte).then(() => { occupeRef.current = false; });
      };
      if (intent === 'creer') {
        const r = comprendreRdv(q);
        if (!r) { await fin('Pour quel jour et à quelle heure, Monsieur le Directeur ? Par exemple : « demain à 10 heures ».'); return; }
        const b: Brouillon = { titre: r.titre, date: ymd(r.debut), heure: r.journee ? '' : hm(r.debut), journee: r.journee, dureeMin: r.dureeMin, lieu: r.lieu ?? '', rappelMin: r.rappelMin };
        attenteRef.current = idR;
        await fin(`Je vous propose : ${phraseB(b)}.`, { action: { type: 'creer', b, etat: 'attente' } });
        return;
      }
      if (intent === 'lister') {
        const p = periodeDemandee(q);
        const d = await chargerAgenda(p.de, p.a);
        if (!d) { await fin('Je n’arrive pas à lire votre calendrier pour le moment.'); return; }
        const evs = d.events.filter((e) => new Date(e.starts_at) >= p.de || e.all_day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        const plusieursJours = p.a.getTime() - p.de.getTime() > 86400000;
        const ligne = (e: Ev) => `${plusieursJours ? `${dateLongue(new Date(e.starts_at))}, ` : ''}${e.all_day ? 'toute la journée' : heureFr(new Date(e.starts_at))} : ${e.title}${e.location ? ` (${e.location})` : ''}`;
        let t = evs.length ? `Votre agenda ${p.libelle} : ${evs.map(ligne).join(' ; ')}.` : `Vous n’avez aucun rendez-vous ${p.libelle}.`;
        if (d.auto.length) t += ` À noter aussi : ${d.auto.slice(0, 3).map((a) => a.title).join(' ; ')}.`;
        await fin(t, { suivantes: ['Fixe un rendez-vous demain à 10 h', 'Mes rendez-vous de la semaine'] });
        return;
      }
      // déplacer / annuler : retrouver le rendez-vous visé dans les 60 prochains jours
      const j0 = new Date(); j0.setHours(0, 0, 0, 0);
      const d = await chargerAgenda(new Date(j0.getTime() - 86400000), new Date(j0.getTime() + 60 * 86400000));
      if (!d) { await fin('Je n’arrive pas à lire votre calendrier pour le moment.'); return; }
      const avenir = d.events.filter((e) => new Date(e.starts_at).getTime() > Date.now() - 3600000);
      let ev = meilleurRdv(q, avenir);
      const jourDit = trouverDate(qn, new Date());
      if (!ev && jourDit && intent === 'annuler') { const l = avenir.filter((e) => ymd(new Date(e.starts_at)) === ymd(jourDit.date)); if (l.length === 1) ev = l[0]; }
      if (!ev) { await fin(avenir.length ? `Je ne trouve pas ce rendez-vous. Vos prochains rendez-vous : ${avenir.slice(0, 4).map((e) => phraseEv(e)).join(' ; ')}.` : 'Vous n’avez aucun rendez-vous à venir.'); return; }
      attenteRef.current = idR;
      if (intent === 'annuler') { await fin(`Vous voulez annuler : ${phraseEv(ev)}.`, { action: { type: 'annuler', ev, etat: 'attente' } }); return; }
      const ancien = new Date(ev.starts_at);
      const nd = trouverDate(qn.replace(/^.*?\b(a|au|pour|vers|le)\b/, ' $1'), new Date());
      const nh = trouverHeure(qn);
      const nouveau = new Date(nd ? nd.date : ancien);
      if (nh) nouveau.setHours(nh.h, nh.m, 0, 0); else nouveau.setHours(ancien.getHours(), ancien.getMinutes(), 0, 0);
      const duree = ev.ends_at ? Math.round((new Date(ev.ends_at).getTime() - ancien.getTime()) / 60000) : 60;
      const b: Brouillon = { titre: ev.title, date: ymd(nouveau), heure: ev.all_day && !nh ? '' : hm(nouveau), journee: ev.all_day && !nh, dureeMin: duree, lieu: ev.location ?? '', rappelMin: ev.reminder_minutes };
      await fin(`Je déplace « ${ev.title} » au ${dateLongue(nouveau)}${b.journee ? '' : ` à ${heureFr(nouveau)}`}.`, { action: { type: 'deplacer', ev, b, etat: 'attente' } });
      return;
    }

    if (/^(lis|lire|lecture|lance la lecture)/.test(norm(q))) {
      setMsgs((m) => m.map((x) => (x.id === idR ? { ...x, texte: 'Je lance la lecture du journal.', enCours: false } : x)));
      setEtat('repos');
      occupeRef.current = false;
      lireJournal();
      return;
    }

    let rep: Partial<Msg> & { naviguer?: string | null } = {};
    try {
      const res = await fetch('/api/journal/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
      const j = await res.json();
      if (j.ok) rep = { texte: j.reponse, carte: j.carte ?? undefined, liens: j.liens ?? [], suivantes: j.suivantes ?? [], naviguer: j.naviguer };
    } catch { /* hors ligne */ }
    if (!rep.texte) rep = { texte: repondreLocal(q) };

    setMsgs((m) => m.map((x) => (x.id === idR ? { ...x, ...rep, enCours: false, heure: maintenant() } as Msg : x)));
    if (rep.carte) setFiche(rep.carte);
    await parler(idR, rep.texte!);
    occupeRef.current = false;
    if (rep.naviguer) router.push(rep.naviguer);
  }, [onCentre, lireJournal, repondreLocal, parler, router, executer]);

  executerRef.current = async (id: number) => {
    const msg = msgsRef.current.find((x) => x.id === id);
    const a = msg?.action;
    if (!a || a.etat !== 'attente') return;
    attenteRef.current = null;
    const maj = (patch: Partial<Action>) => setMsgs((m) => m.map((x) => (x.id === id && x.action ? { ...x, action: { ...x.action, ...patch } as Action } : x)));
    try {
      let res: Response;
      if (a.type === 'annuler') {
        res = await fetch('/api/calendrier', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.ev.id }) });
      } else {
        const debut = versDate(a.b);
        const corps: Record<string, unknown> = {
          title: a.b.titre.trim() || 'Rendez-vous', location: a.b.lieu.trim() || null, starts_at: debut.toISOString(),
          ends_at: a.b.journee ? null : new Date(debut.getTime() + (a.b.dureeMin || 60) * 60000).toISOString(),
          all_day: a.b.journee, reminder_minutes: a.b.rappelMin,
        };
        if (a.type === 'deplacer') corps.id = a.ev.id;
        res = await fetch('/api/calendrier', { method: a.type === 'creer' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) throw new Error(j.error || 'Le calendrier a refusé la demande.');
      maj({ etat: 'fait' });
      window.dispatchEvent(new Event('sege-agenda-maj'));
      rechargerRappels();
      const txt = a.type === 'creer' ? `C’est noté dans votre calendrier : ${phraseB(a.b)}.` : a.type === 'deplacer' ? `C’est fait : ${phraseB(a.b)}.` : `Le rendez-vous « ${a.ev.title} » est annulé.`;
      const idOk = idRef.current++;
      setMsgs((m) => [...m, { id: idOk, de: 'sege', texte: txt, heure: maintenant() }]);
      await parler(idOk, txt);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Erreur du calendrier.';
      maj({ etat: 'erreur', erreur: err });
      await parler(id, `Je n’ai pas pu enregistrer : ${err}`);
    }
  };
  const majBrouillon = (id: number, patch: Partial<Brouillon>) => setMsgs((m) => m.map((x) => (x.id === id && x.action && x.action.type !== 'annuler' ? { ...x, action: { ...x.action, b: { ...x.action.b, ...patch } } as Action } : x)));
  const abandonner = (id: number) => { if (attenteRef.current === id) attenteRef.current = null; setMsgs((m) => m.map((x) => (x.id === id && x.action ? { ...x, action: { ...x.action, etat: 'abandon' } as Action } : x))); };

  /* ---- Rappels : Sege signale les rendez-vous qui approchent ---- */
  const evsRef = useRef<Ev[]>([]);
  const rechargerRappels = useCallback(async () => {
    const j0 = new Date(); j0.setHours(0, 0, 0, 0);
    const d = await chargerAgenda(j0, new Date(j0.getTime() + 3 * 86400000));
    if (d) evsRef.current = d.events;
  }, []);
  const annoncer = useCallback(async (texte: string) => {
    const id = idRef.current++;
    setMsgs((m) => [...m, { id, de: 'sege', texte, heure: maintenant(), rappel: true }]);
    if (fermerBulleRef.current) clearTimeout(fermerBulleRef.current);
    setDepuis(id); setBulle(true);
    occupeRef.current = true;
    arreterSessionRef.current();
    await parler(id, texte);
    occupeRef.current = false;
    if (fermerBulleRef.current) clearTimeout(fermerBulleRef.current);
    fermerBulleRef.current = setTimeout(() => setBulle(false), 20000);
  }, [parler]);
  useEffect(() => {
    let actif = true;
    const deja = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem('sege-annonces') || '{}'); } catch { return {}; } };
    const noter = (k: string) => { try { const o = deja(); o[k] = Date.now(); Object.keys(o).forEach((x) => { if (Date.now() - o[x] > 3 * 86400000) delete o[x]; }); localStorage.setItem('sege-annonces', JSON.stringify(o)); } catch {} };
    const verifier = async () => {
      if (!actif || occupeRef.current) return;
      const maintenantMs = Date.now();
      const aujourdhui = ymd(new Date());
      const vus = deja();
      // Point du matin : une fois par jour, à la première ouverture après 6 h
      if (new Date().getHours() >= 6 && !vus[`matin:${aujourdhui}`]) {
        const jour = evsRef.current.filter((e) => ymd(new Date(e.starts_at)) === aujourdhui && (e.all_day || new Date(e.starts_at).getTime() > maintenantMs));
        noter(`matin:${aujourdhui}`);
        if (jour.length) {
          await annoncer(`${new Date().getHours() < 12 ? 'Bonjour' : 'Bonjour à nouveau'} Monsieur le Directeur. Aujourd’hui, vous avez ${jour.length} rendez-vous : ${jour.map((e) => `${e.all_day ? 'toute la journée' : heureFr(new Date(e.starts_at))}, ${e.title}`).join(' ; ')}.`);
          return;
        }
      }
      for (const e of evsRef.current) {
        const debut = new Date(e.starts_at).getTime();
        const delai = (e.reminder_minutes ?? 30) * 60000;
        const cle = `rdv:${e.id}:${e.starts_at}`;
        if (vus[cle]) continue;
        if (e.reminder_minutes === null) continue; // « sans rappel »
        if (maintenantMs >= debut - delai && maintenantMs < debut + 5 * 60000) {
          noter(cle);
          const min = Math.round((debut - maintenantMs) / 60000);
          const quand = e.all_day ? (ymd(new Date(e.starts_at)) === aujourdhui ? 'aujourd’hui' : `le ${dateLongue(new Date(e.starts_at))}`)
            : min <= 1 ? 'maintenant' : min < 60 ? `dans ${min} minutes` : min < 1440 ? `à ${heureFr(new Date(e.starts_at))}${ymd(new Date(e.starts_at)) === aujourdhui ? '' : ` le ${dateLongue(new Date(e.starts_at))}`}` : `demain à ${heureFr(new Date(e.starts_at))}`;
          await annoncer(`Monsieur le Directeur, rappel : ${e.title} ${e.all_day ? `, ${quand}` : `commence ${quand}`}${e.location ? `, ${e.location}` : ''}.`);
          return;
        }
      }
    };
    rechargerRappels().then(verifier);
    const t1 = setInterval(() => { rechargerRappels(); }, 5 * 60000);
    const t2 = setInterval(verifier, 30000);
    const maj = () => { rechargerRappels(); };
    window.addEventListener('sege-agenda-maj', maj);
    return () => { actif = false; clearInterval(t1); clearInterval(t2); window.removeEventListener('sege-agenda-maj', maj); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Mot d'appel : « Sege » (et ce que la reconnaissance vocale entend à sa place) */
  const MOT_APPEL = /\b(sege|segue|seje|serge|sergey|cege|segay|sejay|ceje|segee|sega|siege)\b[\s,.!?:;-]*/;

  const ecouterQuestion = useCallback(() => new Promise<string>((resolve) => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return resolve('');
    const r = new SR();
    r.lang = 'fr-FR'; r.interimResults = true; r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setEntendu(t);
      if (e.results[e.results.length - 1].isFinal) final = t;
    };
    r.onend = () => resolve(final.trim());
    r.onerror = () => resolve('');
    setEtat('ecoute');
    r.start();
  }), []);

  const programmerFermeture = useCallback(() => {
    if (fermerBulleRef.current) clearTimeout(fermerBulleRef.current);
    fermerBulleRef.current = setTimeout(() => setBulle(false), 12000);
  }, []);

  const reveil = useCallback(async (reste: string) => {
    occupeRef.current = true;
    if (fermerBulleRef.current) clearTimeout(fermerBulleRef.current);
    setBulle(true);
    setDepuis(idRef.current);
    setEntendu(reste);
    let question = reste.replace(/^[\s,.!?:;-]+/, '').trim();
    if (question.length < 3) {
      setEtat('parole');
      if (voixOk && sonActif) await dire('Oui, Monsieur le Directeur ?');
      question = await ecouterQuestion();
    }
    if (question.length >= 2) { setEntendu(question); await poser(question); }
    else { setEtat('repos'); setEntendu(''); }
    occupeRef.current = false;
    programmerFermeture();
  }, [voixOk, sonActif, dire, ecouterQuestion, poser, programmerFermeture]);

  /* ── Écoute du mot d'appel ─────────────────────────────────────────
     Une seule session de reconnaissance à la fois. Elle n'est relancée
     que par son propre « onend », jamais pendant que Sege parle ou
     répond, et avec un délai croissant si le navigateur la coupe vite
     (silence, réseau…). Le micro reste ouvert en continu pendant la
     veille, si bien que l'indicateur du navigateur ne clignote plus. */
  const veilleActiveRef = useRef(false);        // une session tourne
  const relanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const echecsRef = useRef(0);
  const fluxRef = useRef<MediaStream | null>(null);
  const pauseRef = useRef(false);               // Sege parle / répond

  const annulerRelance = () => { if (relanceRef.current) { clearTimeout(relanceRef.current); relanceRef.current = null; } };
  const arreterSession = useCallback(() => {
    annulerRelance();
    const r = recoVeilleRef.current;
    if (r) { r.__arret = true; try { r.abort(); } catch {} }
    recoVeilleRef.current = null;
    veilleActiveRef.current = false;
  }, []);
  arreterSessionRef.current = arreterSession;
  const ouvrirMicro = useCallback(async () => {
    if (fluxRef.current || !navigator.mediaDevices?.getUserMedia) return true;
    try { fluxRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); return true; }
    catch (e: any) { return !(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'); }
  }, []);
  const fermerMicro = useCallback(() => { fluxRef.current?.getTracks().forEach((t) => t.stop()); fluxRef.current = null; }, []);

  const peutEcouter = () => veilleRef.current && !occupeRef.current && !pauseRef.current;

  const demarrerVeilleRef = useRef<() => void>(() => {});
  const planifierRelance = (ms: number) => {
    annulerRelance();
    relanceRef.current = setTimeout(() => { relanceRef.current = null; demarrerVeilleRef.current(); }, ms);
  };

  const demarrerVeille = useCallback(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR || !peutEcouter() || veilleActiveRef.current) return;   // déjà à l'écoute : on ne recrée rien
    annulerRelance();
    const r: any = new SR();
    r.lang = 'fr-FR'; r.continuous = true; r.interimResults = false; r.maxAlternatives = 3;
    const debut = Date.now();
    let erreur = '';
    r.onresult = (e: any) => {
      if (occupeRef.current || pauseRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        for (let a = 0; a < e.results[i].length; a++) {
          const brut = String(e.results[i][a].transcript || '');
          const m = norm(brut).match(MOT_APPEL);
          if (m && m.index !== undefined) {
            const reste = brut.slice(Math.min(brut.length, m.index + m[0].length));
            occupeRef.current = true;
            arreterSession();
            reveil(reste);
            return;
          }
        }
      }
    };
    r.onerror = (ev: any) => {
      erreur = ev?.error || 'inconnue';
      if (erreur === 'not-allowed' || erreur === 'service-not-allowed' || erreur === 'audio-capture') {
        veilleRef.current = false; setVeille(false); fermerMicro();
        try { localStorage.setItem('sege-veille', '0'); } catch {}
      }
    };
    r.onend = () => {
      if (recoVeilleRef.current === r) { recoVeilleRef.current = null; veilleActiveRef.current = false; }
      if (r.__arret || !peutEcouter()) return;           // arrêt voulu : pas de relance
      const duree = Date.now() - debut;
      // Session normale (Chrome coupe après un long silence) : relance douce.
      // Session coupée très vite ou en erreur : délai croissant jusqu'à 15 s.
      if (duree > 4000 && (!erreur || erreur === 'no-speech')) echecsRef.current = 0;
      else echecsRef.current = Math.min(echecsRef.current + 1, 6);
      planifierRelance(echecsRef.current === 0 ? 250 : Math.min(15000, 500 * 2 ** echecsRef.current));
    };
    recoVeilleRef.current = r;
    veilleActiveRef.current = true;
    try { r.start(); } catch { recoVeilleRef.current = null; veilleActiveRef.current = false; echecsRef.current = Math.min(echecsRef.current + 1, 6); planifierRelance(2000); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveil, arreterSession, fermerMicro]);
  demarrerVeilleRef.current = demarrerVeille;

  // Pause pendant que Sege parle, écoute ou réfléchit ; reprise une fois revenue au repos
  const enPause = etatAffichePourVeille(etat, parleExterne);
  useEffect(() => {
    pauseRef.current = enPause;
    if (!veille) return;
    if (enPause) { arreterSession(); return; }
    const t = setTimeout(() => { echecsRef.current = 0; demarrerVeilleRef.current(); }, 700);
    return () => clearTimeout(t);
  }, [veille, enPause, arreterSession]);

  const activerVeille = useCallback(async (v: boolean) => {
    try { localStorage.setItem('sege-veille', v ? '1' : '0'); } catch {}
    if (!v) { veilleRef.current = false; setVeille(false); arreterSession(); fermerMicro(); return; }
    const ok = await ouvrirMicro();
    if (!ok) { veilleRef.current = false; setVeille(false); try { localStorage.setItem('sege-veille', '0'); } catch {} return; }
    veilleRef.current = true; echecsRef.current = 0; setVeille(true);
  }, [arreterSession, fermerMicro, ouvrirMicro]);
  const basculerVeille = () => { activerVeille(!veille); };
  useEffect(() => {
    let v = false;
    try { v = localStorage.getItem('sege-veille') === '1'; } catch {}
    if (v && micOk) activerVeille(true);
    return () => { veilleRef.current = false; arreterSession(); fermerMicro(); if (fermerBulleRef.current) clearTimeout(fermerBulleRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!bulle) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setBulle(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [bulle]);

  const ecouter = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    if (etat === 'ecoute') { recoRef.current?.stop(); return; }
    taire();
    pauseRef.current = true; arreterSession();
    const r = new SR();
    r.lang = 'fr-FR'; r.interimResults = true; r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setSaisie(t);
      if (e.results[e.results.length - 1].isFinal) final = t;
    };
    r.onend = () => { setEtat((x) => (x === 'ecoute' ? 'repos' : x)); if (final) { poser(final); setSaisie(''); } };
    r.onerror = () => setEtat('repos');
    recoRef.current = r;
    setEtat('ecoute');
    r.start();
  };

  const envoyer = () => { const t = saisie; setSaisie(''); poser(t); zoneRef.current?.focus(); };
  const copier = async (m: Msg) => { try { await navigator.clipboard.writeText(m.texte); setCopie(m.id); setTimeout(() => setCopie(null), 1500); } catch {} };
  const nouvelle = () => { taire(); setMsgs([]); setFiche(null); };

  const libelleEtat = { repos: 'En ligne · lit tout le dashboard', ecoute: 'Je vous écoute…', reflexion: 'Je consulte le dashboard…', parole: 'Sege parle…' }[etatAffiche];
  const derniere = [...msgs].reverse().find((m) => m.de === 'sege' && !m.enCours);

  return (
    <section className={`sg sg-${etatAffiche}`}>
      <style>{CSS}</style>
      <FicheBulle carte={fiche} onClose={() => setFiche(null)} />

      {/* Bulle de l'agent : s'ouvre quand le DG dit « Sege » */}
      {bulle && (() => {
        const rep = [...msgs].reverse().find((m) => m.de === 'sege' && m.id >= depuis);
        const qst = [...msgs].reverse().find((m) => m.de === 'dg' && m.id >= depuis);
        const enAttente = !qst && !rep;
        return (
          <div className={`sg-appel sg-${etatAffiche}`} role="dialog" aria-label="Sege">
            <button className="sg-appel-x" onClick={() => { setBulle(false); taire(); }} aria-label="Fermer"><X size={16} /></button>
            <div className="sg-appel-orbe"><Orbe etat={etatAffiche} taille={92} /></div>
            <div className="sg-appel-etat">{{ repos: 'Sege', ecoute: 'Je vous écoute…', reflexion: 'Je consulte le dashboard…', parole: 'Sege vous répond' }[etatAffiche]}</div>
            {etatAffiche === 'parole' && <Ondes />}
            {enAttente && entendu && <p className="sg-appel-q">« {entendu} »</p>}
            {!enAttente && qst && <p className="sg-appel-q">« {qst.texte} »</p>}
            {!enAttente && rep && !rep.enCours && rep.texte && <p className={`sg-appel-r ${rep.rappel ? 'rappel' : ''}`}>{rep.rappel && <span className="sg-rappel-tag"><BellRing size={12} /> Rappel</span>}{rep.texte}</p>}
            {!enAttente && rep?.action && <CarteAgenda a={rep.action} onChange={(p) => majBrouillon(rep.id, p)} onOk={() => executer(rep.id)} onNon={() => abandonner(rep.id)} />}
            {!enAttente && rep?.enCours && <span className="sg-points"><i /><i /><i /></span>}
            {!enAttente && rep && !rep.enCours && (rep.liens?.length || rep.carte) ? (
              <div className="sg-liens centre">
                {rep.carte && <button className="sg-lien fiche" onClick={() => setFiche(rep.carte!)}><FileText size={13} /> {rep.carte.titre}</button>}
                {rep.liens?.map((l) => <button key={l.href} className="sg-lien" onClick={() => router.push(l.href)}><ExternalLink size={12} /> {l.label}</button>)}
              </div>
            ) : null}
            <small className="sg-appel-aide">Dites « Sege » puis votre question · Échap pour fermer</small>
          </div>
        );
      })()}

      {/* En-tête */}
      <header className="sg-head">
        <Orbe etat={etatAffiche} taille={44} />
        <div className="sg-id">
          <b>Sege</b>
          <span><i className="sg-dot" />{libelleEtat}</span>
        </div>
        {etatAffiche === 'parole' && <Ondes />}
        <div className="sg-actions">
          {voixOk && (etatAffiche === 'parole'
            ? <button className="sg-ico" onClick={taire} title="Arrêter la voix"><Square size={14} /></button>
            : <button className="sg-ico" onClick={() => setSonActif((s) => !s)} title={sonActif ? 'Couper la voix de Sege' : 'Activer la voix de Sege'}>{sonActif ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>)}
          {micOk && (
            <button className={`sg-veille ${veille ? 'on' : ''}`} onClick={basculerVeille} title={veille ? 'Désactiver l’appel « Sege »' : 'Activer : dites « Sege » pour lui parler'}>
              {veille ? <Ear size={14} /> : <EarOff size={14} />}<span>{veille ? 'Dites « Sege »' : 'Appel vocal'}</span>
            </button>
          )}
          {msgs.length > 0 && <button className="sg-ico" onClick={nouvelle} title="Nouvelle conversation"><RotateCcw size={15} /></button>}
          {onFermer && <button className="sg-ico" onClick={onFermer} title="Réduire Sege"><X size={15} /></button>}
        </div>
      </header>

      {/* Conversation */}
      <div className="sg-fil">
        {msgs.length === 0 && (
          <div className="sg-accueil">
            <div className="sg-accueil-orbe"><Orbe etat={etatAffiche} taille={86} /></div>
            <h4>{salut()}, Monsieur le Directeur Général</h4>
            <p>Je suis <b>Sege</b>. Je parcours toutes les pages du dashboard pour vous répondre, je vous ouvre les pages et je vous lis le journal.</p>
            <div className="sg-themes">
              {THEMES.map((t) => (
                <button key={t.titre} className="sg-theme" style={{ ['--tc' as string]: t.c }} onClick={() => poser(t.question)}>
                  <span className="sg-theme-ico">{t.icone}</span>
                  <span><b>{t.titre}</b><small>{t.question}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) => m.de === 'dg' ? (
          <div key={m.id} className="sg-ligne dg">
            <div className="sg-bulle dg">{m.texte}<time>{m.heure}</time></div>
          </div>
        ) : (
          <div key={m.id} className={`sg-ligne sege ${parleId === m.id ? 'parle' : ''}`}>
            <Orbe etat={m.enCours ? 'reflexion' : parleId === m.id ? 'parole' : 'repos'} taille={28} />
            <div className="sg-bloc">
              <div className="sg-nom">Sege {parleId === m.id && <span className="sg-tag-parle"><Ondes petit /> parle</span>}<time>{m.heure}</time></div>
              <div className={`sg-bulle sege ${m.rappel ? 'rappel' : ''}`}>
                {m.rappel && <span className="sg-rappel-tag"><BellRing size={12} /> Rappel</span>}
                {m.enCours ? <span className="sg-points"><i /><i /><i /></span> : m.texte}
              </div>
              {m.action && <CarteAgenda a={m.action} onChange={(p) => majBrouillon(m.id, p)} onOk={() => executer(m.id)} onNon={() => abandonner(m.id)} />}
              {!m.enCours && (
                <>
                  {(m.carte || m.liens?.length) ? (
                    <div className="sg-liens">
                      {m.carte && <button className="sg-lien fiche" onClick={() => setFiche(m.carte!)}><FileText size={13} /> {m.carte.titre}</button>}
                      {m.liens?.map((l) => <button key={l.href} className="sg-lien" onClick={() => router.push(l.href)}><ExternalLink size={12} /> {l.label}</button>)}
                    </div>
                  ) : null}
                  <div className="sg-outils">
                    {voixOk && <button onClick={() => parler(m.id, m.texte)} title="Réécouter"><Volume2 size={13} /></button>}
                    <button onClick={() => copier(m)} title="Copier">{copie === m.id ? <Check size={13} /> : <Copy size={13} />}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {derniere?.suivantes?.length && etatAffiche !== 'reflexion' ? (
          <div className="sg-relances">
            {derniere.suivantes.map((s) => <button key={s} onClick={() => poser(s)}>{s}</button>)}
          </div>
        ) : null}
        <div ref={finRef} />
      </div>

      {/* Saisie */}
      <div className="sg-saisie">
        <div className={`sg-champ ${etat === 'ecoute' ? 'ecoute' : ''}`}>
          {micOk && (
            <button className="sg-mic" onClick={ecouter} title={etat === 'ecoute' ? 'Arrêter l’écoute' : 'Parler à Sege'}>
              {etat === 'ecoute' ? <span className="sg-vu"><i /><i /><i /><i /><i /></span> : <Mic size={17} />}
            </button>
          )}
          <textarea
            ref={zoneRef}
            rows={1}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
            placeholder={etat === 'ecoute' ? 'Je vous écoute…' : 'Demandez à Sege… ex. « ouvre les stocks »'}
          />
          <button className="sg-envoi" onClick={envoyer} disabled={!saisie.trim()} title="Envoyer"><Send size={16} /></button>
        </div>
        <small className="sg-aide">Entrée pour envoyer · Maj + Entrée pour aller à la ligne{micOk ? ' · micro pour parler' : ''}</small>
      </div>
    </section>
  );
}

/* Fiche de confirmation d'un rendez-vous (créer, déplacer, annuler) */
function CarteAgenda({ a, onChange, onOk, onNon }: { a: Action; onChange: (p: Partial<Brouillon>) => void; onOk: () => void; onNon: () => void }) {
  const titre = a.type === 'creer' ? 'Nouveau rendez-vous' : a.type === 'deplacer' ? 'Déplacer le rendez-vous' : 'Annuler le rendez-vous';
  const Icone = a.type === 'annuler' ? CalendarX : a.type === 'deplacer' ? CalendarClock : CalendarCheck;
  const modifiable = a.etat === 'attente' && a.type !== 'annuler';
  return (
    <div className={`sg-agenda ${a.type} ${a.etat}`}>
      <div className="sg-agenda-tete"><Icone size={15} /> <b>{titre}</b>
        {a.etat === 'fait' && <span className="ok">Enregistré</span>}
        {a.etat === 'abandon' && <span className="non">Abandonné</span>}
        {a.etat === 'erreur' && <span className="non">Échec</span>}
      </div>
      {a.type === 'annuler' ? (
        <div className="sg-agenda-resume">{phraseEv(a.ev)}</div>
      ) : (
        <div className="sg-agenda-champs">
          <label className="large"><span>Objet</span><input value={a.b.titre} disabled={!modifiable} onChange={(e) => onChange({ titre: e.target.value })} /></label>
          <label><span>Date</span><input type="date" value={a.b.date} disabled={!modifiable} onChange={(e) => onChange({ date: e.target.value })} /></label>
          <label><span>Heure</span><input type="time" value={a.b.journee ? '' : a.b.heure} disabled={!modifiable || a.b.journee} onChange={(e) => onChange({ heure: e.target.value })} /></label>
          <label className="case"><input type="checkbox" checked={a.b.journee} disabled={!modifiable} onChange={(e) => onChange({ journee: e.target.checked, heure: e.target.checked ? '' : a.b.heure || '09:00' })} /> Toute la journée</label>
          <label className="large"><span>Lieu</span><input value={a.b.lieu} placeholder="Facultatif" disabled={!modifiable} onChange={(e) => onChange({ lieu: e.target.value })} /></label>
          <label className="large"><span>Rappel de Sege</span>
            <select value={a.b.rappelMin === null ? 'null' : String(a.b.rappelMin)} disabled={!modifiable} onChange={(e) => onChange({ rappelMin: e.target.value === 'null' ? null : Number(e.target.value) })}>
              {RAPPELS.concat(RAPPELS.some((r) => r.v === a.b.rappelMin) ? [] : [{ v: a.b.rappelMin, l: `${a.b.rappelMin} min avant` }]).map((r) => <option key={String(r.v)} value={r.v === null ? 'null' : String(r.v)}>{r.l}</option>)}
            </select>
          </label>
        </div>
      )}
      {a.etat === 'erreur' && <div className="sg-agenda-err">{a.erreur}</div>}
      {a.etat === 'attente' && (
        <div className="sg-agenda-actions">
          <button className="oui" onClick={onOk}>{a.type === 'annuler' ? 'Oui, annuler' : 'Confirmer'}</button>
          <button className="non" onClick={onNon}>{a.type === 'annuler' ? 'Garder' : 'Abandonner'}</button>
          <small>ou dites « oui » / « non »</small>
        </div>
      )}
    </div>
  );
}

function etatAffichePourVeille(etat: Etat, parleExterne: boolean) { return etat === 'parole' || etat === 'ecoute' || etat === 'reflexion' || parleExterne; }

/* Orbe de Sege : sphère lumineuse dont l'animation change avec l'état */
export function Orbe({ etat, taille }: { etat: Etat; taille: number }) {
  return (
    <span className={`sg-orbe o-${etat}`} style={{ width: taille, height: taille }} aria-hidden>
      <span className="o-halo" />
      <span className="o-anneau" />
      <span className="o-coeur" />
      <span className="o-reflet" />
    </span>
  );
}

function Ondes({ petit }: { petit?: boolean }) {
  return <span className={`sg-ondes ${petit ? 'petit' : ''}`} aria-hidden>{Array.from({ length: petit ? 4 : 7 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 0.09}s` }} />)}</span>;
}

const CSS = `
.sg { position: relative; display: flex; flex-direction: column; min-height: 520px; border-radius: 18px; overflow: hidden; isolation: isolate;
  background: radial-gradient(120% 70% at 0% 0%, color-mix(in srgb, var(--brand-cyan) 10%, transparent), transparent 55%),
              radial-gradient(90% 60% at 100% 100%, color-mix(in srgb, #8b5cf6 10%, transparent), transparent 60%), var(--bg-card);
  border: 1px solid var(--border-color); }
.sg::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; z-index: -1; opacity: .0; transition: opacity .4s;
  background: conic-gradient(from var(--sg-angle, 0deg), #22d3ee, #6366f1, #a855f7, #22d3ee);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: sg-tour 4s linear infinite; }
.sg-parole::before, .sg-reflexion::before, .sg-ecoute::before { opacity: 1; }
@property --sg-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes sg-tour { to { --sg-angle: 360deg; } }

.sg-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-card) 70%, transparent); backdrop-filter: blur(6px); }
.sg-id { display: flex; flex-direction: column; min-width: 0; }
.sg-id b { font-size: 16px; font-weight: 800; color: var(--text-strong); letter-spacing: -0.01em; }
.sg-id span { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-muted); white-space: nowrap; }
.sg-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-green) 25%, transparent); }
.sg-ecoute .sg-dot { background: var(--accent-red); animation: sg-clig 1s infinite; }
.sg-reflexion .sg-dot { background: var(--accent-amber); animation: sg-clig .8s infinite; }
.sg-parole .sg-dot { background: var(--brand-cyan); animation: sg-clig .6s infinite; }
@keyframes sg-clig { 50% { opacity: .3; } }
.sg-actions { margin-left: auto; display: flex; gap: 6px; }
.sg-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-secondary); cursor: pointer; }
.sg-ico:hover { color: var(--text-strong); border-color: var(--brand-cyan); }

/* Orbe */
.sg-orbe { position: relative; display: inline-block; flex-shrink: 0; border-radius: 50%; }
.sg-orbe > span { position: absolute; inset: 0; border-radius: 50%; }
.o-halo { inset: -18% !important; background: radial-gradient(circle, color-mix(in srgb, #22d3ee 45%, transparent), transparent 65%); filter: blur(4px); opacity: .55; animation: o-respire 3.2s ease-in-out infinite; }
.o-anneau { background: conic-gradient(from 0deg, #22d3ee, #6366f1, #a855f7, #ec4899, #22d3ee); animation: o-tourne 6s linear infinite; }
.o-coeur { inset: 9% !important; background: radial-gradient(circle at 35% 30%, #e0f2fe 0%, #38bdf8 22%, #4f46e5 62%, #1e1b4b 100%); box-shadow: inset 0 -4px 10px rgba(0,0,0,.35); animation: o-respire 3.2s ease-in-out infinite; }
.o-reflet { inset: 16% 40% 52% 22% !important; background: rgba(255,255,255,.55); filter: blur(2px); }
@keyframes o-tourne { to { transform: rotate(360deg); } }
@keyframes o-respire { 50% { transform: scale(1.06); } }
.o-ecoute .o-anneau { background: conic-gradient(from 0deg, #f43f5e, #fb7185, #f97316, #f43f5e); animation-duration: 2.2s; }
.o-ecoute .o-halo { background: radial-gradient(circle, rgba(244,63,94,.55), transparent 65%); animation: o-pulse 1s ease-in-out infinite; }
.o-reflexion .o-anneau { animation-duration: 1.1s; }
.o-reflexion .o-coeur { animation: o-respire 1s ease-in-out infinite; }
.o-parole .o-anneau { animation-duration: 1.6s; }
.o-parole .o-halo { opacity: .95; animation: o-pulse .55s ease-in-out infinite alternate; }
.o-parole .o-coeur { animation: o-voix .32s ease-in-out infinite alternate; }
@keyframes o-pulse { from { transform: scale(.95); opacity: .6; } to { transform: scale(1.18); opacity: 1; } }
@keyframes o-voix { from { transform: scale(.94); } to { transform: scale(1.08); } }

/* Ondes de voix */
.sg-ondes { display: inline-flex; align-items: center; gap: 3px; height: 26px; margin-left: 4px; }
.sg-ondes i { width: 3px; height: 100%; border-radius: 3px; background: linear-gradient(180deg, #22d3ee, #6366f1); animation: sg-onde .9s ease-in-out infinite; transform-origin: center; }
.sg-ondes.petit { height: 12px; gap: 2px; margin: 0 2px 0 0; }
.sg-ondes.petit i { width: 2px; }
@keyframes sg-onde { 0%, 100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }

/* Fil */
.sg-fil { flex: 1; min-height: 260px; max-height: 560px; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth; }
.sg-accueil { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 8px 4px; animation: sg-in .5s ease; }
.sg-accueil-orbe { margin: 6px 0 6px; }
.sg-accueil h4 { margin: 0; font-size: 18px; font-weight: 800; color: var(--text-strong); }
.sg-accueil p { margin: 0 0 6px; font-size: 13px; color: var(--text-muted); line-height: 1.5; max-width: 460px; }
.sg-themes { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
.sg-theme { display: flex; align-items: center; gap: 10px; padding: 10px 11px; border-radius: 12px; text-align: left; cursor: pointer; color: inherit; font: inherit;
  border: 1px solid var(--border-color); background: color-mix(in srgb, var(--bg-inner) 80%, transparent); transition: transform .15s, border-color .15s, background .15s; }
.sg-theme:hover { transform: translateY(-2px); border-color: var(--tc); background: color-mix(in srgb, var(--tc) 10%, var(--bg-inner)); }
.sg-theme-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; color: var(--tc); background: color-mix(in srgb, var(--tc) 16%, transparent); }
.sg-theme b { display: block; font-size: 12.5px; color: var(--text-strong); }
.sg-theme small { display: block; font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.sg-ligne { display: flex; gap: 10px; animation: sg-in .3s ease; }
@keyframes sg-in { from { opacity: 0; transform: translateY(6px); } }
.sg-ligne.dg { justify-content: flex-end; }
.sg-bloc { display: flex; flex-direction: column; gap: 6px; min-width: 0; max-width: 88%; }
.sg-nom { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; color: var(--text-primary); }
.sg-nom time, .sg-bulle time { font-size: 10.5px; font-weight: 500; color: var(--text-dim); }
.sg-bulle time { display: block; text-align: right; margin-top: 4px; color: rgba(255,255,255,.7); }
.sg-tag-parle { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: var(--brand-cyan); }
.sg-bulle { padding: 10px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
.sg-bulle.dg { max-width: 82%; color: #fff; background: linear-gradient(135deg, #2563eb, #4f46e5); border-bottom-right-radius: 4px; box-shadow: 0 6px 18px rgba(37, 99, 235, .25); }
.sg-bulle.sege { color: var(--text-primary); background: color-mix(in srgb, var(--bg-inner) 85%, transparent); border: 1px solid var(--border-subtle); border-top-left-radius: 4px; transition: border-color .3s, box-shadow .3s; }
.sg-ligne.parle .sg-bulle.sege { border-color: color-mix(in srgb, var(--brand-cyan) 60%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-cyan) 12%, transparent); }
.sg-points { display: inline-flex; gap: 4px; padding: 4px 2px; }
.sg-points i { width: 7px; height: 7px; border-radius: 50%; background: var(--brand-cyan); animation: sg-saut 1.1s infinite ease-in-out; }
.sg-points i:nth-child(2) { animation-delay: .15s; } .sg-points i:nth-child(3) { animation-delay: .3s; }
@keyframes sg-saut { 0%, 80%, 100% { transform: translateY(0); opacity: .4; } 40% { transform: translateY(-5px); opacity: 1; } }
.sg-liens { display: flex; flex-wrap: wrap; gap: 6px; }
.sg-lien { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); }
.sg-lien:hover { border-color: var(--brand-cyan); color: var(--text-strong); }
.sg-lien.fiche { border-color: color-mix(in srgb, var(--brand-cyan) 50%, transparent); color: var(--brand-cyan); background: color-mix(in srgb, var(--brand-cyan) 10%, transparent); }
.sg-outils { display: flex; gap: 4px; opacity: .55; transition: opacity .2s; }
.sg-ligne:hover .sg-outils { opacity: 1; }
.sg-outils button { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
.sg-outils button:hover { background: var(--bg-card-hover); color: var(--text-strong); }
.sg-relances { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 38px; animation: sg-in .3s ease; }
.sg-relances button { font-size: 12px; padding: 6px 11px; border-radius: 999px; cursor: pointer; border: 1px dashed color-mix(in srgb, var(--brand-cyan) 45%, var(--border-color)); background: transparent; color: var(--text-secondary); }
.sg-relances button:hover { border-style: solid; color: var(--text-strong); background: color-mix(in srgb, var(--brand-cyan) 8%, transparent); }

/* Saisie */
.sg-saisie { padding: 12px 14px 12px; border-top: 1px solid var(--border-subtle); }
.sg-champ { display: flex; align-items: flex-end; gap: 8px; padding: 6px; border-radius: 16px; border: 1px solid var(--border-color); background: var(--bg-inner); transition: border-color .2s, box-shadow .2s; }
.sg-champ:focus-within { border-color: var(--brand-cyan); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-cyan) 15%, transparent); }
.sg-champ.ecoute { border-color: var(--accent-red); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-red) 15%, transparent); }
.sg-champ textarea { flex: 1; min-width: 0; resize: none; max-height: 120px; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 13.5px; line-height: 1.45; padding: 9px 4px; }
.sg-mic, .sg-envoi { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; cursor: pointer; border: 0; }
.sg-mic { background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-primary); }
.sg-mic:hover { background: color-mix(in srgb, var(--brand-cyan) 18%, transparent); }
.sg-ecoute .sg-mic { background: var(--accent-red); color: #fff; }
.sg-vu { display: inline-flex; align-items: center; gap: 2px; height: 18px; }
.sg-vu i { width: 3px; height: 100%; border-radius: 2px; background: #fff; animation: sg-onde .7s ease-in-out infinite; }
.sg-vu i:nth-child(2) { animation-delay: .1s; } .sg-vu i:nth-child(3) { animation-delay: .2s; } .sg-vu i:nth-child(4) { animation-delay: .3s; } .sg-vu i:nth-child(5) { animation-delay: .4s; }
.sg-envoi { background: linear-gradient(135deg, #06b6d4, #4f46e5); color: #fff; box-shadow: 0 6px 16px rgba(79, 70, 229, .3); }
.sg-envoi:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }
.sg-aide { display: block; margin-top: 6px; text-align: center; font-size: 10.5px; color: var(--text-dim); }
/* Mode « Sege » */
.sg-veille { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border-radius: 9px; font-size: 11.5px; font-weight: 700; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-muted); }
.sg-veille:hover { color: var(--text-strong); border-color: var(--brand-cyan); }
.sg-veille.on { color: #fff; border-color: transparent; background: linear-gradient(135deg, #06b6d4, #6366f1); box-shadow: 0 0 0 3px color-mix(in srgb, #22d3ee 20%, transparent); }
.sg-veille.on svg { animation: sg-souffle 2.4s ease-in-out infinite; }
@keyframes sg-souffle { 50% { transform: scale(1.12); } }
@media (max-width: 560px) { .sg-veille span { display: none; } }
.sg-appel { position: fixed; z-index: 1100; right: 28px; bottom: 76px; width: min(420px, calc(100vw - 32px)); max-height: 70vh; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 26px 22px 16px; text-align: center; border-radius: 26px; isolation: isolate;
  background: radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, #22d3ee 16%, transparent), transparent 60%), color-mix(in srgb, var(--bg-card) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand-cyan) 40%, var(--border-color)); backdrop-filter: blur(10px);
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px color-mix(in srgb, #22d3ee 15%, transparent); animation: sg-pop .35s cubic-bezier(.2,.9,.3,1.25); }
@keyframes sg-pop { from { opacity: 0; transform: translateY(20px) scale(.92); } }
.sg-appel-x { position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-muted); cursor: pointer; }
.sg-appel-x:hover { color: var(--text-strong); }
.sg-appel-orbe { margin: 4px 0 2px; }
.sg-appel-etat { font-size: 15px; font-weight: 800; color: var(--text-strong); }
.sg-appel-q { margin: 0; font-size: 13px; color: var(--brand-cyan); font-style: italic; }
.sg-appel-r { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-primary); text-align: left; padding: 12px 14px; border-radius: 14px; background: var(--bg-inner); border: 1px solid var(--border-subtle); width: 100%; }
.sg-appel .sg-ondes { height: 30px; }
.sg-liens.centre { justify-content: center; }
.sg-appel-aide { font-size: 10.5px; color: var(--text-dim); margin-top: 2px; }
/* Agenda */
.sg-rappel-tag { display: inline-flex; align-items: center; gap: 4px; margin-right: 6px; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 800; color: #fbbf24; background: rgba(251,191,36,.12); border: 1px solid rgba(251,191,36,.35); vertical-align: 1px; }
.sg-bulle.sege.rappel, .sg-appel-r.rappel { border-color: rgba(251,191,36,.45); box-shadow: 0 0 0 3px rgba(251,191,36,.08); }
.sg-agenda { width: 100%; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--brand-cyan) 35%, var(--border-color)); background: color-mix(in srgb, var(--bg-card) 90%, transparent); overflow: hidden; text-align: left; animation: sg-in .3s ease; }
.sg-agenda.annuler { border-color: rgba(239,68,68,.4); }
.sg-agenda.fait { border-color: rgba(16,185,129,.5); }
.sg-agenda.abandon { opacity: .6; }
.sg-agenda-tete { display: flex; align-items: center; gap: 7px; padding: 9px 12px; font-size: 12.5px; color: var(--brand-cyan); border-bottom: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--brand-cyan) 7%, transparent); }
.sg-agenda.annuler .sg-agenda-tete { color: #f87171; background: rgba(239,68,68,.07); }
.sg-agenda-tete b { color: var(--text-strong); }
.sg-agenda-tete .ok, .sg-agenda-tete .non { margin-left: auto; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
.sg-agenda-tete .ok { color: #10b981; background: rgba(16,185,129,.12); }
.sg-agenda-tete .non { color: var(--text-muted); background: var(--bg-inner); }
.sg-agenda-resume { padding: 10px 12px; font-size: 13px; color: var(--text-primary); }
.sg-agenda-champs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 12px; }
.sg-agenda-champs label { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sg-agenda-champs label.large { grid-column: 1 / -1; }
.sg-agenda-champs label.case { grid-column: 1 / -1; flex-direction: row; align-items: center; gap: 7px; font-size: 12px; color: var(--text-secondary); }
.sg-agenda-champs span { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); }
.sg-agenda-champs input:not([type=checkbox]), .sg-agenda-champs select { width: 100%; min-width: 0; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-primary); font: inherit; font-size: 12.5px; color-scheme: dark; }
.sg-agenda-champs input:focus, .sg-agenda-champs select:focus { outline: none; border-color: var(--brand-cyan); }
.sg-agenda-champs input:disabled, .sg-agenda-champs select:disabled { opacity: .75; }
.sg-agenda-err { padding: 0 12px 10px; font-size: 12px; color: #f87171; }
.sg-agenda-actions { display: flex; align-items: center; gap: 8px; padding: 0 12px 12px; flex-wrap: wrap; }
.sg-agenda-actions button { padding: 7px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 700; cursor: pointer; border: 1px solid var(--border-color); }
.sg-agenda-actions .oui { border: 0; color: #fff; background: linear-gradient(135deg, #06b6d4, #4f46e5); }
.sg-agenda.annuler .sg-agenda-actions .oui { background: linear-gradient(135deg, #ef4444, #b91c1c); }
.sg-agenda-actions .non { background: transparent; color: var(--text-secondary); }
.sg-agenda-actions small { font-size: 11px; color: var(--text-dim); }
@media (prefers-reduced-motion: reduce) { .sg *, .sg::before { animation: none !important; } }
`;
