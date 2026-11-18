'use client';

import { useEffect, useState } from 'react';
import { num, pct } from '@/lib/format';

export type CentreExtra = {
  id: number; centre: string; region: string; statut: string; gravite: string; probleme: string;
  categories: string[]; jours: number | null; jours_approx: boolean;
  baseline_ca_mensuel: number | null; perte_estimee: number | null;
  dernier_gasoil: { exercise: number; month: number; quantity: number } | null; mois_depuis: number | null;
};
export type Extras = {
  canCentres: boolean;
  rapport_date?: string | null;
  centres?: CentreExtra[];
  summary?: { total: number; arret: number; perturbe: number; plus_long_arret: { centre: string; jours: number; approx: boolean } | null };
  alerts?: { critical: number; unread: number };
} | null;

export function useNationalExtras(): Extras {
  const [data, setData] = useState<Extras>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/vue-nationale/extras', { cache: 'no-store', credentials: 'include' });
        const j = await r.json();
        if (alive && j?.ok) setData(j.data);
      } catch { /* silencieux */ }
    };
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return data;
}

const MONTH_FULL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const STATUT_LABEL: Record<string, string> = { arret: 'À l’arrêt', perturbe: 'Perturbé', en_cours: 'Réparation en cours' };
const STATUT_COLOR: Record<string, string> = { arret: '#ef4444', perturbe: '#f59e0b', en_cours: '#38bdf8' };
const CAT_LABEL: Record<string, string> = {
  carburant: 'Carburant', produits_chimiques: 'Produits chimiques', fuite: 'Fuite', panne_equipement: 'Panne',
  electricite_edg: 'EDG', vandalisme: 'Vandalisme', travaux: 'Travaux', consommables: 'Consommables',
};

const fmtGnf = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md GNF`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`;
  return `${Math.round(v).toLocaleString('fr-FR')} GNF`;
};

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16 };
const innerBox: React.CSSProperties = { background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 10 };
const h3: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' };
const small: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)' };

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 9px', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{children}</span>;
}

