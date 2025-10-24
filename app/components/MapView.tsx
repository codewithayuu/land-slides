"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  type MapContainerProps,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L, { type DivIcon, type LatLngExpression } from "leaflet";
import "leaflet.heat";

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

const SENSOR_TYPES: readonly SensorType[] = ["tilt", "rain", "geophone"];

const NODES: SensorNode[] = [
  {
    id: "A1",
    name: "Node A1 — Crown",
    lat: 30.3162,
    lng: 78.0248,
    types: ["tilt", "rain"],
    risk: "Watch",
    last_seen: "2025-10-24 12:15",
    battery: 3.9,
  },
  {
    id: "A2",
    name: "Node A2 — Mid-slope",
    lat: 30.3151,
    lng: 78.0264,
    types: ["tilt", "geophone"],
    risk: "Warning",
    last_seen: "2025-10-24 12:14",
    battery: 3.7,
  },
  {
    id: "A3",
    name: "Node A3 — Toe",
    lat: 30.3144,
    lng: 78.0278,
    types: ["tilt"],
    risk: "Info",
    last_seen: "2025-10-24 12:13",
    battery: 3.8,
  },
  {
    id: "RG1",
    name: "Rain Gauge 1",
    lat: 30.3174,
    lng: 78.0269,
    types: ["rain"],
    risk: "Info",
    last_seen: "2025-10-24 12:15",
    battery: 3.8,
  },
  {
    id: "G1",
    name: "Geophone G1",
    lat: 30.3157,
    lng: 78.0236,
    types: ["geophone"],
    risk: "Watch",
    last_seen: "2025-10-24 12:10",
    battery: 3.6,
  },
];

const AREAS: Area[] = [
  {
    id: "Sector-1",
    name: "Tracked Area 1",
    risk: "Warning",
    coords: [
      { lat: 30.3177, lng: 78.023 },
      { lat: 30.3172, lng: 78.0282 },
      { lat: 30.3137, lng: 78.0288 },
      { lat: 30.3139, lng: 78.0233 },
    ],
  },
  {
    id: "Sector-2",
    name: "Tracked Area 2",
    risk: "Evacuate",
    coords: [
      { lat: 30.3186, lng: 78.0226 },
      { lat: 30.3191, lng: 78.0268 },
      { lat: 30.3169, lng: 78.0275 },
      { lat: 30.3165, lng: 78.0229 },
    ],
  },
];

const nodeIcon = (risk: Risk): DivIcon =>
  L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${RISK_COLORS[risk]};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });

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

  useEffect(() => {
    const paneId = "heatPane";
    let pane = map.getPane(paneId);
    if (!pane) {
      pane = map.createPane(paneId);
    }
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
  }, [map, points, radius, opacity]);

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

  const countsByRisk = useMemo(
    () =>
      filteredNodes.reduce(
        (acc, n) => ({ ...acc, [n.risk]: acc[n.risk] + 1 }),
        { Info: 0, Watch: 0, Warning: 0, Evacuate: 0 } as Record<Risk, number>
      ),
    [filteredNodes]
  );

  const [fitKey, setFitKey] = useState(generateKey());

  const heatPoints: [number, number, number][] = useMemo(
    () => filteredNodes.map((n) => [n.lat, n.lng, riskWeight[n.risk]]),
    [filteredNodes]
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
    center: [30.3158, 78.026] as LatLngExpression,
    zoom: 14,
    style: { width: "100%", height: "100%" },
    preferCanvas: true,
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <MapContainer {...mapProps}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToData
          nodes={filteredNodes.length ? filteredNodes : NODES}
          areas={AREAS}
          enabledKey={fitKey}
        />

        {clusterOn ? (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
            {filteredNodes.map((n) => (
              <Marker
                key={n.id}
                position={[n.lat, n.lng] as LatLngExpression}
                icon={nodeIcon(n.risk)}
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
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        ) : (
          filteredNodes.map((n) => (
            <Marker
              key={n.id}
              position={[n.lat, n.lng] as LatLngExpression}
              icon={nodeIcon(n.risk)}
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
              </Popup>
            </Marker>
          ))
        )}

        {showPolygons &&
          AREAS.map((a) => (
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
            />
          ))}

        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer points={heatPoints} radius={heatRadius} opacity={heatOpacity} />
        )}
      </MapContainer>

      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 2,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          padding: 12,
          minWidth: 280,
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
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 2,
          background: "rgba(255,255,255,0.98)",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          padding: 12,
          minWidth: 300,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, flex: 1 }}>Filters & Overlays</div>
          <button onClick={() => setFitKey(generateKey())} style={btnStyle}>
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
        </Section>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 12,
          zIndex: 2,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 8,
          padding: "8px 10px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          fontSize: 14,
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

function generateKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
