'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, MapPin, Bell } from 'lucide-react';
import { holidaysForYear } from '@/lib/guinea-holidays';

type Ev = {
  id: number; title: string; notes: string | null; location: string | null;
  starts_at: string; ends_at: string | null; all_day: boolean; reminder_minutes: number | null;
};
type Auto = { id: string; date: string; kind: 'centre' | 'rapport' | 'fin_mois'; title: string; detail?: string; href?: string };
type Form = { id?: number; title: string; date: string; allDay: boolean; start: string; end: string; location: string; notes: string; reminder: string };

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const REMINDERS = [
  { v: '', l: 'Aucun rappel' }, { v: '0', l: 'À l’heure de l’événement' }, { v: '15', l: '15 minutes avant' },
  { v: '60', l: '1 heure avant' }, { v: '1440', l: 'La veille' },
];
const COL = { ev: '#38bdf8', centre: '#ef4444', ferie: '#10b981', fin: '#94a3b8' };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDate = (s: string) => iso(new Date(s));
const hm = (s: string) => new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const hmInput = (s: string) => `${pad(new Date(s).getHours())}:${pad(new Date(s).getMinutes())}`;

const field = {
  width: '100%', background: 'var(--bg-input, rgba(148,163,184,0.08))', color: 'var(--text-main)',
  border: '1px solid var(--border-color)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5,
} as const;
const smallBtn = {
  background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)',
  borderRadius: 7, padding: '4px 8px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
} as const;

