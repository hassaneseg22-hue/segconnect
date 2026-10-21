'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  ClipboardList,
  Plus,
  X,
  RefreshCw,
  CheckCircle2,
  Clock,
  Activity,
  Droplets,
  Users,
  MapPin,
  Lock,
} from 'lucide-react';
import { useDataRefresh } from '@/lib/use-data-version';
import {
  CATEGORIES,
  GRAVITES,
  GRAVITE_LABEL,
  PERMISSIONS,
  STATUTS,
  STATUT_LABEL,
  type Evenement,
  type EvenementGravite,
  type EvenementNature,
  type EvenementStatut,
} from '@/lib/evenements';

/* =====================================================================
 * Registre des incidents / des missions de terrain
 * Source : /api/evenements (table seg_evenements_terrain).
 * La page affiche uniquement ce qui a été déclaré : aucun exemple,
 * aucune donnée de démonstration.
 * ===================================================================== */

type ApiData = {
  year: number | null;
  events: Evenement[];
  agencies: Array<{ id: number; name: string }>;
  centres: string[];
  permissions: { create: Record<EvenementNature, boolean>; update: Record<EvenementNature, boolean> };
};

const C = { blue: '#0284c7', green: '#059669', orange: '#d97706', red: '#dc2626', grey: '#64748b', violet: '#7c3aed' };
const GRAVITE_COLOR: Record<EvenementGravite, string> = { faible: C.grey, moyenne: C.orange, critique: C.red };
const STATUT_COLOR: Record<EvenementStatut, string> = { ouvert: C.red, en_cours: C.orange, resolu: C.green, annule: C.grey };
const YEARS = [2026, 2025, 2024, 2023];

