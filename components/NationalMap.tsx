'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import {
  Plus,
  Minus,
  Layers,
  Maximize,
  AlertCircle,
  Info,
  Waves,
  RotateCcw,
  MapPin,
  CheckCircle2,
  Activity,
  Droplets,
  Search,
  X,
  Maximize2,
  Minimize2,
  Crosshair,
} from 'lucide-react';

import {
  guineaRegions,
  guineaRivers,
  guineaCities,
  guineaMarkers,
  nationalOutlinePath,
  MAP_CONFIG,
  RegionData,
  MarkerData,
  CityData,
} from '@/lib/guinea-map-data';

import { nationalSummary } from '@/lib/dashboard-data';
import { SegNetworkLayer, SegNetworkLegend, projectToMap, useSegMapSummary, useSegRealMarkers } from '@/components/SegNetworkLayer';

type NationalMapProps = {
  year?: number;
  agency?: string;
};

export function NationalMap({
  year = 2026,
  agency = '',
}: NationalMapProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [selectedMarker, setSelectedMarker] =
    useState<MarkerData | null>(null);

  const [selectedRegion, setSelectedRegion] =
    useState<RegionData | null>(null);

  const [hoveredRegion, setHoveredRegion] =
    useState<RegionData | null>(null);

  const [hoveredMarker, setHoveredMarker] =
    useState<MarkerData | null>(null);

  const [filterType, setFilterType] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');

  const [showRivers, setShowRivers] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showLayersMenu, setShowLayersMenu] =
    useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const realSummary = useSegMapSummary(year);
  const realMarkers = useSegRealMarkers(year);

  /*
   * ============================================================
   * NAVIGATION AMÉLIORÉE + CALQUE RÉSEAU SEG (v5)
   * ============================================================
   */

  const MAP_MAX_ZOOM = 14;
  const [showNetwork, setShowNetwork] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom: zoomLevel, pan };
  const touchRef = useRef<{ x: number; y: number; dist: number; zoom: number } | null>(null);

  // Zoom centré sur un point de l'écran (position de la souris ou centre).
  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const el = containerRef.current;
    const { zoom, pan: current } = viewRef.current;
    const next = Math.max(0.8, Math.min(MAP_MAX_ZOOM, Number((zoom * factor).toFixed(3))));
    if (!el || next === zoom) {
      setZoomLevel(next);
      return;
    }
    const rect = el.getBoundingClientRect();
    const mx = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
    const my = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
    const ratio = next / zoom;
    setPan({ x: mx - (mx - current.x) * ratio, y: my - (my - current.y) * ratio });
    setZoomLevel(next);
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  // Centre la carte sur le Grand Conakry.
  const focusConakry = () => {
    const el = containerRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const s = Math.min(W / MAP_CONFIG.width, H / MAP_CONFIG.height);
    const target = projectToMap(9.64, -13.53);
    const qx = (W - MAP_CONFIG.width * s) / 2 + target.x * s - W / 2;
    const qy = (H - MAP_CONFIG.height * s) / 2 + target.y * s - H / 2;
    const z = 10;
    setZoomLevel(z);
    setPan({ x: -z * qx, y: -z * qy });
  };

  // Plein écran (API Fullscreen, avec repli en superposition).
  const toggleFullscreen = () => {
    const el = cardRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setIsFullscreen((v) => !v));
    } else {
      setIsFullscreen((v) => !v);
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === cardRef.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Molette : écouteur natif non passif (le zoom ne fait plus défiler la page).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAtRef.current(e.deltaY > 0 ? 1 / 1.2 : 1.2, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Variable CSS utilisée pour garder des traits fins quand on zoome.
  useEffect(() => {
    containerRef.current?.style.setProperty('--map-zoom', String(zoomLevel));
  }, [zoomLevel]);

  // Tactile : un doigt = déplacer, deux doigts = zoomer.
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { x: t.clientX - pan.x, y: t.clientY - pan.y, dist: 0, zoom: zoomLevel };
    } else if (e.touches.length === 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      touchRef.current = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: zoomLevel,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (e.touches.length === 1 && start.dist === 0) {
      const t = e.touches[0];
      setIsDragging(true);
      setPan({ x: t.clientX - start.x, y: t.clientY - start.y });
    } else if (e.touches.length === 2 && start.dist > 0) {
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const target = Math.max(0.8, Math.min(MAP_MAX_ZOOM, (start.zoom * dist) / start.dist));
      zoomAt(target / viewRef.current.zoom, start.x, start.y);
    }
  };

  const handleTouchEnd = () => {
    touchRef.current = null;
    setIsDragging(false);
  };

  /*
   * ============================================================
   * CONTEXTE DU FILTRE GLOBAL
   * ============================================================
   */

  const filterContextLabel = agency
    ? `Agence : ${agency}`
    : 'Toutes les agences';

  /*
   * ============================================================
   * ZOOM / PAN
   * ============================================================
   */

  const handleZoomIn = () => {
    zoomAt(1.4);
  };

  const handleZoomOut = () => {
    zoomAt(1 / 1.4);
  };

  const handleReset = () => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
    setSelectedRegion(null);
    setSelectedMarker(null);
    setRegionFilter('all');
  };

  /*
   * ============================================================
   * SOURIS / DÉPLACEMENT DE LA CARTE
   * ============================================================
   */

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    setIsDragging(true);

    setDragStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const zoomDelta = e.deltaY > 0 ? -0.15 : 0.15;

    setZoomLevel((prev) => {
      const next = Math.max(
        0.8,
        Math.min(3.0, prev + zoomDelta)
      );

      return Number(next.toFixed(2));
    });
  };

  /*
   * ============================================================
   * COULEURS DES MARQUEURS
   * ============================================================
   */

  const getMarkerColor = (type: MarkerData['type']) => {
    switch (type) {
      case 'direction':
        return '#2563eb';

      case 'agence':
        return '#10b981';

      case 'pompage':
        return '#06b6d4';

      case 'reservoir':
        return '#3b82f6';

      case 'incident':
        return '#ef4444';

      case 'mission':
        return '#f59e0b';

      default:
        return '#38bdf8';
    }
  };

  const getMarkerLabel = (type: MarkerData['type']) => {
    switch (type) {
      case 'direction':
        return 'Direction Régionale';

      case 'agence':
        return 'Agence Commerciale / Centre';

      case 'pompage':
        return 'Station de Pompage / Usine';

      case 'reservoir':
        return 'Réservoir / Château d’Eau';

      case 'incident':
        return 'Incident ou arrêt de production déclaré';

      case 'mission':
        return 'Mission déclarée';

      default:
        return 'Infrastructure';
    }
  };

  /*
   * ============================================================
   * FILTRE INTERNE DES MARQUEURS
   * ============================================================
   *
   * Ces filtres sont propres à la carte.
   * Ils ne remplacent pas les filtres globaux du Dashboard.
   */

  const filteredMarkers = useMemo(() => {
    // Directions et agences du référentiel cartographique + marqueurs RÉELS
    // (stations des centres, station de Yessoulou, 14 réservoirs de Conakry).
    // Les stations, réservoirs, incidents et équipes de démonstration ne sont plus affichés.
    const markers: MarkerData[] = [
      ...guineaMarkers.filter((m) => m.type === 'direction' || m.type === 'agence'),
      ...(realMarkers as MarkerData[]),
    ];
    return markers.filter((marker) => {
      const matchesType =
        filterType === 'all' ||
        marker.type === filterType;

      const matchesRegion =
        regionFilter === 'all' ||
        marker.region.toLowerCase() ===
          regionFilter.toLowerCase();

      return matchesType && matchesRegion;
    });
  }, [filterType, regionFilter, realMarkers]);

  /*
   * ============================================================
   * SÉLECTION D'UNE RÉGION
   * ============================================================
   */

  const handleRegionClick = (region: RegionData) => {
    if (selectedRegion?.id === region.id) {
      setSelectedRegion(null);
      setRegionFilter('all');
    } else {
      setSelectedRegion(region);
      setRegionFilter(region.name);

      setZoomLevel(1.4);

      const [cx, cy] = region.centroid;

      const targetX =
        (MAP_CONFIG.width / 2 - cx) * 0.9;

      const targetY =
        (MAP_CONFIG.height / 2 - cy) * 0.9;

      setPan({
        x: targetX,
        y: targetY,
      });
    }
  };

  /*
   * ============================================================
   * RESET AUTOMATIQUE SI LE CONTEXTE GLOBAL CHANGE
   * ============================================================
   *
   * Lorsqu'on change d'agence ou d'année depuis le Dashboard,
   * on ferme les sélections locales qui pourraient devenir
   * trompeuses.
   */

  const resetLocalSelection = () => {
    setSelectedRegion(null);
    setSelectedMarker(null);
    setRegionFilter('all');
  };

  /*
   * ============================================================
   * RENDU
   * ============================================================
   */

  return (
    <div
      ref={cardRef}
      className="dashboard-card map-card-container"
      style={{
        position: 'relative',
        ...(isFullscreen
          ? {
              position: 'fixed' as const,
              inset: 0,
              zIndex: 1000,
              margin: 0,
              borderRadius: 0,
              overflow: 'auto' as const,
              background: 'var(--bg-main, #060e1a)',
            }
          : {}),
      }}
    >
      {/* ======================================================
          HEADER
          ====================================================== */}

      <div
        className="card-header-flex"
        style={{
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
          }}
        >
          <h3>
            Carte Nationale de la Guinée - Réseau SEG
          </h3>

          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              padding: '2px 8px',
              borderRadius: '12px',
              border:
                '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#10b981',
                display: 'inline-block',
              }}
            />

            SIG Géoréférencé
          </span>
        </div>

        {/* ====================================================
            CONTEXTE GLOBAL
            ==================================================== */}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              padding: '4px 8px',
              borderRadius: '999px',
              background: 'rgba(37, 99, 235, 0.12)',
              border:
                '1px solid rgba(37, 99, 235, 0.25)',
              color: '#60a5fa',
              fontWeight: 700,
            }}
          >
            Exercice {year}
          </span>

          <span
            style={{
              fontSize: '10px',
              padding: '4px 8px',
              borderRadius: '999px',
              background: agency
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(148, 163, 184, 0.10)',
              border: agency
                ? '1px solid rgba(16, 185, 129, 0.25)'
                : '1px solid rgba(148, 163, 184, 0.18)',
              color: agency
                ? '#34d399'
                : '#94a3b8',
              fontWeight: 700,
              maxWidth: '220px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={filterContextLabel}
          >
            {filterContextLabel}
          </span>
        </div>

        {/* ====================================================
            TOOLBAR
            ==================================================== */}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {/* Région */}

          <select
            className="select-dark"
            value={regionFilter}
            onChange={(e) => {
              const val = e.target.value;

              if (val === 'all') {
                resetLocalSelection();
                return;
              }

              const found = guineaRegions.find(
                (region) =>
                  region.name.toLowerCase() ===
                  val.toLowerCase()
              );

              if (found) {
                handleRegionClick(found);
              }
            }}
            style={{
              padding: '4px 8px',
              fontSize: '11.5px',
              height: '28px',
              background: 'var(--bg-inner)',
              border:
                '1px solid var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '6px',
            }}
          >
            <option value="all">
              Toutes les Régions (8)
            </option>

            {guineaRegions.map((region) => (
              <option
                key={region.id}
                value={region.name}
              >
                {region.name} ({region.naturalRegion})
              </option>
            ))}
          </select>

          {/* Type infrastructure */}

          <select
            className="select-dark"
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value)
            }
            style={{
              padding: '4px 8px',
              fontSize: '11.5px',
              height: '28px',
              background: 'var(--bg-inner)',
              border:
                '1px solid var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '6px',
            }}
          >
            <option value="all">
              Toutes les Infrastructures
            </option>

            <option value="direction">
              Directions Régionales
            </option>

            <option value="agence">
              Agences & Centres
            </option>

            <option value="pompage">
              Stations de production
            </option>

            <option value="reservoir">
              Réservoirs (Conakry)
            </option>

            <option value="incident">
              Incidents & arrêts déclarés
            </option>

            <option value="mission">
              Missions déclarées
            </option>
          </select>
        </div>
      </div>

      {/* ======================================================
          MAP VIEWPORT
          ====================================================== */}

      <div
        ref={containerRef}
        className={`map-viewport${zoomLevel > 1.6 ? ' seg-map-zoomed' : ''}`}
        style={{
          cursor: isDragging
            ? 'grabbing'
            : 'grab',
          userSelect: 'none',
          position: 'relative',
          touchAction: 'none',
          ...(isFullscreen ? { height: 'calc(100vh - 120px)' } : {}),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* ====================================================
            CONTRÔLES
            ==================================================== */}

        <div className="map-controls">
          <button
            className="map-ctrl-btn"
            onClick={handleZoomIn}
            title="Zoom avant (+)"
          >
            <Plus size={15} />
          </button>

          <button
            className="map-ctrl-btn"
            onClick={handleZoomOut}
            title="Zoom arrière (-)"
          >
            <Minus size={15} />
          </button>

          <button
            className="map-ctrl-btn"
            onClick={handleReset}
            title="Réinitialiser la carte"
          >
            <RotateCcw size={13} />
          </button>

          <button
            className="map-ctrl-btn"
            onClick={focusConakry}
            title="Zoomer sur le Grand Conakry"
          >
            <Crosshair size={13} />
          </button>

          <button
            className="map-ctrl-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            className={`map-ctrl-btn ${
              showLayersMenu ? 'active' : ''
            }`}
            title="Afficher les calques"
            onClick={() =>
              setShowLayersMenu(
                !showLayersMenu
              )
            }
            style={{
              background: showLayersMenu
                ? '#1e3a8a'
                : undefined,
            }}
          >
            <Layers size={13} />
          </button>
        </div>

        {/* ====================================================
            MENU CALQUES
            ==================================================== */}

        {showLayersMenu && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 48,
              background:
                'rgba(8, 20, 36, 0.95)',
              border:
                '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              zIndex: 35,
              backdropFilter: 'blur(10px)',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              width: '180px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom:
                  '1px solid rgba(255,255,255,0.08)',
                paddingBottom: '4px',
              }}
            >
              Calques SIG
            </div>

            <label
              style={{
                fontSize: '11px',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showRivers}
                onChange={(e) =>
                  setShowRivers(
                    e.target.checked
                  )
                }
              />

              Fleuves & Rivières
            </label>

            <label
              style={{
                fontSize: '11px',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) =>
                  setShowLabels(
                    e.target.checked
                  )
                }
              />

              Villes & Préfectures
            </label>

            <label
              style={{
                fontSize: '11px',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showNetwork}
                onChange={(e) => setShowNetwork(e.target.checked)}
              />
              Réseau SEG (schéma)
            </label>
          </div>
        )}

        {showNetwork && <SegNetworkLegend />}

        <style>{`
          .seg-map-zoomed svg path:not(.seg-net) { stroke-width: calc(1.4px / var(--map-zoom, 1)); }
          .seg-map-zoomed svg circle:not(.seg-net) { stroke-width: calc(1.2px / var(--map-zoom, 1)); r: calc(6.5px / var(--map-zoom, 1)); }
          .seg-map-zoomed svg text:not(.seg-net) { font-size: calc(15px / var(--map-zoom, 1)); }
        `}</style>

        {/* ====================================================
            CONTEXTE FILTRE
            ==================================================== */}

        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 20,
            background:
              'rgba(8, 20, 36, 0.92)',
            border:
              '1px solid rgba(56, 189, 248, 0.20)',
            borderRadius: '7px',
            padding: '7px 10px',
            backdropFilter: 'blur(8px)',
            boxShadow:
              '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              fontSize: '9px',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 800,
            }}
          >
            Contexte des données
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 3,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#10b981',
              }}
            />

            <span
              style={{
                fontSize: '10.5px',
                color: '#e2e8f0',
                fontWeight: 700,
              }}
            >
              {year} · {filterContextLabel}
            </span>
          </div>
        </div>

        {/* ====================================================
            RÉSUMÉ NATIONAL
            ==================================================== */}

        <div className="map-summary-box">
          <h4>› Résumé National SEG</h4>

          {realSummary.length === 0 && (
            <div className="summary-row" style={{ fontSize: '10.5px', color: '#94a3b8' }}>Chargement…</div>
          )}
          {realSummary.map((item) => (
            <div key={item.label} className="summary-row" title={`Source : ${item.source}`}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="summary-dot" style={{ backgroundColor: item.color }} />
                <span style={{ fontSize: '10.5px' }}>{item.label}</span>
              </div>
              <strong style={{ color: '#ffffff' }}>{item.value}</strong>
            </div>
          ))}
        </div>

        {/* ====================================================
            LÉGENDE
            ==================================================== */}

        <div className="map-legend-box">
          <div
            className="legend-item"
            style={{
              cursor: 'pointer',
              opacity:
                filterType === 'all' ||
                filterType === 'direction'
                  ? 1
                  : 0.4,
            }}
            onClick={() =>
              setFilterType(
                filterType === 'direction'
                  ? 'all'
                  : 'direction'
              )
            }
          >
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#2563eb',
              }}
            />

            <span>
              Directions Régionales
            </span>
          </div>

          <div
            className="legend-item"
            style={{
              cursor: 'pointer',
              opacity:
                filterType === 'all' ||
                filterType === 'agence'
                  ? 1
                  : 0.4,
            }}
            onClick={() =>
              setFilterType(
                filterType === 'agence'
                  ? 'all'
                  : 'agence'
              )
            }
          >
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#10b981',
              }}
            />

            <span>
              Agences / Centres
            </span>
          </div>

          <div
            className="legend-item"
            style={{
              cursor: 'pointer',
              opacity:
                filterType === 'all' ||
                filterType === 'pompage'
                  ? 1
                  : 0.4,
            }}
            onClick={() =>
              setFilterType(
                filterType === 'pompage'
                  ? 'all'
                  : 'pompage'
              )
            }
          >
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#06b6d4',
              }}
            />

            <span>
              Stations de production
            </span>
          </div>

          <div
            className="legend-item"
            style={{
              cursor: 'pointer',
              opacity:
                filterType === 'all' ||
                filterType === 'reservoir'
                  ? 1
                  : 0.4,
            }}
            onClick={() =>
              setFilterType(
                filterType === 'reservoir'
                  ? 'all'
                  : 'reservoir'
              )
            }
          >
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#3b82f6',
              }}
            />

            <span>
              Réservoirs (Conakry)
            </span>
          </div>

          <div
            className="legend-item"
            style={{
              cursor: 'pointer',
              opacity:
                filterType === 'all' ||
                filterType === 'incident'
                  ? 1
                  : 0.4,
            }}
            onClick={() =>
              setFilterType(
                filterType === 'incident'
                  ? 'all'
                  : 'incident'
              )
            }
          >
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#ef4444',
              }}
            />

            <span>
              Incidents & arrêts déclarés
            </span>
          </div>

          <div
            className="legend-item"
            style={{
              cursor: 'pointer',
              opacity:
                filterType === 'all' ||
                filterType === 'mission'
                  ? 1
                  : 0.4,
            }}
            onClick={() =>
              setFilterType(
                filterType === 'mission'
                  ? 'all'
                  : 'mission'
              )
            }
          >
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#f59e0b',
              }}
            />

            <span>
              Missions déclarées
            </span>
          </div>
        </div>

        {/* ====================================================
            RÉGION SÉLECTIONNÉE
            ==================================================== */}

        {selectedRegion && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 54,
              background:
                'rgba(8, 20, 36, 0.95)',
              border:
                `1px solid ${selectedRegion.color}`,
              borderRadius: '8px',
              padding: '10px 14px',
              backdropFilter: 'blur(8px)',
              zIndex: 25,
              minWidth: '220px',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color:
                    selectedRegion.color,
                }}
              >
                Région : {selectedRegion.name}
              </span>

              <button
                onClick={() => {
                  setSelectedRegion(null);
                  setRegionFilter('all');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              {selectedRegion.naturalRegion}
            </div>

            <div
              style={{
                fontSize: '10px',
                color: '#94a3b8',
                marginTop: 2,
              }}
            >
              {selectedRegion.prefectures}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap: '6px',
                marginTop: '8px',
                paddingTop: '6px',
                borderTop:
                  '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '9.5px',
                    color: '#64748b',
                  }}
                >
                  Abonnés
                </span>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#38bdf8',
                  }}
                >
                  {selectedRegion.subscribers.toLocaleString(
                    'fr-FR'
                  )}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '9.5px',
                    color: '#64748b',
                  }}
                >
                  Production
                </span>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#10b981',
                  }}
                >
                  {selectedRegion.production}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '9.5px',
                    color: '#64748b',
                  }}
                >
                  Recouvrement
                </span>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#f59e0b',
                  }}
                >
                  {selectedRegion.recovery}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '9.5px',
                    color: '#64748b',
                  }}
                >
                  Centres SEG
                </span>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {selectedRegion.centers} actifs
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            MARQUEUR SÉLECTIONNÉ
            ==================================================== */}

        {selectedMarker && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              background:
                'rgba(8, 20, 36, 0.95)',
              border:
                `1px solid ${getMarkerColor(
                  selectedMarker.type
                )}`,
              borderRadius: '8px',
              padding: '12px 16px',
              backdropFilter: 'blur(8px)',
              zIndex: 30,
              maxWidth: '260px',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color:
                    getMarkerColor(
                      selectedMarker.type
                    ),
                }}
              >
                {getMarkerLabel(
                  selectedMarker.type
                )}
              </span>

              <button
                onClick={() =>
                  setSelectedMarker(null)
                }
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              {selectedMarker.name}
            </div>

            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                marginTop: 3,
              }}
            >
              Secteur :{' '}
              <strong
                style={{
                  color: '#cbd5e1',
                }}
              >
                {selectedMarker.location}
              </strong>
            </div>

            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                marginTop: 1,
              }}
            >
              Région : {selectedMarker.region}
            </div>

            <div
              style={{
                fontSize: '11px',
                color: '#38bdf8',
                marginTop: 5,
                fontWeight: 600,
              }}
            >
              Statut : {selectedMarker.status}
            </div>

            <div
              style={{
                fontSize: '9.5px',
                color: '#64748b',
                marginTop: 4,
              }}
            >
              GPS :{' '}
              {selectedMarker.lat.toFixed(4)}
              °N,{' '}
              {Math.abs(
                selectedMarker.lon
              ).toFixed(4)}
              °W
            </div>
          </div>
        )}

        {/* ====================================================
            RÉGION SURVOLÉE
            ==================================================== */}

        {hoveredRegion &&
          !selectedRegion && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 54,
                background:
                  'rgba(15, 23, 42, 0.9)',
                border:
                  `1px solid ${hoveredRegion.color}`,
                padding: '4px 10px',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                pointerEvents: 'none',
                zIndex: 25,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    hoveredRegion.color,
                }}
              />

              Région de{' '}
              {hoveredRegion.name} (
              {hoveredRegion.naturalRegion})
              {' • '}
              {hoveredRegion.subscribers.toLocaleString(
                'fr-FR'
              )}{' '}
              abonnés
            </div>
          )}

        {/* ====================================================
            SVG MAP
            ==================================================== */}

        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            transform:
              `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            transformOrigin:
              'center center',
            transition: isDragging
              ? 'none'
              : 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          <svg
            viewBox={MAP_CONFIG.viewBox}
            style={{
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}
          >
            <defs>
              {/* Country Border Glow */}

              <filter
                id="borderGlow"
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="3"
                  floodColor="#38bdf8"
                  floodOpacity="0.4"
                />
              </filter>

              {/* Region Hover Glow */}

              <filter
                id="regionGlow"
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="4"
                  floodColor="#06b6d4"
                  floodOpacity="0.6"
                />
              </filter>

              {/* River Gradient */}

              <linearGradient
                id="riverGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor="#06b6d4"
                  stopOpacity="0.85"
                />

                <stop
                  offset="50%"
                  stopColor="#0284c7"
                  stopOpacity="0.7"
                />

                <stop
                  offset="100%"
                  stopColor="#3b82f6"
                  stopOpacity="0.85"
                />
              </linearGradient>

              {/* Terrain */}

              <radialGradient
                id="satelliteBg"
                cx="45%"
                cy="50%"
                r="55%"
              >
                <stop
                  offset="0%"
                  stopColor="#0a2233"
                  stopOpacity="0.9"
                />

                <stop
                  offset="50%"
                  stopColor="#071927"
                  stopOpacity="0.95"
                />

                <stop
                  offset="100%"
                  stopColor="#040e17"
                  stopOpacity="0.98"
                />
              </radialGradient>

              {/* Technical Grid */}

              <pattern
                id="gridOverlay"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.04)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            {/* Grid */}

            <rect
              width={MAP_CONFIG.width}
              height={MAP_CONFIG.height}
              fill="url(#gridOverlay)"
            />

            {/* =================================================
                RÉGIONS DE GUINÉE
                ================================================= */}

            <g id="guinea-regions">
              {guineaRegions.map((region) => {
                const isSelected =
                  selectedRegion?.id ===
                  region.id;

                const isHovered =
                  hoveredRegion?.id ===
                  region.id;

                const isDimmed =
                  !!selectedRegion &&
                  !isSelected;

                return (
                  <path
                    key={region.id}
                    d={region.path}
                    fill={
                      isSelected
                        ? 'rgba(14, 116, 144, 0.45)'
                        : isHovered
                          ? 'rgba(8, 47, 73, 0.7)'
                          : 'url(#satelliteBg)'
                    }
                    stroke={
                      isSelected
                        ? '#38bdf8'
                        : isHovered
                          ? '#06b6d4'
                          : 'rgba(56, 189, 248, 0.28)'
                    }
                    strokeWidth={
                      isSelected
                        ? '2'
                        : isHovered
                          ? '1.5'
                          : '1'
                    }
                    filter={
                      isSelected ||
                      isHovered
                        ? 'url(#regionGlow)'
                        : undefined
                    }
                    opacity={
                      isDimmed ? 0.35 : 1
                    }
                    style={{
                      cursor: 'pointer',
                      transition:
                        'fill 0.2s, stroke 0.2s, opacity 0.2s',
                    }}
                    onMouseEnter={() =>
                      setHoveredRegion(
                        region
                      )
                    }
                    onMouseLeave={() =>
                      setHoveredRegion(null)
                    }
                    onClick={() =>
                      handleRegionClick(
                        region
                      )
                    }
                  />
                );
              })}
            </g>

            {/* =================================================
                PÉRIMÈTRE NATIONAL
                ================================================= */}

            <path
              d={nationalOutlinePath}
              fill="none"
              stroke="#0284c7"
              strokeWidth="2.2"
              filter="url(#borderGlow)"
              pointerEvents="none"
            />

            {/* =================================================
                FLEUVES
                ================================================= */}

            {showRivers && (
              <g
                id="guinea-rivers"
                pointerEvents="none"
              >
                {guineaRivers.map(
                  (river) => (
                    <g key={river.id}>
                      <path
                        d={river.path}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="3.5"
                        strokeOpacity="0.25"
                        strokeLinecap="round"
                      />

                      <path
                        d={river.path}
                        fill="none"
                        stroke="url(#riverGrad)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </g>
                  )
                )}
              </g>
            )}

            {/* =================================================
                LABELS RÉGIONAUX
                ================================================= */}

            <g
              id="region-labels"
              pointerEvents="none"
            >
              {guineaRegions.map(
                (region) => {
                  const [cx, cy] =
                    region.centroid;

                  return (
                    <text
                      key={`lbl-${region.id}`}
                      x={cx}
                      y={cy}
                      fill="rgba(148, 163, 184, 0.4)"
                      fontSize="13"
                      fontWeight="800"
                      textAnchor="middle"
                      letterSpacing="0.1em"
                      style={{
                        textTransform:
                          'uppercase',
                      }}
                    >
                      {region.name}
                    </text>
                  );
                }
              )}
            </g>

            {/* =================================================
                VILLES
                ================================================= */}

            {showLabels && (
              <g id="guinea-cities">
                {guineaCities.map(
                  (city: CityData) => {
                    const isCapital =
                      city.isCapital;

                    return (
                      <g
                        key={city.id}
                        transform={`translate(${city.x}, ${city.y})`}
                        style={{
                          pointerEvents:
                            'none',
                        }}
                      >
                        {isCapital ? (
                          <>
                            <circle
                              r="7"
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="1.5"
                              opacity="0.6"
                            >
                              <animate
                                attributeName="r"
                                values="6;10;6"
                                dur="2.5s"
                                repeatCount="indefinite"
                              />

                              <animate
                                attributeName="opacity"
                                values="0.6;0.1;0.6"
                                dur="2.5s"
                                repeatCount="indefinite"
                              />
                            </circle>

                            <circle
                              r="4.5"
                              fill="#ffffff"
                              stroke="#081424"
                              strokeWidth="1.5"
                            />
                          </>
                        ) : (
                          <circle
                            r={
                              city.isRegionalCapital
                                ? 3.5
                                : 2.5
                            }
                            fill={
                              city.isRegionalCapital
                                ? '#ffffff'
                                : '#94a3b8'
                            }
                            stroke="#081424"
                            strokeWidth="1"
                          />
                        )}

                        <text
                          x={
                            isCapital
                              ? -10
                              : 7
                          }
                          y={
                            isCapital
                              ? -8
                              : 3
                          }
                          fill={
                            isCapital
                              ? '#ffffff'
                              : city.isRegionalCapital
                                ? '#e2e8f0'
                                : '#94a3b8'
                          }
                          fontSize={
                            isCapital
                              ? '12.5'
                              : city.isRegionalCapital
                                ? '10.5'
                                : '9.5'
                          }
                          fontWeight={
                            isCapital
                              ? '800'
                              : city.isRegionalCapital
                                ? '700'
                                : '500'
                          }
                          textAnchor={
                            isCapital
                              ? 'end'
                              : 'start'
                          }
                          style={{
                            textShadow:
                              '0 1px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.95)',
                            fontFamily:
                              'inherit',
                          }}
                        >
                          {city.name}
                        </text>
                      </g>
                    );
                  }
                )}
              </g>
            )}

            {/* =================================================
                RÉSEAU SEG (tracé schématique)
                ================================================= */}

            <SegNetworkLayer zoom={zoomLevel} visible={showNetwork} />

            {/* =================================================
                MARQUEURS SEG
                ================================================= */}

            <g id="seg-markers">
              {filteredMarkers.map(
                (marker) => {
                  const color =
                    getMarkerColor(
                      marker.type
                    );

                  const isIncident =
                    marker.type ===
                    'incident';

                  const isMission =
                    marker.type ===
                    'mission';

                  const isSelected =
                    selectedMarker?.id ===
                    marker.id;

                  const isHovered =
                    hoveredMarker?.id ===
                    marker.id;

                  return (
                    <g
                      key={marker.id}
                      transform={`translate(${marker.x}, ${marker.y})`}
                      style={{
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();

                        setSelectedMarker(
                          marker
                        );
                      }}
                      onMouseEnter={() =>
                        setHoveredMarker(
                          marker
                        )
                      }
                      onMouseLeave={() =>
                        setHoveredMarker(
                          null
                        )
                      }
                    >
                      {/* Incident */}

                      {isIncident && (
                        <circle
                          r="14"
                          fill="#ef4444"
                          opacity="0.25"
                        >
                          <animate
                            attributeName="r"
                            values="8;22;8"
                            dur="1.8s"
                            repeatCount="indefinite"
                          />

                          <animate
                            attributeName="opacity"
                            values="0.45;0;0.45"
                            dur="1.8s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}

                      {/* Mission */}

                      {isMission && (
                        <circle
                          r="10"
                          fill="#f59e0b"
                          opacity="0.25"
                        >
                          <animate
                            attributeName="r"
                            values="6;16;6"
                            dur="2.2s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}

                      {/* Sélection */}

                      {isSelected && (
                        <circle
                          r="12"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          strokeDasharray="2 2"
                        />
                      )}

                      {/* Halo */}

                      <circle
                        r={
                          isHovered
                            ? '8'
                            : '6'
                        }
                        fill={color}
                        fillOpacity={
                          isHovered
                            ? 0.5
                            : 0.25
                        }
                        stroke={color}
                        strokeWidth="1.2"
                      />

                      {/* Point */}

                      <circle
                        r={
                          isHovered
                            ? '5'
                            : '4'
                        }
                        fill={color}
                        stroke="#ffffff"
                        strokeWidth="1.2"
                      />
                    </g>
                  );
                }
              )}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