/* 1. Situation du jour */
export function SituationDuJour({ extras, k }: { extras: Extras; k: any }) {
  const rec = Number(k?.recovery) || 0;
  const c = extras && extras.canCentres && extras.summary ? extras : null;
  const s = c?.summary;
  if (!(s && s.total > 0) && !rec) return null;
  const recOk = rec >= 0.9;
  const chip = (label: string, value: string, color?: string) => (
    <div key={label} style={{ ...innerBox, flex: '1 1 120px', padding: '9px 11px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '.07em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text-strong)' }}>{value}</div>
    </div>
  );
  return (
    <section className="vn-sit" style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(90deg, rgba(239,68,68,.12), rgba(245,158,11,.06), var(--bg-card))' }}>
      <div style={{ flex: '1 1 320px', fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 11, letterSpacing: '.07em', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-dim)', marginBottom: 4 }}>Situation du jour</div>
        {s && s.total > 0 && (
          <span>
            <b style={{ color: s.arret > 0 ? '#fca5a5' : '#6ee7b7' }}>{s.arret} centre{s.arret > 1 ? 's' : ''} de l’intérieur sur {s.total} {s.arret > 1 ? 'sont' : 'est'} à l’arrêt</b>
            {s.perturbe > 0 && <> et <b style={{ color: '#fcd34d' }}>{s.perturbe} {s.perturbe > 1 ? 'sont perturbés' : 'est perturbé'}</b></>}.
            {s.plus_long_arret && <> Le plus long arrêt dure <b style={{ color: 'var(--text-strong)' }}>{s.plus_long_arret.approx ? '~' : ''}{s.plus_long_arret.jours} jours</b> ({s.plus_long_arret.centre}).</>}{' '}
          </span>
        )}
        {rec > 0 && (
          <span>
            Le recouvrement national est à <b style={{ color: recOk ? '#6ee7b7' : '#fcd34d' }}>{pct(rec)}</b>, {recOk ? 'au-dessus' : 'sous'} la cible de 90 %.
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 420px' }}>
        {s && s.total > 0 && chip('Centres à l’arrêt', `${s.arret} / ${s.total}`, s.arret > 0 ? '#fca5a5' : '#6ee7b7')}
        {s?.plus_long_arret && chip('Plus long arrêt', `${s.plus_long_arret.approx ? '~' : ''}${s.plus_long_arret.jours} j`, '#fca5a5')}
        {rec > 0 && chip('Recouvrement', pct(rec), recOk ? '#6ee7b7' : '#fcd34d')}
        {c?.alerts && chip('Alertes critiques', String(c.alerts.critical), c.alerts.critical > 0 ? '#fca5a5' : '#6ee7b7')}
      </div>
    </section>
  );
}

/* 2 à 5 */
export function NationalExtras({ k, cur, extras }: { k: any; cur: any; extras: Extras }) {
  // 2. Pertes d'eau en GNF
  const prod = Number(k?.production) || 0;
  const cons = Number(k?.technicalConsumption) || 0;
  const bill = Number(k?.technicalBilling) || 0;
  const price = Number(k?.volumeBilled) > 0 ? (Number(k?.revenue) || 0) / Number(k.volumeBilled) : 0;
  const phys = Math.max(0, prod - cons);
  const comm = Math.max(0, cons - bill);
  const lossTotal = (phys + comm) * price;
  const showLoss = prod > 0 && price > 0;

  // 3. Impayés par agence
  const ag: { name: string; v: number }[] = ((cur?.agencies as any[]) || [])
    .map((a) => ({ name: String(a.name), v: Number(a.impayes) > 0 ? Number(a.impayes) : Number(a.balance) > 0 ? Number(a.balance) : 0 }))
    .filter((a) => a.v > 0)
    .sort((a, b) => b.v - a.v);
  const agTotal = ag.reduce((s, a) => s + a.v, 0);
  const top = ag.slice(0, 5);

  const centres = extras && extras.canCentres ? extras.centres || [] : [];
  // 4. Carburant
  const fuel = centres
    .filter((c) => c.categories.includes('carburant'))
    .sort((a, b) => (b.mois_depuis ?? 9999) - (a.mois_depuis ?? 9999));
  // 5. Coût des arrêts
  const stops = centres.filter((c) => c.statut === 'arret').sort((a, b) => (b.jours ?? -1) - (a.jours ?? -1));
  const stopsTotal = stops.reduce((s, c) => s + (c.perte_estimee || 0), 0);

  return (
    <>
      {showLoss && (
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <h3 style={h3}>Ce que coûte l’eau perdue</h3>
            <Pill>Prix moyen facturé : {Math.round(price).toLocaleString('fr-FR')} GNF/m³</Pill>
          </div>
          {[
            { label: 'Pertes physiques', sub: 'production − consommation', m3: phys, color: '#f59e0b' },
            { label: 'Pertes commerciales', sub: 'consommation − facturé', m3: comm, color: '#38bdf8' },
          ].map((r) => (
            <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,170px) 1fr minmax(100px,150px)', gap: 10, alignItems: 'center', margin: '10px 0', fontSize: 12.5 }}>
              <div><div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{r.label}</div><div style={small}>{r.sub}</div></div>
              <div style={{ height: 12, background: '#11263f', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${lossTotal > 0 ? Math.min(100, ((r.m3 * price) / lossTotal) * 100) : 0}%`, height: '100%', background: r.color, borderRadius: 999 }} />
              </div>
              <div style={{ textAlign: 'right' }}><b style={{ color: 'var(--text-strong)' }}>{fmtGnf(r.m3 * price)}</b><div style={small}>{num(r.m3)} m³</div></div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 10, marginTop: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>Total sur l’exercice</span>
            <b style={{ color: '#f59e0b' }}>{fmtGnf(lossTotal)}</b>
          </div>
          <div style={{ ...small, marginTop: 8 }}>Estimation : volumes perdus valorisés au prix moyen facturé de l’exercice.</div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h3 style={h3}>Impayés : où est l’argent ?</h3>
            {agTotal > 0 && <Pill>Total {fmtGnf(agTotal)}</Pill>}
          </div>
          {top.length === 0 && <div style={{ ...small, fontSize: 12 }}>Aucun impayé enregistré pour cet exercice.</div>}
          {top.map((a, i) => (
            <div key={a.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,120px) 1fr minmax(90px,130px)', gap: 10, alignItems: 'center', margin: '9px 0', fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{a.name}</span>
              <div style={{ height: 12, background: '#11263f', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${(a.v / top[0].v) * 100}%`, height: '100%', background: i < 2 ? '#ef4444' : i < 4 ? '#f59e0b' : '#38bdf8', borderRadius: 999 }} />
              </div>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{Math.round((a.v / agTotal) * 100)} % · {fmtGnf(a.v)}</span>
            </div>
          ))}
          <div style={{ ...small, marginTop: 8 }}>Top 5 des agences par montant d’impayés, avec leur part du total.</div>
        </section>

        {stops.length > 0 && (
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <h3 style={h3}>Coût des arrêts</h3>
              {stopsTotal > 0 && <Pill>≈ {fmtGnf(stopsTotal)} non facturés</Pill>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {stops.map((c) => (
                <div key={c.id} style={{ ...innerBox, borderLeft: '3px solid #ef4444', padding: 11 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>{c.centre}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fca5a5', lineHeight: 1.2 }}>{c.jours != null ? `${c.jours_approx ? '~' : ''}${c.jours} j` : 'date ?'}</div>
                  <div style={{ ...small, marginTop: 2 }}>{c.categories.map((x) => CAT_LABEL[x] ?? x).join(' · ')}</div>
                  <div style={{ marginTop: 7, fontSize: 12, fontWeight: 700, color: c.perte_estimee != null ? '#f59e0b' : 'var(--text-dim)' }}>
                    {c.perte_estimee != null ? `≈ ${fmtGnf(c.perte_estimee)} non facturés` : 'référence indisponible'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...small, marginTop: 8 }}>Estimation = facturation mensuelle moyenne TTC du centre × durée de l’arrêt. « ~ » : date de début approximative.</div>
          </section>
        )}
      </div>

      {fuel.length > 0 && (
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={h3}>Carburant des centres</h3>
            <Pill>{fuel.length} centre{fuel.length > 1 ? 's' : ''} en manque</Pill>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dark-table">
              <thead>
                <tr><th>Centre</th><th>Statut</th><th>Dernière livraison de gasoil</th><th>Écoulé</th><th>Quantité</th></tr>
              </thead>
              <tbody>
                {fuel.map((c) => (
                  <tr key={c.id}>
                    <td><strong style={{ color: 'var(--text-strong)' }}>{c.centre}</strong></td>
                    <td><span style={{ color: STATUT_COLOR[c.statut] ?? '#f59e0b', fontWeight: 700, fontSize: 12 }}>{STATUT_LABEL[c.statut] ?? c.statut}</span></td>
                    <td>{c.dernier_gasoil ? `${MONTH_FULL[c.dernier_gasoil.month - 1]} ${c.dernier_gasoil.exercise}` : <span style={{ color: '#fca5a5' }}>Aucune livraison trouvée (24 mois)</span>}</td>
                    <td>{c.mois_depuis == null ? '—' : c.mois_depuis <= 0 ? 'ce mois-ci' : `il y a ${c.mois_depuis} mois`}</td>
                    <td>{c.dernier_gasoil ? `${num(c.dernier_gasoil.quantity)} L` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...small, marginTop: 8 }}>Livraisons enregistrées au mois. Tri : centres les plus longtemps sans livraison en premier.</div>
        </section>
      )}
    </>
  );
}