const TEXT: Record<EvenementNature, {
  title: string; subtitle: string; one: string; declare: string; empty: string; icon: ReactNode; accent: string;
}> = {
  incident: {
    title: 'Incidents & Signalements',
    subtitle: 'Pannes, arrêts, casses et anomalies déclarés sur les stations, forages, réservoirs et le réseau.',
    one: 'incident',
    declare: 'Déclarer un incident',
    empty: 'Aucun incident déclaré pour cette période.',
    icon: <AlertTriangle size={22} style={{ color: C.red }} />,
    accent: C.red,
  },
  mission: {
    title: 'Missions & Ordres de travail',
    subtitle: 'Interventions, maintenances et inspections des équipes sur le terrain.',
    one: 'mission',
    declare: 'Déclarer une mission',
    empty: 'Aucune mission déclarée pour cette période.',
    icon: <ClipboardList size={22} style={{ color: C.orange }} />,
    accent: C.orange,
  },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const durationHours = (e: Evenement) => {
  const end = e.date_fin ? Date.parse(e.date_fin) : e.statut === 'resolu' || e.statut === 'annule' ? null : Date.now();
  if (end === null) return null;
  return Math.max(0, (end - Date.parse(e.date_debut)) / 3600000);
};
const fmtDuration = (h: number | null) => {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;
};
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const placeOf = (e: Evenement) => e.centre_nom ? `Centre de ${e.centre_nom}` : e.agency_name ? `Agence ${e.agency_name}` : '—';

export default function EvenementsTerrain({ nature }: { nature: EvenementNature }) {
  const t = TEXT[nature];
  const [year, setYear] = useState(YEARS[0]);
  const [statutFilter, setStatutFilter] = useState<'' | EvenementStatut | 'actifs'>('');
  const [graviteFilter, setGraviteFilter] = useState<'' | EvenementGravite>('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const refreshTick = useDataRefresh();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/evenements?nature=${nature}&year=${year}`, { cache: 'no-store', signal: controller.signal });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; data?: ApiData } | null;
        if (!res.ok || !json?.ok || !json.data) throw new Error(json?.error || `Erreur ${res.status}`);
        setData(json.data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [nature, year, reloadToken, refreshTick]);

  const reload = useCallback(() => setReloadToken((v) => v + 1), []);
  const canCreate = data?.permissions.create[nature] ?? false;
  const canUpdate = data?.permissions.update[nature] ?? false;
  const events = useMemo(() => data?.events ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (statutFilter === 'actifs' && !(e.statut === 'ouvert' || e.statut === 'en_cours')) return false;
      if (statutFilter && statutFilter !== 'actifs' && e.statut !== statutFilter) return false;
      if (graviteFilter && e.gravite !== graviteFilter) return false;
      if (q) {
        const hay = [e.titre, e.categorie, e.centre_nom, e.agency_name, e.installation, e.equipe, e.description].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, statutFilter, graviteFilter, search]);

  const stats = useMemo(() => {
    const active = events.filter((e) => e.statut === 'ouvert' || e.statut === 'en_cours');
    const resolved = events.filter((e) => e.statut === 'resolu');
    const durations = resolved.map(durationHours).filter((h): h is number => h !== null);
    const byCat = new Map<string, number>();
    for (const e of events) byCat.set(e.categorie, (byCat.get(e.categorie) ?? 0) + 1);
    return {
      total: events.length,
      active: active.length,
      critical: active.filter((e) => e.gravite === 'critique').length,
      resolved: resolved.length,
      avgResolution: durations.length ? durations.reduce((a, h) => a + h, 0) / durations.length : null,
      lost: events.reduce((a, e) => a + (e.impact_m3 ?? 0), 0),
      teams: new Set(active.map((e) => e.equipe?.trim()).filter(Boolean)).size,
      byCat: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [events]);

  async function changeStatut(e: Evenement, statut: EvenementStatut) {
    setBusyId(e.id);
    setNotice('');
    try {
      const res = await fetch(`/api/evenements/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Erreur ${res.status}`);
      setNotice(`« ${e.titre} » : statut passé à ${STATUT_LABEL[statut].toLowerCase()}.`);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ev-page">
      <style>{CSS}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={14} /> Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>{t.title}</span>
      </div>

      <div className="ev-hero" style={{ borderColor: `${t.accent}55` }}>
        <div>
          <div className="ev-eyebrow" style={{ color: t.accent }}>Registre de terrain · données déclarées</div>
          <h2 className="ev-title">{t.icon} {t.title}</h2>
          <p className="ev-sub">{t.subtitle}</p>
        </div>
        {canCreate ? (
          <button type="button" className="ev-btn ev-btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Fermer le formulaire' : t.declare}
          </button>
        ) : data ? (
          <div className="ev-readonly" title={`Permission requise : ${PERMISSIONS[nature].create}`}>
            <Lock size={14} /> Consultation seule
          </div>
        ) : null}
      </div>

      {showForm && data && canCreate && (
        <DeclarationForm
          nature={nature}
          data={data}
          onCancel={() => setShowForm(false)}
          onSaved={(titre) => {
            setShowForm(false);
            setNotice(`« ${titre} » a été enregistré.`);
            reload();
          }}
        />
      )}

      <div className="dashboard-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
        <div>
          <span className="filter-label">Exercice</span>
          <select value={year} onChange={(e: { target: { value: string } }) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <span className="filter-label">Statut</span>
          <select value={statutFilter} onChange={(e: { target: { value: string } }) => setStatutFilter(e.target.value as typeof statutFilter)}>
            <option value="">Tous</option>
            <option value="actifs">Ouverts et en cours</option>
            {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <span className="filter-label">Gravité</span>
          <select value={graviteFilter} onChange={(e: { target: { value: string } }) => setGraviteFilter(e.target.value as typeof graviteFilter)}>
            <option value="">Toutes</option>
            {GRAVITES.map((g) => <option key={g} value={g}>{GRAVITE_LABEL[g]}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <span className="filter-label">Recherche</span>
          <input
            className="ev-input"
            placeholder="Titre, centre, équipe…"
            value={search}
            onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
          />
        </div>
        <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
          <span />
          {loading ? 'Actualisation…' : error ? 'Erreur' : 'Données chargées'}
        </div>
      </div>

      {error && (
        <div className="db-error-banner">
          {error}
          <button type="button" onClick={reload} style={{ marginLeft: 12 }}><RefreshCw size={13} /> Réessayer</button>
        </div>
      )}
      {notice && <div className="dark-alert-box info" style={{ fontSize: 13 }}>{notice}</div>}

      <div className="ev-kpis">
        <Kpi label={`Déclarés en ${year}`} value={String(stats.total)} color={C.blue} icon={<Activity size={16} />} />
        <Kpi label="Ouverts / en cours" value={String(stats.active)} color={stats.active ? C.orange : C.green} icon={<Clock size={16} />} />
        {nature === 'incident' ? (
          <Kpi label="Critiques non résolus" value={String(stats.critical)} color={stats.critical ? C.red : C.green} icon={<AlertTriangle size={16} />} />
        ) : (
          <Kpi label="Équipes engagées" value={String(stats.teams)} color={C.violet} icon={<Users size={16} />} />
        )}
        <Kpi label="Résolus" value={String(stats.resolved)} color={C.green} icon={<CheckCircle2 size={16} />} />
        <Kpi label="Délai moyen de résolution" value={fmtDuration(stats.avgResolution)} color={C.grey} icon={<Clock size={16} />} />
        {nature === 'incident' && (
          <Kpi
            label="Volume perdu estimé"
            value={stats.lost > 0 ? `${Math.round(stats.lost).toLocaleString('fr-FR')} m³` : '—'}
            color={C.blue}
            icon={<Droplets size={16} />}
          />
        )}
      </div>

      {data && events.length === 0 && !loading ? (
        <div className="dashboard-card ev-empty">
          {t.icon}
          <h3>{t.empty}</h3>
          <p>
            Le registre est actif depuis sa création : chaque {t.one} déclaré ici apparaît aussitôt dans cette liste, sur la carte
            nationale et dans le tableau de bord technique.
          </p>
          {canCreate && (
            <button type="button" className="ev-btn ev-btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> {t.declare}
            </button>
          )}
        </div>
      ) : (
        <div className="ev-layout">
          <div className="dashboard-card" style={{ borderTop: `3px solid ${t.accent}`, minWidth: 0 }}>
            <div className="card-header-flex">
              <h3 className="ev-card-title">Registre {year}</h3>
              <span className="badge-pill cyan">{filtered.length} / {events.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dark-table ev-table">
                <thead>
                  <tr>
                    <th>Début</th>
                    <th>{nature === 'incident' ? 'Incident' : 'Mission'}</th>
                    <th>Lieu</th>
                    <th>Gravité</th>
                    <th>Statut</th>
                    <th>Équipe</th>
                    <th>Durée</th>
                    {canUpdate && <th>Suivi</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date_debut)}</td>
                      <td>
                        <div className="ev-name">{e.titre}</div>
                        <div className="ev-small">{e.categorie}{e.declare_par_nom ? ` · déclaré par ${e.declare_par_nom}` : ''}</div>
                        {e.description && <div className="ev-small ev-desc">{e.description}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                          <MapPin size={12} style={{ color: 'var(--text-dim)' }} /> {placeOf(e)}
                        </div>
                        {e.installation && <div className="ev-small">{e.installation}</div>}
                      </td>
                      <td>
                        {e.gravite ? (
                          <span className="ev-pill" style={{ color: GRAVITE_COLOR[e.gravite], borderColor: `${GRAVITE_COLOR[e.gravite]}66` }}>
                            {GRAVITE_LABEL[e.gravite]}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <span className="ev-pill" style={{ color: STATUT_COLOR[e.statut], borderColor: `${STATUT_COLOR[e.statut]}66`, background: `${STATUT_COLOR[e.statut]}14` }}>
                          {STATUT_LABEL[e.statut]}
                        </span>
                      </td>
                      <td>{e.equipe ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDuration(durationHours(e))}
                        {e.impact_m3 ? <div className="ev-small">{Math.round(e.impact_m3).toLocaleString('fr-FR')} m³ perdus</div> : null}
                      </td>
                      {canUpdate && (
                        <td>
                          <select
                            className="ev-select-sm"
                            value={e.statut}
                            disabled={busyId === e.id}
                            onChange={(ev: { target: { value: string } }) => changeStatut(e, ev.target.value as EvenementStatut)}
                          >
                            {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={canUpdate ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Aucun résultat pour ces filtres.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-card" style={{ minWidth: 0 }}>
            <div className="card-header-flex">
              <h3 className="ev-card-title">Par catégorie</h3>
            </div>
            <div className="ev-cats">
              {stats.byCat.map(([cat, n]) => (
                <div key={cat} className="ev-cat">
                  <div className="ev-cat-head"><span>{cat}</span><strong>{n}</strong></div>
                  <div className="ev-cat-track"><div style={{ width: `${(n / Math.max(1, stats.total)) * 100}%`, background: t.accent }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color, icon }: { label: string; value: string; color: string; icon: ReactNode }) {
  return (
    <div className="ev-kpi" style={{ borderLeftColor: color }}>
      <div className="ev-kpi-head"><span style={{ color, display: 'flex' }}>{icon}</span>{label}</div>
      <div className="ev-kpi-value">{value}</div>
    </div>
  );
}

/* ---------------- Formulaire de déclaration ---------------- */
function DeclarationForm({
  nature,
  data,
  onCancel,
  onSaved,
}: {
  nature: EvenementNature;
  data: ApiData;
  onCancel: () => void;
  onSaved: (titre: string) => void;
}) {
  const [lieuType, setLieuType] = useState<'centre' | 'agence'>('centre');
  const [form, setForm] = useState({
    categorie: CATEGORIES[nature][0],
    titre: '',
    centre_nom: '',
    agency_id: '',
    installation: '',
    gravite: nature === 'incident' ? 'moyenne' : '',
    statut: 'ouvert',
    date_debut: nowLocal(),
    date_fin: '',
    equipe: '',
    impact_m3: '',
    latitude: '',
    longitude: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setError('');
    if (!form.titre.trim()) return setError('Le titre est obligatoire.');
    if (lieuType === 'centre' && !form.centre_nom) return setError('Choisis un centre.');
    if (lieuType === 'agence' && !form.agency_id) return setError('Choisis une agence.');
    setSaving(true);
    try {
      const payload = {
        nature,
        categorie: form.categorie,
        titre: form.titre,
        centre_nom: lieuType === 'centre' ? form.centre_nom : null,
        agency_id: lieuType === 'agence' ? Number(form.agency_id) : null,
        installation: form.installation,
        gravite: form.gravite || null,
        statut: form.statut,
        date_debut: new Date(form.date_debut).toISOString(),
        date_fin: form.date_fin ? new Date(form.date_fin).toISOString() : null,
        equipe: form.equipe,
        impact_m3: form.impact_m3 === '' ? null : Number(form.impact_m3),
        latitude: form.latitude === '' ? null : Number(form.latitude.replace(',', '.')),
        longitude: form.longitude === '' ? null : Number(form.longitude.replace(',', '.')),
        description: form.description,
      };
      const res = await fetch('/api/evenements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Erreur ${res.status}`);
      onSaved(form.titre.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dashboard-card ev-form">
      <div className="card-header-flex">
        <h3 className="ev-card-title">{TEXT[nature].declare}</h3>
        <button type="button" className="ev-btn" onClick={onCancel}><X size={14} /> Annuler</button>
      </div>
      <div className="ev-form-grid">
        <Field label="Catégorie *">
          <select className="ev-input" value={form.categorie} onChange={set('categorie')}>
            {CATEGORIES[nature].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Titre *" wide>
          <input className="ev-input" value={form.titre} onChange={set('titre')} maxLength={200} placeholder="Ex. : Arrêt de la pompe n° 2 du forage F3" />
        </Field>
        <Field label="Lieu *">
          <div className="ev-toggle">
            <button type="button" className={lieuType === 'centre' ? 'on' : ''} onClick={() => setLieuType('centre')}>Centre (intérieur)</button>
            <button type="button" className={lieuType === 'agence' ? 'on' : ''} onClick={() => setLieuType('agence')}>Agence (Conakry)</button>
          </div>
        </Field>
        <Field label={lieuType === 'centre' ? 'Centre *' : 'Agence *'}>
          {lieuType === 'centre' ? (
            <select className="ev-input" value={form.centre_nom} onChange={set('centre_nom')}>
              <option value="">— Choisir —</option>
              {data.centres.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <select className="ev-input" value={form.agency_id} onChange={set('agency_id')}>
              <option value="">— Choisir —</option>
              {data.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Installation">
          <input className="ev-input" value={form.installation} onChange={set('installation')} placeholder="Station, forage, réservoir, conduite…" />
        </Field>
        <Field label={nature === 'incident' ? 'Gravité *' : 'Priorité'}>
          <select className="ev-input" value={form.gravite} onChange={set('gravite')}>
            {nature === 'mission' && <option value="">Non précisée</option>}
            {GRAVITES.map((g) => <option key={g} value={g}>{GRAVITE_LABEL[g]}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select className="ev-input" value={form.statut} onChange={set('statut')}>
            {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Début *">
          <input className="ev-input" type="datetime-local" value={form.date_debut} onChange={set('date_debut')} />
        </Field>
        <Field label="Fin">
          <input className="ev-input" type="datetime-local" value={form.date_fin} onChange={set('date_fin')} />
        </Field>
        <Field label={nature === 'incident' ? 'Équipe intervenante' : 'Équipe / responsable'}>
          <input className="ev-input" value={form.equipe} onChange={set('equipe')} maxLength={200} />
        </Field>
        {nature === 'incident' && (
          <Field label="Volume perdu estimé (m³)">
            <input className="ev-input" type="number" min={0} value={form.impact_m3} onChange={set('impact_m3')} />
          </Field>
        )}
        <Field label="Latitude (optionnel)">
          <input className="ev-input" value={form.latitude} onChange={set('latitude')} placeholder="ex. 9,5370" />
        </Field>
        <Field label="Longitude (optionnel)">
          <input className="ev-input" value={form.longitude} onChange={set('longitude')} placeholder="ex. -13,6785" />
        </Field>
        <Field label="Description" wide>
          <textarea className="ev-input" rows={3} value={form.description} onChange={set('description')} maxLength={2000} />
        </Field>
      </div>
      {error && <div className="db-error-banner" style={{ marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <span className="ev-small" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          Sans coordonnées, le marqueur est placé au chef-lieu du centre (ou à Conakry pour une agence).
        </span>
        <button type="button" className="ev-btn" onClick={onCancel}>Annuler</button>
        <button type="button" className="ev-btn ev-btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`ev-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const CSS = `
.ev-page { display:flex; flex-direction:column; gap:16px; }
.ev-hero { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; padding:18px 20px;
  border-radius:14px; border:1px solid; background:linear-gradient(135deg, rgba(2,132,199,.12), rgba(15,23,42,0) 70%); }
.ev-eyebrow { font-size:11px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; }
.ev-title { display:flex; align-items:center; gap:8px; margin:6px 0 4px; font-size:22px; font-weight:700; }
.ev-sub { margin:0; font-size:13px; color:var(--text-muted); max-width:720px; }
.ev-readonly { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); padding:8px 12px;
  border:1px dashed rgba(148,163,184,.35); border-radius:8px; }
.ev-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600;
  cursor:pointer; border:1px solid rgba(148,163,184,.3); background:rgba(15,23,42,.4); color:inherit; }
.ev-btn:disabled { opacity:.6; cursor:wait; }
.ev-btn-primary { background:#0284c7; border-color:#0284c7; color:#fff; }
.ev-input { width:100%; padding:7px 10px; border-radius:7px; border:1px solid rgba(148,163,184,.3); background:rgba(2,6,23,.35);
  color:inherit; font-size:13px; font-family:inherit; box-sizing:border-box; }
.ev-select-sm { padding:4px 6px; border-radius:6px; border:1px solid rgba(148,163,184,.3); background:rgba(2,6,23,.35); color:inherit; font-size:12px; }
.ev-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:12px; }
.ev-kpi { padding:12px 14px; border-radius:12px; border:1px solid rgba(148,163,184,.18); border-left:4px solid; background:var(--card-bg, rgba(15,23,42,.55)); }
.ev-kpi-head { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); }
.ev-kpi-value { font-size:26px; font-weight:700; margin-top:4px; }
.ev-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:40px 20px; }
.ev-empty h3 { margin:4px 0 0; font-size:16px; }
.ev-empty p { margin:0 0 8px; font-size:13px; color:var(--text-muted); max-width:560px; }
.ev-layout { display:grid; grid-template-columns:minmax(0, 3fr) minmax(220px, 1fr); gap:16px; }
@media (max-width: 1100px) { .ev-layout { grid-template-columns:1fr; } }
.ev-card-title { margin:0; font-size:15px; font-weight:600; }
.ev-table td { vertical-align:top; }
.ev-name { font-weight:600; }
.ev-small { font-size:11px; color:var(--text-dim); margin-top:2px; }
.ev-desc { max-width:380px; white-space:pre-wrap; color:var(--text-muted); }
.ev-pill { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid; font-size:11px; font-weight:600; white-space:nowrap; }
.ev-cats { display:flex; flex-direction:column; gap:10px; margin-top:6px; }
.ev-cat-head { display:flex; justify-content:space-between; font-size:12px; gap:8px; }
.ev-cat-track { height:6px; border-radius:3px; background:rgba(148,163,184,.15); margin-top:4px; overflow:hidden; }
.ev-cat-track div { height:100%; border-radius:3px; }
.ev-form { border-top:3px solid #0284c7; }
.ev-form-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-top:8px; }
.ev-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-muted); }
.ev-field.wide { grid-column:1 / -1; }
.ev-toggle { display:flex; border:1px solid rgba(148,163,184,.3); border-radius:7px; overflow:hidden; }
.ev-toggle button { flex:1; padding:7px 8px; font-size:12px; background:transparent; color:inherit; border:none; cursor:pointer; }
.ev-toggle button.on { background:#0284c7; color:#fff; font-weight:600; }
`;
