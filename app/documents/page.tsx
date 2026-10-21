'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  Archive,
  Clock,
  CheckCircle2,
  FolderOpen,
  Mail,
  BarChart3,
  Shield,
  Calendar,
  X,
  Loader2,
} from 'lucide-react';

type DocCategory = 'all' | 'courriers' | 'rapports' | 'archives' | 'officiels';

interface DocumentItem {
  id: number;
  title: string;
  category: DocCategory;
  type: string;
  agency: string;
  uploadedBy: string;
  uploadedAt: string;
  size: string;
  status: 'active' | 'archived' | 'pending';
  filePath: string;
}

interface ApiDoc {
  id: number;
  title: string;
  category: string;
  file_type: string;
  file_path: string;
  file_size: number;
  agency_id: number | null;
  uploaded_by: number;
  status: string;
  description: string | null;
  created_at: string;
  agency_name: string | null;
  uploader_name: string | null;
}

const CATEGORY_LABELS: Record<DocCategory, string> = {
  all: 'Tous les Documents',
  courriers: 'Courriers',
  rapports: 'Rapports',
  archives: 'Archives',
  officiels: 'Documents Officiels',
};

const CATEGORY_ICONS: Record<DocCategory, any> = {
  all: FileText,
  courriers: Mail,
  rapports: BarChart3,
  archives: Archive,
  officiels: Shield,
};

