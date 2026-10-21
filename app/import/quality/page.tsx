'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  TriangleAlert,
  AlertCircle,
  Info,
  RefreshCw,
  FileWarning,
  Database,
  CheckCircle2,
} from 'lucide-react';

type Issue = {
  id: number;
  severity: string;
  category: string;
  message: string;
  sheet: string | null;
  issueType: string | null;
  excelRow: number | null;
  sourceValue: string | null;
  field: string | null;
  createdAt: string | null;
  importId: number | null;
  fileName: string | null;
};

type QualityCounts = {
  critical?: number | null;
  warning?: number | null;
  info?: number | null;
  total?: number | null;
};

export default function ImportQualityPage() {
  const [counts, setCounts] = useState<QualityCounts | null>(null);
  const [list, setList] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const r = await fetch('/api/quality?resolved=0', {
        cache: 'no-store',
      });

      const j = await r.json();

      if (!r.ok || !j.ok) {
        throw new Error(j.error || 'Erreur de chargement des anomalies.');
      }

      setCounts(j.data?.counts ?? {});
      setList(Array.isArray(j.data?.list) ? j.data.list : []);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : 'Erreur de chargement des données.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /*
   * Normalisation défensive :
   * on ne dépend pas d'une éventuelle valeur
   * undefined / null / string renvoyée par l'API.
   */
  const metrics = useMemo(() => {
    const critical = Number(counts?.critical ?? 0);
    const warning = Number(counts?.warning ?? 0);
    const info = Number(counts?.info ?? 0);

    const safeCritical = Number.isFinite(critical) ? critical : 0;
    const safeWarning = Number.isFinite(warning) ? warning : 0;
    const safeInfo = Number.isFinite(info) ? info : 0;

    const calculatedTotal =
      safeCritical + safeWarning + safeInfo;

    const apiTotal = Number(counts?.total ?? calculatedTotal);

    const total =
      Number.isFinite(apiTotal) && apiTotal >= 0
        ? apiTotal
        : calculatedTotal;

    const score =
      total === 0
        ? 100
        : Math.max(
            0,
            Math.min(
              100,
              Math.round(
                100 -
                  (
                    safeCritical * 100 +
                    safeWarning * 40
                  ) /
                    Math.max(total, 1)
              )
            )
          );

    return {
      critical: safeCritical,
      warning: safeWarning,
      info: safeInfo,
      total,
      score,
    };
  }, [counts]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Fil d'Ariane */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--text-dim)',
        }}
      >
        <Link
          href="/import"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <ArrowLeft size={14} />
          Import des données
        </Link>

        <span>›</span>

        <span style={{ color: 'var(--text-muted)' }}>
          Qualité des données
        </span>
      </div>

      {/* En-tête */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Qualité des données</h2>
          <p>
            État général des anomalies détectées lors des imports Excel SEG.
          </p>
        </div>

        <button
          className="btn-brand ghost"
          onClick={load}
          disabled={loading}
          type="button"
        >
          <RefreshCw
            size={16}
            style={{
              animation: loading
                ? 'spin 1s linear infinite'
                : undefined,
            }}
          />
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      {/* Erreur */}
      {error && (
        <div className="dark-alert-box danger">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <TriangleAlert size={18} />
            <p
              style={{
                fontSize: '12.5px',
                color: '#ef4444',
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Résumé qualité */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <div>
            <h3>Score / état général de qualité</h3>
            <p
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: 'var(--text-dim)',
              }}
            >
              Évaluation basée uniquement sur les anomalies non résolues.
            </p>
          </div>

          <span className="badge-pill green">
            {metrics.total} anomalie
            {metrics.total > 1 ? 's' : ''} détectée
            {metrics.total > 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div
            style={{
              color: 'var(--text-dim)',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            Chargement…
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '28px',
              padding: '8px 4px',
              flexWrap: 'wrap',
            }}
          >
            {/* Score */}
            <div
              style={{
                textAlign: 'center',
                minWidth: '120px',
              }}
            >
              <div
                style={{
                  fontSize: '52px',
                  fontWeight: 800,
                  color:
                    metrics.score >= 90
                      ? '#10b981'
                      : metrics.score >= 70
                        ? '#f59e0b'
                        : '#ef4444',
                  lineHeight: 1,
                }}
              >
                {metrics.score}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginTop: '6px',
                }}
              >
                / 100
              </div>
            </div>

            {/* KPI */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px',
                flex: 1,
                minWidth: '280px',
              }}
            >
              <div
                className="kpi-card"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#ef4444',
                    fontWeight: 700,
                  }}
                >
                  <TriangleAlert size={16} />
                  Critiques
                </div>

                <div
                  className="kpi-main-val"
                  style={{
                    fontSize: '26px',
                    color: '#ef4444',
                    marginTop: 6,
                  }}
                >
                  {metrics.critical}
                </div>
              </div>

              <div
                className="kpi-card"
                style={{
                  background: 'rgba(245,158,11,0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#f59e0b',
                    fontWeight: 700,
                  }}
                >
                  <AlertCircle size={16} />
                  Avertissements
                </div>

                <div
                  className="kpi-main-val"
                  style={{
                    fontSize: '26px',
                    color: '#f59e0b',
                    marginTop: 6,
                  }}
                >
                  {metrics.warning}
                </div>
              </div>

              <div
                className="kpi-card"
                style={{
                  background: 'rgba(56,189,248,0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#38bdf8',
                    fontWeight: 700,
                  }}
                >
                  <Info size={16} />
                  Informations
                </div>

                <div
                  className="kpi-main-val"
                  style={{
                    fontSize: '26px',
                    color: '#38bdf8',
                    marginTop: 6,
                  }}
                >
                  {metrics.info}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Liste des anomalies */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <div>
            <h3>Liste des anomalies</h3>
            <p
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: 'var(--text-dim)',
              }}
            >
              Contrôles issus des imports réels de données SEG.
            </p>
          </div>

          <span className="badge-pill amber">
            {list.length} non résolue
            {list.length > 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div
            style={{
              color: 'var(--text-dim)',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            Chargement…
          </div>
        ) : list.length === 0 ? (
          <div
            style={{
              color: '#10b981',
              padding: '30px',
              textAlign: 'center',
              fontSize: '13px',
            }}
          >
            <CheckCircle2
              size={28}
              style={{
                display: 'block',
                margin: '0 auto 8px',
              }}
            />
            Aucune anomalie non résolue.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              className="data-table"
              style={{
                width: '100%',
                minWidth: '980px',
                borderCollapse: 'collapse',
                fontSize: '12.5px',
              }}
            >
              <thead>
                <tr
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    borderBottom:
                      '1px solid var(--border-color)',
                  }}
                >
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                    }}
                  >
                    Type
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                    }}
                  >
                    Catégorie
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                    }}
                  >
                    Feuille
                  </th>

                  <th
                    style={{
                      textAlign: 'right',
                      padding: '10px',
                    }}
                  >
                    Ligne
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                    }}
                  >
                    Valeur source
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                    }}
                  >
                    Message
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                    }}
                  >
                    Import
                  </th>
                </tr>
              </thead>

              <tbody>
                {list.map((a) => (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom:
                        '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <td style={{ padding: '10px' }}>
                      <span
                        className={`badge-pill ${
                          a.severity === 'critical'
                            ? 'red'
                            : a.severity === 'warning'
                              ? 'amber'
                              : 'cyan'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {a.severity}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.category || '—'}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {a.sheet || '—'}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {a.excelRow ?? '—'}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        color: 'var(--text-secondary)',
                        maxWidth: 220,
                      }}
                    >
                      {a.sourceValue || '—'}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        color: 'var(--text-secondary)',
                        minWidth: 360,
                      }}
                    >
                      <div>{a.message}</div>

                      {a.issueType && (
                        <div
                          style={{
                            marginTop: '4px',
                            fontSize: '10px',
                            color: 'var(--text-dim)',
                          }}
                        >
                          Code : {a.issueType}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px' }}>
                      {a.fileName && a.importId ? (
                        <Link
                          href={`/import/${a.importId}`}
                          className="notif-link-btn"
                          style={{
                            color: '#38bdf8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <FileWarning size={13} />
                          #{a.importId}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Information source */}
      <div
        className="dashboard-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Database
          size={20}
          style={{ color: '#38bdf8', flexShrink: 0 }}
        />

        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Contrôle qualité SEG CONNECT
          </div>

          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-dim)',
              marginTop: '3px',
            }}
          >
            Les anomalies affichées correspondent aux contrôles
            enregistrés dans la base de données des imports.
          </div>
        </div>
      </div>
    </div>
  );
}
