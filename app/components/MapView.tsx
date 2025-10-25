"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  type MapContainerProps,
} from "react-leaflet";
import L, { type LatLngExpression, type DivIcon } from "leaflet";

type Risk = "Info" | "Watch" | "Warning" | "Evacuate";
type SensorType = "tilt" | "rain" | "geophone";

type SensorNode = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  types: SensorType[];
  risk: Risk;
  last_seen: string;
  battery: number;
};

type Area = {
  id: string;
  name: string;
  risk: Risk;
  coords: { lat: number; lng: number }[];
};

const RISK_COLORS: Record<Risk, string> = {
  Info: "#009E73",
  Watch: "#E69F00",
  Warning: "#D55E00",
  Evacuate: "#9E0000",
};

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dangerFlagIcon(color: string): DivIcon {
  const ring = hexToRgba(color, 0.45);
  const html = `
    <div class="df-wrap">
      <span class="df-ring" style="background:${ring}"></span>
      <span class="df-dot" style="background:${color}"></span>
    </div>
  `;
  return L.divIcon({ className: "", html, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -9] });
}

const SENSOR_TYPES: readonly SensorType[] = ["tilt", "rain", "geophone"];

const MarkerClusterGroup = dynamic(
  () => import("react-leaflet-cluster").then((mod) => mod.default),
  { ssr: false, loading: () => null }
) as typeof import("react-leaflet-cluster").default;