export function CalendarPopover({ time, dateStr }: { time: string; dateStr: string }) {
  const now = new Date();
  const todayIso = iso(now);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(todayIso);
  const [events, setEvents] = useState<Ev[]>([]);
  const [auto, setAuto] = useState<Auto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem('seg_cal_intro_v1')) setIntro(true);
    } catch { setIntro(true); }
  }, []);

  const dismissIntro = useCallback(() => {
    setIntro(false);
    try { window.localStorage.setItem('seg_cal_intro_v1', '1'); } catch { /* stockage indisponible */ }
  }, []);

  const load = useCallback(async () => {
    const from = new Date(view.y, view.m, 1 - 7);
    const to = new Date(view.y, view.m + 1, 14);
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/calendrier?from=${iso(from)}&to=${iso(to)}`, { cache: 'no-store', credentials: 'include' });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Chargement impossible (HTTP ${res.status}).`);
      setEvents(j.events ?? []);
      setAuto(j.auto ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [view.y, view.m]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setForm(null); setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const holidays = useMemo(() => {
    const years = new Set([view.y]);
    if (view.m === 0) years.add(view.y - 1);
    if (view.m >= 10) years.add(view.y + 1);
    return Array.from(years).flatMap((y) => holidaysForYear(y));
  }, [view.y, view.m]);

  const cells = useMemo(() => {
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(view.y, view.m, 1 - lead + i));
  }, [view.y, view.m]);

  const dayInfo = useMemo(() => {
    const m = new Map<string, { ev: number; centre: boolean; ferie: boolean; fin: boolean }>();
    const get = (k: string) => {
      let v = m.get(k);
      if (!v) { v = { ev: 0, centre: false, ferie: false, fin: false }; m.set(k, v); }
      return v;
    };
    events.forEach((e) => { get(localDate(e.starts_at)).ev++; });
    auto.forEach((a) => { const v = get(a.date); if (a.kind === 'fin_mois') v.fin = true; else v.centre = true; });
    holidays.forEach((h) => { get(h.date).ferie = true; });
    return m;
  }, [events, auto, holidays]);

  const dayEvents = events.filter((e) => localDate(e.starts_at) === selected).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const dayAuto = auto.filter((a) => a.date === selected);
  const dayHolidays = holidays.filter((h) => h.date === selected);
  const todayCount = events.filter((e) => localDate(e.starts_at) === todayIso).length;
  const selDate = new Date(`${selected}T12:00:00`);
  const selLabel = selDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const goto = (y: number, m: number) => { const d = new Date(y, m, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };
  const goToday = () => { setView({ y: now.getFullYear(), m: now.getMonth() }); setSelected(todayIso); };

  const openNew = () => {
    setFormError('');
    setForm({ title: '', date: selected, allDay: false, start: '09:00', end: '10:00', location: '', notes: '', reminder: '60' });
  };
  const openEdit = (e: Ev) => {
    setFormError('');
    setForm({
      id: e.id, title: e.title, date: localDate(e.starts_at), allDay: e.all_day,
      start: e.all_day ? '09:00' : hmInput(e.starts_at), end: e.ends_at && !e.all_day ? hmInput(e.ends_at) : '',
      location: e.location ?? '', notes: e.notes ?? '', reminder: e.reminder_minutes === null ? '' : String(e.reminder_minutes),
    });
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) { setFormError('Le titre est obligatoire.'); return; }
    const startsAt = new Date(form.allDay ? `${form.date}T00:00:00` : `${form.date}T${form.start || '09:00'}:00`);
    const endsAt = form.allDay || !form.end ? null : new Date(`${form.date}T${form.end}:00`);
    if (Number.isNaN(startsAt.getTime())) { setFormError('Date ou heure invalide.'); return; }
    if (endsAt && endsAt < startsAt) { setFormError('L’heure de fin précède le début.'); return; }
    const body = {
      title: form.title.trim(), notes: form.notes.trim() || null, location: form.location.trim() || null,
      starts_at: startsAt.toISOString(), ends_at: endsAt ? endsAt.toISOString() : null, all_day: form.allDay,
      reminder_minutes: form.reminder === '' ? null : Number(form.reminder),
    };
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/calendrier', {
        method: form.id ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.id ? { id: form.id, ...body } : body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Enregistrement impossible.');
      const d = new Date(`${form.date}T12:00:00`);
      setSelected(form.date);
      setForm(null);
      if (d.getFullYear() !== view.y || d.getMonth() !== view.m) goto(d.getFullYear(), d.getMonth());
      else await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Ev) => {
    if (!window.confirm(`Supprimer « ${e.title} » ?`)) return;
    try {
      const res = await fetch('/api/calendrier', {
        method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Suppression impossible.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const dot = (c: string) => <span style={{ width: 5, height: 5, borderRadius: 3, background: c, display: 'inline-block' }} />;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={`dg-clock${open ? ' is-open' : ''}${intro ? ' is-intro' : ''}`}
        onClick={() => { dismissIntro(); setOpen((o) => !o); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${dateStr}, ${time}. Ouvrir le calendrier`}
        title="Ouvrir le calendrier"
      >
        <span className="dg-clock-leaf" aria-hidden="true">
          <span className="dg-clock-leaf-month">{now.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span>
          <span className="dg-clock-leaf-day">{now.getDate()}</span>
        </span>
        <span className="dg-clock-text">
          <span className="dg-clock-time">
            {time.slice(0, 5)}
            <span className="dg-clock-sec">:{time.slice(6, 8)}</span>
            <span className="dg-clock-live" aria-hidden="true" />
          </span>
          <span className="dg-clock-date">
            <span className="dg-clock-date-full">
              {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {todayCount > 0 && <span className="dg-clock-chip">{todayCount} rdv</span>}
            <ChevronDown size={12} className="dg-clock-caret" />
          </span>
        </span>
      </button>

      {intro && !open && (
        <div className="dg-clock-intro" role="status" onClick={dismissIntro}>
          <span className="dg-clock-intro-arrow" aria-hidden="true" />
          <div className="dg-clock-intro-badge">Nouveau</div>
          <div className="dg-clock-intro-title">Votre calendrier est disponible</div>
          <div className="dg-clock-intro-text">
            Cliquez sur l’heure ou la date pour l’ouvrir : mois, jours fériés de Guinée,
            échéances automatiques des centres et votre agenda.
          </div>
          <div className="dg-clock-intro-text">
            Ajoutez un rendez-vous avec un rappel : vous serez prévenu dans la cloche
            et par notification sur votre appareil.
          </div>
          <button type="button" className="dg-clock-intro-btn" onClick={dismissIntro}>J’ai compris</button>
        </div>
      )}

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setForm(null); setOpen(false); }} />
          <div
            role="dialog"
            aria-label="Calendrier du DG"
            style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 45, width: 'min(400px, 92vw)',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12,
              boxShadow: '0 16px 40px rgba(0,0,0,0.55)', padding: 14, textAlign: 'left', color: 'var(--text-main)',
              maxHeight: '82vh', overflowY: 'auto',
            }}
          >
            {/* Navigation du mois */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <button type="button" style={smallBtn} onClick={() => goto(view.y, view.m - 1)} aria-label="Mois précédent"><ChevronLeft size={14} /></button>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{MONTHS[view.m]} {view.y}</div>
              <button type="button" style={smallBtn} onClick={() => goto(view.y, view.m + 1)} aria-label="Mois suivant"><ChevronRight size={14} /></button>
              <button type="button" style={smallBtn} onClick={goToday}>Aujourd’hui</button>
            </div>

            {/* Grille */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
              {DOW.map((d, i) => <div key={i} style={{ fontSize: 10.5, color: 'var(--text-dim)', padding: '2px 0' }}>{d}</div>)}
              {cells.map((d) => {
                const k = iso(d);
                const info = dayInfo.get(k);
                const inMonth = d.getMonth() === view.m;
                const isToday = k === todayIso;
                const isSel = k === selected;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setSelected(k); setForm(null); }}
                    style={{
                      background: isSel ? '#0284c7' : 'transparent', color: isSel ? '#fff' : 'inherit',
                      border: isToday ? '1px solid #38bdf8' : '1px solid transparent', borderRadius: 8,
                      padding: '5px 0 4px', cursor: 'pointer', opacity: inMonth ? 1 : 0.4, fontSize: 12.5,
                      fontWeight: isToday || info?.ferie ? 700 : 400,
                    }}
                    aria-label={d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  >
                    <div style={{ color: !isSel && info?.ferie ? COL.ferie : undefined }}>{d.getDate()}</div>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center', height: 6, marginTop: 2 }}>
                      {info?.ev ? dot(COL.ev) : null}
                      {info?.centre ? dot(COL.centre) : null}
                      {info?.ferie ? dot(COL.ferie) : null}
                      {info?.fin ? dot(COL.fin) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Légende */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--text-dim)', margin: '8px 0 10px' }}>
              <span>{dot(COL.ev)} Agenda</span><span>{dot(COL.centre)} Centres</span>
              <span>{dot(COL.ferie)} Férié</span><span>{dot(COL.fin)} Fin de mois</span>
            </div>

            {error && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>{error}</div>}

            {/* Jour sélectionné */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>
                  {selLabel}{loading ? ' …' : ''}
                </div>
                {!form && (
                  <button type="button" style={{ ...smallBtn, borderColor: '#38bdf8', color: '#38bdf8' }} onClick={openNew}>
                    <Plus size={13} /> Ajouter
                  </button>
                )}
              </div>

              {form ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={field} placeholder="Titre (réunion, rendez-vous, déplacement…)" value={form.title} maxLength={200}
                    onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input style={{ ...field, flex: '1 1 130px' }} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                    {!form.allDay && (
                      <>
                        <input style={{ ...field, flex: '1 1 80px' }} type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="Heure de début" />
                        <input style={{ ...field, flex: '1 1 80px' }} type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-label="Heure de fin" />
                      </>
                    )}
                  </div>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> Toute la journée
                  </label>
                  <input style={field} placeholder="Lieu" value={form.location} maxLength={200} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                  <textarea style={{ ...field, minHeight: 56, resize: 'vertical' }} placeholder="Notes, participants…" value={form.notes} maxLength={2000}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  <select style={field} value={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.value })} aria-label="Rappel">
                    {REMINDERS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                  {formError && <div style={{ fontSize: 12, color: '#fca5a5' }}>{formError}</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" style={smallBtn} onClick={() => setForm(null)}><X size={13} /> Annuler</button>
                    <button type="button" disabled={saving} style={{ ...smallBtn, background: '#0284c7', borderColor: '#0284c7', color: '#fff' }} onClick={() => void save()}>
                      {saving ? 'Enregistrement…' : form.id ? 'Mettre à jour' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dayHolidays.map((h) => (
                    <div key={h.label} style={{ fontSize: 12.5, display: 'flex', gap: 7, alignItems: 'center' }}>
                      {dot(COL.ferie)}<b style={{ color: COL.ferie }}>{h.label}</b>
                      {h.estimated && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>(date estimée, à confirmer)</span>}
                    </div>
                  ))}
                  {dayEvents.map((e) => (
                    <div key={e.id} style={{ border: '1px solid var(--border-color)', borderLeft: `3px solid ${COL.ev}`, borderRadius: 8, padding: '7px 9px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                            {e.all_day ? 'Journée' : `${hm(e.starts_at)}${e.ends_at ? ` – ${hm(e.ends_at)}` : ''}`} · {e.title}
                          </div>
                          {e.location && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', gap: 4, alignItems: 'center' }}><MapPin size={11} /> {e.location}</div>}
                          {e.notes && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'pre-line', marginTop: 2 }}>{e.notes}</div>}
                          {e.reminder_minutes !== null && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-dim)', display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                              <Bell size={10} /> {REMINDERS.find((r) => r.v === String(e.reminder_minutes))?.l ?? `${e.reminder_minutes} min avant`}
                            </div>
                          )}
                        </div>
                        <button type="button" style={smallBtn} onClick={() => openEdit(e)} aria-label="Modifier"><Pencil size={12} /></button>
                        <button type="button" style={{ ...smallBtn, color: '#f87171' }} onClick={() => void remove(e)} aria-label="Supprimer"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                  {dayAuto.map((a) => (
                    <div key={a.id} style={{ borderLeft: `3px solid ${a.kind === 'fin_mois' ? COL.fin : COL.centre}`, padding: '3px 9px' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.title}</div>
                      {a.detail && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{a.detail}</div>}
                      {a.href && <a href={a.href} style={{ fontSize: 11.5, color: '#38bdf8' }}>Voir le détail →</a>}
                    </div>
                  ))}
                  {!dayHolidays.length && !dayEvents.length && !dayAuto.length && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '6px 0' }}>Rien de prévu ce jour. « Ajouter » pour planifier un rendez-vous.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
