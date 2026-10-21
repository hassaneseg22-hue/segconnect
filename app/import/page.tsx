'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { UploadCloud, FileSpreadsheet, ArrowRight, CheckCircle2, AlertCircle, Loader2, X, ShieldCheck, Database, History, TriangleAlert, RefreshCw, Building2, CalendarRange } from 'lucide-react';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function fmtBytes(b: number) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} Mo`;
  return `${(b / 1024).toFixed(1)} Ko`;
}

type Analysis = {
  fileName: string;
  fileSize: number;
  sourceYear: number;
  alreadyImported: boolean;
  existingImportId?: number | null;
  sheetDetected: { BD_FAC: boolean; BD_TECH: boolean; BD_Recouv: boolean };
  sheetRawCounts: { BD_FAC: number; BD_TECH: number; BD_Recouv: number };
  counts: { fac: number; tech: number; rec: number; total: number };
  periods: string[];
  periodsLabels: string[];
  agencies: string[];
  anomalies: any[];
  anomaliesCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  duplicateKeys: number;
  existingPeriods: string[];
};

const initial: Analysis | null = null;

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'select' | 'analyzing' | 'preview' | 'importing' | 'result'>('select');
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(initial);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [showAnomalies, setShowAnomalies] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // reset du message quand on change de fichier
  }, [file]);

  const pick = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setAnalysis(null);
    setResult(null);
    setError('');
    setWarn('');
    setStep('select');
  };

  const analyze = async () => {
    if (!file) return;
    setError('');
    setWarn('');
    setStep('analyzing');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'analyze');
      fd.append('userName', userLabel());
      const r = await fetch('/api/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) {
        setStep('select');
        setError(j.error || 'Analyse impossible.');
        return;
      }
      setAnalysis(j.analysis);
      setStep('preview');
    } catch (e: any) {
      setStep('select');
      setError(e.message || 'Échec de connexion au serveur.');
    }
  };

  const confirmImport = async () => {
    if (!file) return;
    setError('');
    setWarn('');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'import');
      fd.append('confirm', 'true');
      fd.append('userName', userLabel());
      const r = await fetch('/api/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (r.ok) {
        setResult(j.result);
        setStep('result');
        return;
      }
      // Cas : période existante sans confirmation (ou fichier déjà importé)
      if (j.code === 'already_imported') {
        setStep('select');
        setError(`${j.error} ${j.existing?.file_name || ''}`);
        return;
      }
      setStep('preview');
      setError(j.error || 'Import impossible.');
    } catch (e: any) {
      setStep('preview');
      setError(e.message || 'Échec de connexion au serveur.');
    } finally {
      setImporting(false);
    }
  };

  const userLabel = () => (typeof window !== 'undefined' ? (localStorage.getItem('seg_import_user') || '') : '');

  const periodTitle = (p: string) => {
    const m = Number(p.slice(5, 7));
    return `${MONTHS[(m - 1) % 12]} ${p.slice(0, 4)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Import des Données SEG</h2>
          <p>Déposez le fichier Excel fourni par la SEG : analyse, validation puis intégration dans MySQL — sans ne jamais toucher directement à la base.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/import/history" className="btn-brand ghost" style={{ textDecoration: 'none' }}>
            <History size={16} /> Historique
          </Link>
        </div>
      </div>

      {/* Info KPIs */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}><FileSpreadsheet size={20} /></div>
            <div className="kpi-title-value"><div className="kpi-title">Format attendu</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>.xlsx / .xls</span></div></div>
          </div>
          <div className="kpi-foot-row"><span className="kpi-period">Feuilles BD_FAC · BD_TECH · BD_Recouv</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}><ShieldCheck size={20} /></div>
            <div className="kpi-title-value"><div className="kpi-title">Contrôle</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px', color: '#10b981' }}>Béta + transactions</span></div></div>
          </div>
          <div className="kpi-foot-row"><span className="kpi-period">Normalisation · anomalies · rollback</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}><Database size={20} /></div>
            <div className="kpi-title-value"><div className="kpi-title">Cible</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>MySQL / XAMPP</span></div></div>
          </div>
          <div className="kpi-foot-row"><span className="kpi-period">Données synchronisées après import</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}><TriangleAlert size={20} /></div>
            <div className="kpi-title-value"><div className="kpi-title">Fiabilité</div><div className="kpi-num-row"><span className="kpi-main-val" style={{ fontSize: '16px' }}>100% données réelles</span></div></div>
          </div>
          <div className="kpi-foot-row"><span className="kpi-period">Aucune donnée inventée</span></div>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        {[
          ['select', 'Sélection'],
          ['preview', 'Analyse'],
          ['result', 'Import'],
        ].map(([k, lbl]) => {
          const active = k === 'select' ? step === 'select' || step === 'analyzing' : k === 'preview' ? step === 'preview' || step === 'importing' : step === 'result';
          const done = k === 'select' ? file && (step === 'analyzing' || step === 'preview' || step === 'importing' || step === 'result') : k === 'preview' ? step === 'importing' || step === 'result' : step === 'result';
          return (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: done ? '#10b981' : active ? '#38bdf8' : '#8ca2ba', fontWeight: active || done ? 700 : 400 }}>
              {done ? <CheckCircle2 size={14} /> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#38bdf8' : '#334' }} />}
              {lbl}
            </span>
          );
        })}
      </div>

      {error && (
        <div className="dark-alert-box danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#ef4444' }}><AlertCircle size={16} /><span>Import impossible</span></div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>{error}</p>
        </div>
      )}
      {warn && (
        <div className="dark-alert-box warning">
          <p style={{ fontSize: '12.5px', color: '#f59e0b' }}>{warn}</p>
        </div>
      )}

      {/* ===== SELECT ===== */}
      {(step === 'select' || step === 'analyzing') && (
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>Chargement du Fichier de Données SEG</h3>
            <span className="badge-pill cyan">V0.2.1 — Import auto</span>
          </div>
          <div
            className="dark-upload-dropzone"
            style={{ borderColor: dragging ? 'rgba(56,189,248,0.8)' : 'var(--border-color)', cursor: file ? 'default' : 'pointer' }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0] || null); }}
            onClick={() => { if (!file) inputRef.current?.click(); }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => { pick(e.target.files?.[0] || null); e.target.value = ''; }}
            />
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', margin: '0 auto 14px' }}>
              <UploadCloud size={26} />
            </div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '6px' }}>
              {file ? file.name : 'Glissez-déposez le fichier Excel ou cliquez pour parcourir'}
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto', lineHeight: 1.6 }}>
              {file ? `Taille : ${fmtBytes(file.size)}` : 'Formats : .xlsx / .xls — feuilles BD_FAC, BD_TECH, BD_Recouv détectées automatiquement.'}
            </p>
            {file && (
              <div style={{ marginTop: '18px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn-brand" onClick={(e) => { e.stopPropagation(); setFile(null); setStep('select'); setAnalysis(null); setError(''); }} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <X size={16} /> Retirer
                </button>
                <button className="btn-brand" onClick={(e) => { e.stopPropagation(); analyze(); }} disabled={step === 'analyzing'} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {step === 'analyzing' ? <><Loader2 size={16} className="spin" /> Analyse en cours…</> : <><FileSpreadsheet size={16} /> ANALYSER LE FICHIER</>}
                </button>
              </div>
            )}
          </div>
          {step === 'analyzing' && (
            <div className="dark-alert-box info" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700 }}>
                <Loader2 size={16} className="spin" /> Analyse du fichier en mémoire…
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>Détection des feuilles, des périodes, des agences, des doublons et des anomalies — aucune donnée n'est encore écrite en base.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== PREVIEW ===== */}
      {step === 'preview' && analysis && (
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>Analyse du fichier</h3>
            <span className="badge-pill cyan">{analysis.fileName}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Feuilles détectées */}
            <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>Feuilles détectées</div>
              {(['BD_FAC', 'BD_TECH', 'BD_Recouv'] as const).map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12.5px' }}>
                  {analysis.sheetDetected[s] ? <CheckCircle2 size={15} color="#10b981" /> : <AlertCircle size={15} color="#f59e0b" />}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{s}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{analysis.sheetDetected[s] ? `${analysis.sheetRawCounts[s]} ligne(s) brutes` : 'Absente'}</span>
                </div>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '3px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Lignes normalisées</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{analysis.counts.total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '3px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Facturation · Technique · Recouvrement</span>
                <span style={{ color: 'var(--text-muted)' }}>{analysis.counts.fac} · {analysis.counts.tech} · {analysis.counts.rec}</span>
              </div>
            </div>

            {/* Période & agences */}
            <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>Périodes &amp; agences</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <CalendarRange size={14} color="#38bdf8" />
                {analysis.periodsLabels.length ? analysis.periodsLabels.map((p) => <span key={p} className="badge-pill cyan">{p}</span>) : <span style={{ color: 'var(--text-dim)', fontSize: '12.5px' }}>Aucune période lisible</span>}
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <Building2 size={14} color="#10b981" />
                {analysis.agencies.map((a) => <span key={a} className="badge-pill green">{a}</span>)}
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '3px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Doublons intra-fichier</span>
                <span style={{ color: analysis.duplicateKeys ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{analysis.duplicateKeys}</span>
              </div>
            </div>
          </div>

          {/* Anomalies */}
          <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TriangleAlert size={16} style={{ color: analysis.criticalCount ? '#ef4444' : analysis.warningCount ? '#f59e0b' : '#10b981' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Anomalies : {analysis.anomaliesCount}</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>({analysis.criticalCount} critiques · {analysis.warningCount} avertissements · {analysis.infoCount} infos)</span>
              {analysis.anomaliesCount > 0 && (
                <button className="notif-link-btn" onClick={() => setShowAnomalies((s) => !s)} style={{ marginLeft: 'auto' }}>
                  {showAnomalies ? 'Masquer' : 'Voir les anomalies'}
                </button>
              )}
            </div>
            {showAnomalies && analysis.anomalies.length > 0 && (
              <div style={{ marginTop: '10px', maxHeight: '220px', overflowY: 'auto' }}>
                {analysis.anomalies.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '12px' }}>
                    <span className={`badge-pill ${a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'cyan'}`} style={{ fontSize: '9.5px', flexShrink: 0 }}>{a.severity}</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>L{a.excelRow}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{a.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Période existante */}
          {analysis.existingPeriods.length > 0 && (
            <div className="dark-alert-box warning" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f59e0b' }}>
                <AlertCircle size={16} /><span>Cette période existe déjà</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Périodes concernées : {analysis.existingPeriods.join(', ')}. Confirmez pour écraser et mettre à jour les données concernées (restauration possible via l'historique).
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn-brand ghost" onClick={() => setStep('select')} style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              <X size={16} /> Annuler
            </button>
            <button className="btn-brand" onClick={confirmImport} disabled={importing}>
              {importing ? <><Loader2 size={16} className="spin" /> Import en cours…</> : <><ArrowRight size={16} /> {analysis.existingPeriods.length ? 'Mettre à jour la période' : 'Importer les données'}</>}
            </button>
          </div>
        </div>
      )}

      {/* ===== RESULT ===== */}
      {step === 'result' && result && (
        <div className="dashboard-card">
          <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
            <CheckCircle2 size={52} style={{ color: '#10b981', margin: '0 auto 10px' }} />
            <h3 style={{ color: '#10b981', margin: 0 }}>✓ IMPORTATION RÉUSSIE</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>Les données sont maintenant dans MySQL et le dashboard est actualisé.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginTop: '10px' }}>
            <div className="kpi-card">
              <div className="kpi-title" style={{ fontSize: '12px' }}>Lignes traitées</div>
              <div className="kpi-main-val" style={{ fontSize: '24px', color: '#38bdf8' }}>{result.totalRows ?? 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title" style={{ fontSize: '12px' }}>Nouvelles données</div>
              <div className="kpi-main-val" style={{ fontSize: '24px', color: '#10b981' }}>{result.newRows ?? 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title" style={{ fontSize: '12px' }}>Données mises à jour</div>
              <div className="kpi-main-val" style={{ fontSize: '24px', color: '#c084fc' }}>{result.updatedRows ?? 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title" style={{ fontSize: '12px' }}>Anomalies</div>
              <div className="kpi-main-val" style={{ fontSize: '24px', color: result.anomaliesCount ? '#f59e0b' : '#10b981' }}>{result.anomaliesCount ?? 0}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '18px', flexWrap: 'wrap' }}>
            <Link href="/" className="btn-brand" style={{ textDecoration: 'none' }}>
              <RefreshCw size={16} /> Voir le dashboard
            </Link>
            <Link href="/import/history" className="btn-brand ghost" style={{ textDecoration: 'none' }}>
              <History size={16} /> Voir l'historique
            </Link>
            <button className="btn-brand ghost" onClick={() => { setStep('select'); setFile(null); setAnalysis(null); setResult(null); }} style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              Importer un autre fichier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}