function MapClicks({
  drawMode,
  addNoteMode,
  onAddPoint,
  onAddNote,
  onContextMenu,
  onDismissMenu,
}: {
  drawMode: boolean;
  addNoteMode: boolean;
  onAddPoint: (pt: [number, number]) => void;
  onAddNote: (lat: number, lng: number) => void;
  onContextMenu: (x: number, y: number, lat: number, lng: number) => void;
  onDismissMenu: () => void;
}) {
  const map = useMap();
  useMapEvents({
    click(e) {
      onDismissMenu();
      const { lat, lng } = e.latlng;
      if (drawMode) {
        onAddPoint([lat, lng]);
      } else if (addNoteMode) {
        onAddNote(lat, lng);
      }
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      const pt = map.latLngToContainerPoint(e.latlng);
      onContextMenu(pt.x, pt.y, e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const safeUUID = () =>
  typeof window !== "undefined" && window.crypto && "randomUUID" in window.crypto
    ? window.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const NODES: SensorNode[] = [
  {
    id: "U1",
    name: "Uttarkashi — Town North",
    lat: 30.728,
    lng: 78.443,
    types: ["tilt", "rain"],
    risk: "Watch",
    last_seen: "2025-10-24 12:15",
    battery: 3.9,
  },
  {
    id: "U2",
    name: "Gangori Slope",
    lat: 30.715,
    lng: 78.433,
    types: ["tilt", "geophone"],
    risk: "Warning",
    last_seen: "2025-10-24 12:14",
    battery: 3.7,
  },
  {
    id: "U3",
    name: "Netala Ridge",
    lat: 30.789,
    lng: 78.447,
    types: ["tilt"],
    risk: "Info",
    last_seen: "2025-10-24 12:13",
    battery: 3.8,
  },
  {
    id: "RG1",
    name: "Rain Gauge — Bhatwari",
    lat: 30.791,
    lng: 78.561,
    types: ["rain"],
    risk: "Info",
    last_seen: "2025-10-24 12:15",
    battery: 3.8,
  },
  {
    id: "G1",
    name: "Geophone — Maneri",
    lat: 30.75,
    lng: 78.449,
    types: ["geophone"],
    risk: "Watch",
    last_seen: "2025-10-24 12:10",
    battery: 3.6,
  },
];

const AREAS: Area[] = [
  {
    id: "Sector-1",
    name: "Uttarkashi Ridge",
    risk: "Warning",
    coords: [
      { lat: 30.735, lng: 78.43 },
      { lat: 30.745, lng: 78.455 },
      { lat: 30.719, lng: 78.465 },
      { lat: 30.713, lng: 78.44 },
    ],
  },
  {
    id: "Sector-2",
    name: "Bhatwari Hills",
    risk: "Evacuate",
    coords: [
      { lat: 30.796, lng: 78.545 },
      { lat: 30.806, lng: 78.575 },
      { lat: 30.785, lng: 78.583 },
      { lat: 30.779, lng: 78.552 },
    ],
  },
];

// Use default Leaflet marker icons (no custom CSS for initial look)

function HeatLayer({
  points,
  radius = 30,
  opacity = 0.6,
}: {
  points: [number, number, number][];
  radius?: number;
  opacity?: number;
}) {
  const map = useMap();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet.heat").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const paneId = "heatPane";
    const pane = map.getPane(paneId) || map.createPane(paneId);
    if (pane) pane.style.opacity = String(opacity);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const layer = (L as any).heatLayer(points, {
      radius,
      blur: Math.round(radius * 0.6),
      pane: paneId,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, ready, points, radius, opacity]);

  return null;
}

function FitToData({
  nodes,
  areas,
  enabledKey,
}: {
  nodes: SensorNode[];
  areas: Area[];
  enabledKey: string;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);
    nodes.forEach((n) => bounds.extend([n.lat, n.lng]));
    areas.forEach((a) => a.coords.forEach((c) => bounds.extend([c.lat, c.lng])));
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    }
  }, [map, nodes, areas, enabledKey]);

  return null;
}

const riskWeight: Record<Risk, number> = {
  Info: 0.2,
  Watch: 0.5,
  Warning: 0.75,
  Evacuate: 1,
};

export default function MapView() {
  const [riskFilter, setRiskFilter] = useState<Record<Risk, boolean>>({
    Info: true,
    Watch: true,
    Warning: true,
    Evacuate: true,
  });
  const [typeFilter, setTypeFilter] = useState<Record<SensorType, boolean>>({
    tilt: true,
    rain: true,
    geophone: true,
  });
  const [query, setQuery] = useState("");
  const [clusterOn, setClusterOn] = useState(true);
  const [showPolygons, setShowPolygons] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatRadius, setHeatRadius] = useState(30);
  const [heatOpacity, setHeatOpacity] = useState(0.6);
  const [basemap, setBasemap] = useState<"osm" | "topo" | "hillshade" | "satellite">("osm");
  const [hillOpacity, setHillOpacity] = useState(0.6);

  // Notes
  type Note = { id: string; lat: number; lng: number; text: string; ts: number };
  const [notes, setNotes] = useState<Note[]>([]);
  const [addNoteMode, setAddNoteMode] = useState(false);

  // Draw Area
  const [drawMode, setDrawMode] = useState(false);
  const [drawing, setDrawing] = useState<[number, number][]>([]);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaRisk, setNewAreaRisk] = useState<Risk>("Watch");
  const [userAreas, setUserAreas] = useState<Area[]>([]);
  const [userNodes, setUserNodes] = useState<SensorNode[]>([]);
  const [flagIds, setFlagIds] = useState<string[]>([]);

  type MenuTarget = { type: "note" | "checkpoint" | "area"; id: string };
  type MenuState = { x: number; y: number; lat: number; lng: number; target?: MenuTarget };
  const [menu, setMenu] = useState<MenuState | null>(null);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NODES.filter((n) => {
      const riskOk = riskFilter[n.risk];
      const typeOk = n.types.some((t) => typeFilter[t]);
      const qOk =
        !q ||
        n.id.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q);
      return riskOk && typeOk && qOk;
    });
  }, [riskFilter, typeFilter, query]);

  const filteredUserNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return userNodes.filter((n) => {
      const riskOk = riskFilter[n.risk];
      const typeOk = n.types.some((t) => typeFilter[t]);
      const qOk =
        !q ||
        n.id.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q);
      return riskOk && typeOk && qOk;
    });
  }, [userNodes, riskFilter, typeFilter, query]);

  const countsByRisk = useMemo(() => {
    const all = [...filteredNodes, ...filteredUserNodes];
    return all.reduce(
      (acc, n) => ({ ...acc, [n.risk]: acc[n.risk] + 1 }),
      { Info: 0, Watch: 0, Warning: 0, Evacuate: 0 } as Record<Risk, number>
    );
  }, [filteredNodes, filteredUserNodes]);

  const [fitKey, setFitKey] = useState<string>(safeUUID());

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { L: typeof L }).L = L;
    }
  }, []);

  // Load persisted state
  useEffect(() => {
    try {
      const a = localStorage.getItem("ls_user_areas");
      if (a) setUserAreas(JSON.parse(a));
      const n = localStorage.getItem("ls_user_nodes");
      if (n) setUserNodes(JSON.parse(n));
      const t = localStorage.getItem("ls_notes");
      if (t) setNotes(JSON.parse(t));
      const f = localStorage.getItem("ls_flag_ids");
      if (f) setFlagIds(JSON.parse(f));
    } catch {}
  }, []);

  // Persist state
  useEffect(() => {
    try { localStorage.setItem("ls_user_areas", JSON.stringify(userAreas)); } catch {}
  }, [userAreas]);
  useEffect(() => {
    try { localStorage.setItem("ls_user_nodes", JSON.stringify(userNodes)); } catch {}
  }, [userNodes]);
  useEffect(() => {
    try { localStorage.setItem("ls_notes", JSON.stringify(notes)); } catch {}
  }, [notes]);
  useEffect(() => {
    try { localStorage.setItem("ls_flag_ids", JSON.stringify(flagIds)); } catch {}
  }, [flagIds]);

  const heatPoints: [number, number, number][] = useMemo(
    () =>
      [...filteredNodes, ...filteredUserNodes].map((n) => [
        n.lat,
        n.lng,
        riskWeight[n.risk],
      ]),
    [filteredNodes, filteredUserNodes]
  );

  const resetFilters = () => {
    setQuery("");
    setRiskFilter({ Info: true, Watch: true, Warning: true, Evacuate: true });
    setTypeFilter({ tilt: true, rain: true, geophone: true });
    setShowPolygons(true);
    setShowHeatmap(false);
    setHeatRadius(30);
    setHeatOpacity(0.6);
  };

  const mapProps: MapContainerProps = {
    center: [30.7298, 78.4433] as LatLngExpression,
    zoom: 12,
    style: { width: "100%", height: "100%" },
    preferCanvas: true,
  };

  const allAreas = useMemo(() => [...AREAS, ...userAreas], [userAreas]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <MapContainer {...mapProps}>
        {basemap === "osm" && (
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {basemap === "topo" && (
          <TileLayer
            attribution="&copy; OpenStreetMap contributors, &copy; OpenTopoMap (CC-BY-SA)"
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        )}
        {basemap === "hillshade" && (
          <>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <TileLayer
              attribution="Tiles &copy; Esri — Source: Esri, USGS, NOAA"
              url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
              opacity={hillOpacity}
              className="hillshade"
            />
          </>
        )}
        {basemap === "satellite" && (
          <>
            <TileLayer
              attribution="Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <TileLayer
              attribution="&copy; CARTO"
              url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
            />
          </>
        )}

        <MapClicks
          drawMode={drawMode}
          addNoteMode={addNoteMode}
          onAddPoint={(pt) => setDrawing((d) => [...d, pt])}
          onAddNote={(lat, lng) => {
            const text = window.prompt("Note text");
            if (text && text.trim())
              setNotes((prev) => [
                ...prev,
                { id: safeUUID(), lat, lng, text: text.trim(), ts: Date.now() },
              ]);
          }}
          onContextMenu={(x, y, lat, lng) => setMenu({ x, y, lat, lng })}
          onDismissMenu={() => setMenu(null)}
        />

        <FitToData
          nodes={
            [...filteredNodes, ...filteredUserNodes].length
              ? [...filteredNodes, ...filteredUserNodes]
              : [...NODES, ...userNodes]
          }
          areas={allAreas}
          enabledKey={fitKey}
        />

        {clusterOn ? (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
            {[...filteredNodes, ...filteredUserNodes].map((n) => (
              <Marker
                key={n.id}
                position={[n.lat, n.lng] as LatLngExpression}
                icon={flagIds.includes(n.id) ? dangerFlagIcon(RISK_COLORS[n.risk]) : undefined}
                eventHandlers={{
                  contextmenu: (e) => {
                    const ev = (e as any).originalEvent as MouseEvent;
                    const rect = ((e as any).target?._map?._container as HTMLElement)?.getBoundingClientRect?.() ||
                      (document.querySelector('.leaflet-container') as HTMLElement).getBoundingClientRect();
                    const x = ev.clientX - rect.left;
                    const y = ev.clientY - rect.top;
                    if (userNodes.find((u) => u.id === n.id)) {
                      setMenu({ x, y, lat: n.lat, lng: n.lng, target: { type: "checkpoint", id: n.id } });
                    } else {
                      setMenu({ x, y, lat: n.lat, lng: n.lng });
                    }
                  },
                }}
              >
                <Popup>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 700 }}>{n.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8, margin: "2px 0" }}>
                      {n.id} • {n.types.join(", ")}
                    </div>
                    <div>
                      <b>Risk:</b> <span style={{ color: RISK_COLORS[n.risk] }}>{n.risk}</span>
                    </div>
                    <div>
                      <b>Battery:</b> {n.battery.toFixed(2)} V
                    </div>
                    <div>
                      <b>Last seen:</b> {n.last_seen}
                    </div>
                  </div>
                  {userNodes.find((u) => u.id === n.id) && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => setUserNodes((prev) => prev.filter((u) => u.id !== n.id))}
                        style={btnStyle}
                      >
                        Delete checkpoint
                      </button>
                    </div>
                  )}
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        ) : (
          [...filteredNodes, ...filteredUserNodes].map((n) => (
            <Marker
              key={n.id}
              position={[n.lat, n.lng] as LatLngExpression}
              icon={flagIds.includes(n.id) ? dangerFlagIcon(RISK_COLORS[n.risk]) : undefined}
              eventHandlers={{
                contextmenu: (e) => {
                  const ev = (e as any).originalEvent as MouseEvent;
                  const rect = ((e as any).target?._map?._container as HTMLElement)?.getBoundingClientRect?.() ||
                    (document.querySelector('.leaflet-container') as HTMLElement).getBoundingClientRect();
                  const x = ev.clientX - rect.left;
                  const y = ev.clientY - rect.top;
                  if (userNodes.find((u) => u.id === n.id)) {
                    setMenu({ x, y, lat: n.lat, lng: n.lng, target: { type: "checkpoint", id: n.id } });
                  } else {
                    setMenu({ x, y, lat: n.lat, lng: n.lng });
                  }
                },
              }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{n.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, margin: "2px 0" }}>
                    {n.id} • {n.types.join(", ")}
                  </div>
                  <div>
                    <b>Risk:</b> <span style={{ color: RISK_COLORS[n.risk] }}>{n.risk}</span>
                  </div>
                  <div>
                    <b>Battery:</b> {n.battery.toFixed(2)} V
                  </div>
                  <div>
                    <b>Last seen:</b> {n.last_seen}
                  </div>
                </div>
                {userNodes.find((u) => u.id === n.id) && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => setUserNodes((prev) => prev.filter((u) => u.id !== n.id))}
                      style={btnStyle}
                    >
                      Delete checkpoint
                    </button>
                  </div>
                )}
              </Popup>
            </Marker>
          ))
        )}

        {showPolygons &&
          allAreas.map((a) => (
            <Polygon
              key={a.id}
              positions={a.coords.map((c) => [c.lat, c.lng] as [number, number])}
              pathOptions={{
                color: RISK_COLORS[a.risk],
                weight: 2,
                opacity: 0.95,
                fillColor: RISK_COLORS[a.risk],
                fillOpacity: 0.18,
              }}
              eventHandlers={
                userAreas.some((u) => u.id === a.id)
                  ? {
                      contextmenu: (e) => {
                        const ev = (e as any).originalEvent as MouseEvent;
                        const rect = ((e as any).target?._map?._container as HTMLElement)?.getBoundingClientRect?.() ||
                          (document.querySelector('.leaflet-container') as HTMLElement).getBoundingClientRect();
                        const x = ev.clientX - rect.left;
                        const y = ev.clientY - rect.top;
                        setMenu({ x, y, lat: (e as any).latlng.lat, lng: (e as any).latlng.lng, target: { type: "area", id: a.id } });
                      },
                    }
                  : undefined
              }
            />
          ))}

        

        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer points={heatPoints} radius={heatRadius} opacity={heatOpacity} />
        )}

        {notes.map((n) => (
          <Marker
            key={n.id}
            position={[n.lat, n.lng] as LatLngExpression}
            eventHandlers={{
              contextmenu: (e) => {
                const ev = (e as any).originalEvent as MouseEvent;
                const rect = ((e as any).target?._map?._container as HTMLElement)?.getBoundingClientRect?.() ||
                  (document.querySelector('.leaflet-container') as HTMLElement).getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const y = ev.clientY - rect.top;
                setMenu({ x, y, lat: n.lat, lng: n.lng, target: { type: "note", id: n.id } });
              },
            }}
          >
            <Popup>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Note</div>
                <div style={{ maxWidth: 220 }}>{n.text}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div
        className="ui-panel ui-panel-left"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 1000,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          padding: 12,
          minWidth: 280,
          pointerEvents: "auto",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Site A — Ridge Hamlet</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tile color="#009E73" label="Info" value={countsByRisk.Info} />
          <Tile color="#E69F00" label="Watch" value={countsByRisk.Watch} />
          <Tile color="#D55E00" label="Warning" value={countsByRisk.Warning} />
          <Tile color="#9E0000" label="Evacuate" value={countsByRisk.Evacuate} />
        </div>
      </div>

      <div
        className="ui-panel ui-panel-right"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 1000,
          background: "rgba(255,255,255,0.98)",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          padding: 12,
          minWidth: 300,
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, flex: 1 }}>Filters & Overlays</div>
          <button onClick={() => setFitKey(safeUUID())} style={btnStyle}>
            Fit to data
          </button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Search name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={inputStyle}
          />
        </div>

        <Section title="Node risk">
          {(["Info", "Watch", "Warning", "Evacuate"] as Risk[]).map((r) => (
            <label key={r} style={chkStyle}>
              <input
                type="checkbox"
                checked={riskFilter[r]}
                onChange={() =>
                  setRiskFilter((prev) => ({ ...prev, [r]: !prev[r] }))
                }
              />
              <span style={{ color: RISK_COLORS[r] }}>{r}</span>
            </label>
          ))}
        </Section>

        <Section title="Sensor type">
          {SENSOR_TYPES.map((t) => (
            <label key={t} style={chkStyle}>
              <input
                type="checkbox"
                checked={typeFilter[t]}
                onChange={() =>
                  setTypeFilter((prev) => ({ ...prev, [t]: !prev[t] }))
                }
              />
              <span>{t}</span>
            </label>
          ))}
        </Section>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <label style={chkStyle}>
            <input
              type="checkbox"
              checked={clusterOn}
              onChange={() => setClusterOn((prev) => !prev)}
            />
            Marker clustering
          </label>
          <button onClick={resetFilters} style={{ ...btnStyle, marginLeft: "auto" }}>
            Reset
          </button>
        </div>

        <Section title="Tracked areas">
          <label style={chkStyle}>
            <input
              type="checkbox"
              checked={showPolygons}
              onChange={() => setShowPolygons((prev) => !prev)}
            />
            Show polygons
          </label>
          <label style={chkStyle}>
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={() => setShowHeatmap((prev) => !prev)}
            />
            Show heatmap
          </label>

          {showHeatmap && (
            <div style={{ width: "100%", marginTop: 8 }}>
              <LabeledRange
                label="Radius"
                min={10}
                max={60}
                step={2}
                value={heatRadius}
                onChange={(v) => setHeatRadius(Number(v))}
              />
              <LabeledRange
                label="Opacity"
                min={0.1}
                max={0.9}
                step={0.05}
                value={heatOpacity}
                onChange={(v) => setHeatOpacity(Number(v))}
              />
            </div>
          )}

          <div style={{ width: "100%", height: 1, background: "#e5e7eb", margin: "8px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Basemap</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={chkStyle}>
                <input type="radio" name="basemap" checked={basemap === "osm"} onChange={() => setBasemap("osm")} />
                Standard (OSM)
              </label>
              <label style={chkStyle}>
                <input type="radio" name="basemap" checked={basemap === "topo"} onChange={() => setBasemap("topo")} />
                Topographic
              </label>
              <label style={chkStyle}>
                <input type="radio" name="basemap" checked={basemap === "hillshade"} onChange={() => setBasemap("hillshade")} />
                Hillshade + Labels
              </label>
              <label style={chkStyle}>
                <input type="radio" name="basemap" checked={basemap === "satellite"} onChange={() => setBasemap("satellite")} />
                Satellite + Labels
              </label>
            </div>
            {basemap === "hillshade" && (
              <LabeledRange
                label="Shade"
                min={0.2}
                max={1}
                step={0.05}
                value={hillOpacity}
                onChange={(v) => setHillOpacity(Number(v))}
              />
            )}
          </div>

          <div style={{ width: "100%", height: 1, background: "#e5e7eb", margin: "8px 0" }} />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={chkStyle}>
              <input
                type="checkbox"
                checked={drawMode}
                onChange={() => {
                  setDrawMode((p) => !p);
                  setDrawing([]);
                }}
              />
              Draw area
            </label>
            <label style={chkStyle}>
              <input
                type="checkbox"
                checked={addNoteMode}
                onChange={() => setAddNoteMode((p) => !p)}
              />
              Add note
            </label>
          </div>

          {drawMode && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                Click on the map to add vertices. Minimum 3 points.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input
                  placeholder="Area name"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  style={inputStyle}
                />
                <select
                  value={newAreaRisk}
                  onChange={(e) => setNewAreaRisk(e.target.value as Risk)}
                  style={{ ...inputStyle, width: 120 }}
                >
                  {(["Info", "Watch", "Warning", "Evacuate"] as Risk[]).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={drawing.length < 3 || !newAreaName.trim()}
                  onClick={() => {
                    const id = `UA-${safeUUID().slice(0, 6)}`;
                    const coords = drawing.map((p) => ({ lat: p[0], lng: p[1] }));
                    setUserAreas((prev) => [
                      ...prev,
                      { id, name: newAreaName.trim(), risk: newAreaRisk, coords },
                    ]);
                    setDrawing([]);
                    setNewAreaName("");
                    setNewAreaRisk("Watch");
                    setDrawMode(false);
                  }}
                  style={btnStyle}
                >
                  Finish & save ({drawing.length})
                </button>
                <button
                  onClick={() => {
                    setDrawing([]);
                    setDrawMode(false);
                  }}
                  style={btnStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section title="Notes">
          <div style={{ fontSize: 12, color: "#6b7280", width: "100%" }}>
            {notes.length === 0 ? "No notes yet" : `${notes.length} note(s)`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            {notes.map((n) => (
              <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n.text}
                </div>
                <button
                  onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}
                  style={btnStyle}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div
        className="ui-legend"
        style={{
          position: "absolute",
          bottom: 14,
          left: 12,
          zIndex: 1000,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 8,
          padding: "8px 10px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          fontSize: 14,
          pointerEvents: "auto",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Legend</div>
        <LegendItem color="#009E73" text="Info" />
        <LegendItem color="#E69F00" text="Watch" />
        <LegendItem color="#D55E00" text="Warning" />
        <LegendItem color="#9E0000" text="Evacuate" />
        {showHeatmap && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Heatmap intensity</div>
            <div
              style={{
                height: 12,
                borderRadius: 6,
                background: "linear-gradient(90deg,#4ade80,#facc15,#f97316,#ef4444)",
                border: "1px solid rgba(0,0,0,0.15)",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                opacity: 0.8,
                marginTop: 2,
              }}
            >
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        )}
      </div>

      {menu && (
        <div
          style={{
            position: "absolute",
            left: menu.x,
            top: menu.y,
            zIndex: 2000,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
            overflow: "hidden",
            minWidth: 200,
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(() => {
            const Item = ({ label, onClick }: { label: string; onClick: () => void }) => (
              <button
                onClick={() => {
                  onClick();
                  setMenu(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: 0,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );

            const addCheckpoint = () => {
              const name = window.prompt("Checkpoint name") || `Checkpoint ${safeUUID().slice(0, 4)}`;
              const r = (window.prompt("Risk (Info/Watch/Warning/Evacuate)", "Watch") || "Watch").toLowerCase();
              const proper = (r.charAt(0).toUpperCase() + r.slice(1)) as Risk;
              const risk: Risk = ["Info", "Watch", "Warning", "Evacuate"].includes(proper) ? proper : "Watch";
              setUserNodes((prev) => [
                ...prev,
                {
                  id: safeUUID(),
                  name,
                  lat: menu.lat,
                  lng: menu.lng,
                  types: ["tilt"],
                  risk,
                  last_seen: new Date().toISOString().slice(0, 16).replace("T", " "),
                  battery: 3.8,
                },
              ]);
            };

            const addVertex = () => setDrawing((d) => [...d, [menu.lat, menu.lng]]);
            const undoVertex = () => setDrawing((d) => d.slice(0, -1));
            const finishArea = () => {
              if (drawing.length < 3) return;
              const nm = window.prompt("Area name", newAreaName) || "New area";
              const r = (window.prompt("Risk (Info/Watch/Warning/Evacuate)", newAreaRisk) || "Watch").toLowerCase();
              const proper = (r.charAt(0).toUpperCase() + r.slice(1)) as Risk;
              const risk: Risk = ["Info", "Watch", "Warning", "Evacuate"].includes(proper) ? proper : "Watch";
              const id = `UA-${safeUUID().slice(0, 6)}`;
              const coords = drawing.map((p) => ({ lat: p[0], lng: p[1] }));
              setUserAreas((prev) => [...prev, { id, name: nm, risk, coords }]);
              setDrawing([]);
              setNewAreaName("");
              setNewAreaRisk("Watch");
              setDrawMode(false);
            };

            if (menu.target?.type === "checkpoint") {
              const id = menu.target!.id;
              const isFlag = flagIds.includes(id);
              return (
                <Item
                  label={isFlag ? "Delete danger flag" : "Delete checkpoint"}
                  onClick={() => {
                    if (isFlag) setFlagIds((prev) => prev.filter((x) => x !== id));
                    setUserNodes((prev) => prev.filter((u) => u.id !== id));
                  }}
                />
              );
            }
            if (menu.target?.type === "note") {
              return (
                <Item label="Delete note" onClick={() => setNotes((prev) => prev.filter((n) => n.id !== menu.target!.id))} />
              );
            }
            if (menu.target?.type === "area") {
              return (
                <Item
                  label="Delete area"
                  onClick={() => setUserAreas((prev) => prev.filter((a) => a.id !== menu.target!.id))}
                />
              );
            }

            const addDangerFlag = () => {
              const name = window.prompt("Flag name", "Danger Flag") || "Danger Flag";
              const r = (window.prompt("Risk (Watch/Warning/Evacuate)", "Warning") || "Warning").toLowerCase();
              const proper = (r.charAt(0).toUpperCase() + r.slice(1)) as Risk;
              const risk: Risk = ["Watch", "Warning", "Evacuate"].includes(proper as any) ? proper : "Warning";
              const id = safeUUID();
              setUserNodes((prev) => [
                ...prev,
                {
                  id,
                  name,
                  lat: menu.lat,
                  lng: menu.lng,
                  types: ["tilt"],
                  risk,
                  last_seen: new Date().toISOString().slice(0, 16).replace("T", " "),
                  battery: 3.8,
                },
              ]);
              setFlagIds((prev) => [...prev, id]);
            };

            return (
              <div>
                {drawMode ? (
                  <>
                    <Item label="Add vertex here" onClick={addVertex} />
                    {drawing.length > 0 && <Item label="Undo last vertex" onClick={undoVertex} />}
                    {drawing.length >= 3 && <Item label="Finish area" onClick={finishArea} />}
                    <Item
                      label="Cancel drawing"
                      onClick={() => {
                        setDrawing([]);
                        setDrawMode(false);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Item
                      label="Start draw area & add first vertex here"
                      onClick={() => {
                        setDrawMode(true);
                        setDrawing([[menu.lat, menu.lng]]);
                      }}
                    />
                    <Item label="Add note here" onClick={() => {
                      const text = window.prompt("Note text");
                      if (text && text.trim())
                        setNotes((prev) => [
                          ...prev,
                          { id: safeUUID(), lat: menu.lat, lng: menu.lng, text: text.trim(), ts: Date.now() },
                        ]);
                    }} />
                    <Item label="Add checkpoint here" onClick={addCheckpoint} />
                    <Item label="Add danger flag here" onClick={addDangerFlag} />
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Tile({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div
      style={{
        flex: "1 1 110px",
        borderRadius: 8,
        padding: "6px 10px",
        color: "#fff",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: color,
      }}
    >
      {label} <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function LabeledRange({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, width: "100%" }}>
      <label style={{ fontSize: 13, width: 70 }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ width: 36, textAlign: "right", fontSize: 13 }}>{value}</span>
    </div>
  );
}

function LegendItem({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.2)",
          background: color,
        }}
      />
      {text}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  outline: "none",
};

const chkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
};

const btnStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#f8fafc",
  cursor: "pointer",
};