function formatDateShort(v: string): string {
  const d = new Date(v);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 Ko';
  const mo = bytes / (1024 * 1024);
  if (mo >= 1) return `${mo.toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function toCategory(cat: string): DocCategory {
  return (['courriers', 'rapports', 'archives', 'officiels'] as DocCategory[]).includes(cat as DocCategory)
    ? (cat as DocCategory)
    : 'rapports';
}

function toItem(d: ApiDoc): DocumentItem {
  return {
    id: d.id,
    title: d.title,
    category: toCategory(d.category),
    type: d.file_type,
    agency: d.agency_name || 'Direction Générale',
    uploadedBy: d.uploader_name || 'SEG',
    uploadedAt: d.created_at,
    size: formatSize(d.file_size),
    status: (d.status === 'active' || d.status === 'archived' || d.status === 'pending') ? d.status : 'active',
    filePath: d.file_path,
  };
}

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<DocCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewDoc, setViewDoc] = useState<DocumentItem | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/documents', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erreur de chargement');
      setDocuments((json.data || []).map(toItem));
      const s = json.stats || {};
      setStats({
        total: json.total || s.total || (json.data || []).length,
        active: s.active || 0,
        pending: s.pending || 0,
        archived: s.archived || 0,
      });
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredDocs = documents.filter((doc) => {
    if (activeTab !== 'all' && doc.category !== activeTab) return false;
    if (filterStatus !== 'all' && doc.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return doc.title.toLowerCase().includes(q) || doc.agency.toLowerCase().includes(q) || doc.uploadedBy.toLowerCase().includes(q);
    }
    return true;
  });

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    setUploadMsg('');
    const file = files[0];
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '));
      form.append('category', activeTab === 'all' ? 'rapports' : activeTab);
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erreur de televersement');
      setUploadMsg(`${file.name} televerse avec succes.`);
      setShowUpload(false);
      await load();
    } catch (e: any) {
      setUploadMsg(`Echec du televersement : ${e.message}`);
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [activeTab]);

  async function archiveDoc(doc: DocumentItem) {
    if (doc.status === 'archived') {
      if (!confirm(`Re-activer le document « ${doc.title} » ?`)) return;
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const json = await res.json();
      if (!json.ok) { alert(json.error || 'Action refusée'); return; }
    } else {
      if (!confirm(`Archiver le document « ${doc.title} » ?`)) return;
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      const json = await res.json();
      if (!json.ok) { alert(json.error || 'Action refusée'); return; }
    }
    await load();
  }

  async function deleteDoc(doc: DocumentItem) {
    if (!confirm(`Supprimer definitivement le document « ${doc.title} » ?`)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) { alert(json.error || 'Action refusée'); return; }
    await load();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Subpage Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Documents & Archives</h2>
          <p>Gestion centralisee des courriers, rapports, archives et documents officiels de la SEG</p>
        </div>
        <div className="subpage-filters">
          <button
            className="btn-brand"
            style={{ fontSize: '11.5px', padding: '7px 12px' }}
            onClick={() => setShowUpload(!showUpload)}
          >
            <Upload size={14} />
            <span>Televerser</span>
          </button>
          <button className="btn-brand ghost" style={{ fontSize: '11.5px', padding: '7px 12px' }}>
            <Download size={14} />
            <span>Exporter</span>
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      {showUpload && (
        <div className="users-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="dark-upload-dropzone"
            style={{ margin: 14 }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
          >
            {uploadBusy ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Loader2 size={32} className="spin" style={{ color: '#38bdf8' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Televersement en cours...</p>
              </div>
            ) : (
              <>
                <Upload size={36} style={{ color: '#38bdf8', marginBottom: 10 }} />
                <p style={{ color: 'var(--text-strong)', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  Deposez vos fichiers ici
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  ou cliquez pour selectionner — PDF, DOCX, XLSX, JPG, PNG (max 25 Mo)
                </p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      )}

      {uploadMsg && (
        <div className="db-success-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{uploadMsg}</span>
          <button type="button" onClick={() => setUploadMsg('')} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              <FileText size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Total Documents</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{stats.total}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend info">Base documentaire</span>
            <span className="kpi-period">Toutes categories</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Documents Actifs</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#10b981' }}>{stats.active}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">En cours d'utilisation</span>
            <span className="kpi-period">Valides</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <Clock size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">En Attente</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#f59e0b' }}>{stats.pending}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend warning">A traiter</span>
            <span className="kpi-period">Revue requise</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#c084fc', border: '1px solid rgba(147, 51, 234, 0.3)' }}>
              <FolderOpen size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Archives</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{stats.archived}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend info">Stockage longue duree</span>
            <span className="kpi-period">Consultables</span>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="doc-tabs">
        {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map((key) => {
          const Icon = CATEGORY_ICONS[key];
          return (
            <button
              key={key}
              className={`doc-tab ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={14} />
              <span>{CATEGORY_LABELS[key]}</span>
              {key !== 'all' && (
                <span className="doc-tab-count">{documents.filter((d) => d.category === key).length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <div className="users-card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="users-search" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} />
            <input
              placeholder="Rechercher un document..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={13} style={{ color: 'var(--text-dim)' }} />
            <select
              className="select-dark"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ fontSize: '11.5px', padding: '6px 10px' }}
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="pending">En attente</option>
              <option value="archived">Archive</option>
            </select>
          </div>
          <span style={{ color: 'var(--text-dim)', fontSize: 11.5 }}>
            {filteredDocs.length} document(s)
          </span>
        </div>
      </div>

      {error && (
        <div className="dark-alert-box error" style={{ margin: 0 }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Impossible de charger les documents : {error}.
          </p>
        </div>
      )}

      {/* Documents Table */}
      <div className="users-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Categorie</th>
                <th>Agence / Direction</th>
                <th>Ajoute par</th>
                <th>Date</th>
                <th>Taille</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
                    <Loader2 size={20} className="spin" style={{ color: '#38bdf8', verticalAlign: -4, marginRight: 8 }} />
                    Chargement des documents...
                  </td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
                    Aucun document trouve.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: doc.type === 'PDF' ? 'rgba(239, 68, 68, 0.12)' : doc.type === 'XLSX' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                          color: doc.type === 'PDF' ? '#ef4444' : doc.type === 'XLSX' ? '#10b981' : '#38bdf8',
                          fontSize: 9, fontWeight: 800, flexShrink: 0,
                        }}>
                          {doc.type}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 12.5 }}>{doc.title}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge-pill ${doc.category === 'courriers' ? 'cyan' : doc.category === 'rapports' ? 'green' : doc.category === 'archives' ? 'purple' : 'amber'}`}>
                        {CATEGORY_LABELS[doc.category]}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{doc.agency}</td>
                    <td style={{ fontSize: 12 }}>{doc.uploadedBy}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      <Calendar size={11} style={{ verticalAlign: -1, marginRight: 4, color: 'var(--text-dim)' }} />
                      {formatDateShort(doc.uploadedAt)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{doc.size}</td>
                    <td>
                      <span className={`badge-pill ${doc.status === 'active' ? 'green' : doc.status === 'pending' ? 'amber' : 'purple'}`}>
                        {doc.status === 'active' ? 'Actif' : doc.status === 'pending' ? 'En attente' : 'Archive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button title="Consulter" onClick={() => setViewDoc(doc)}>
                          <Eye size={13} />
                        </button>
                        <a
                          href={doc.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Telecharger"
                          className="row-action-link"
                        >
                          <Download size={13} />
                        </a>
                        <button
                          title={doc.status === 'archived' ? 'Re-activer' : 'Archiver'}
                          style={{ color: doc.status === 'archived' ? '#34d399' : '#c084fc' }}
                          onClick={() => archiveDoc(doc)}
                        >
                          <Archive size={13} />
                        </button>
                        <button title="Supprimer" style={{ color: '#f87171' }} onClick={() => deleteDoc(doc)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Preview Modal */}
      {viewDoc && (
        <div className="doc-modal-overlay" onClick={() => setViewDoc(null)}>
          <div className="doc-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ color: 'var(--text-strong)', fontSize: 15, fontWeight: 700, margin: 0 }}>
                <Eye size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                Apercu du document
              </h3>
              <button onClick={() => setViewDoc(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="doc-modal-body">
              <div className="info-grid" style={{ marginBottom: 16 }}>
                <div>
                  <h4>Titre</h4>
                  <pre style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-strong)' }}>{viewDoc.title}</pre>
                </div>
                <div>
                  <h4>Categorie</h4>
                  <pre style={{ background: 'transparent', border: 'none', padding: 0, color: '#38bdf8' }}>{CATEGORY_LABELS[viewDoc.category]}</pre>
                </div>
                <div>
                  <h4>Agence</h4>
                  <pre style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-strong)' }}>{viewDoc.agency}</pre>
                </div>
                <div>
                  <h4>Ajoute par</h4>
                  <pre style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-strong)' }}>{viewDoc.uploadedBy}</pre>
                </div>
                <div>
                  <h4>Date</h4>
                  <pre style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-strong)' }}>{formatDateShort(viewDoc.uploadedAt)}</pre>
                </div>
                <div>
                  <h4>Taille</h4>
                  <pre style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-strong)' }}>{viewDoc.size}</pre>
                </div>
              </div>
              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                <FileText size={40} style={{ marginBottom: 8, opacity: 0.4 }} />
                <p>Apercu du fichier {viewDoc.type} non disponible en mode preview.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <a
                href={viewDoc.filePath}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ fontSize: 12, padding: '7px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={13} /> Telecharger
              </a>
              <button className="btn-secondary" onClick={() => setViewDoc(null)} style={{ fontSize: 12, padding: '7px 12px' }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <Shield size={16} />
          <span>Politique de conservation documentaire SEG</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Tous les documents officiels sont conservés pendant une durée minimum de 10 ans conformément à la réglementation en vigueur.
          Les archives defitives sont transférées vers le service des archives nationales apres delai de conservation.
        </p>
      </div>
    </div>
  );
}
