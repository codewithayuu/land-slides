"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  GoogleMap,
  Marker,
  Polygon,
  InfoWindow,
  useJsApiLoader,
  MarkerClustererF,
  HeatmapLayer,
} from "@react-google-maps/api";

type Risk = "Info" | "Watch" | "Warning" | "Evacuate";

type SensorNode = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  types: string[]; // e.g. ["tilt","rain","geophone"]
  risk: Risk;
  last_seen: string; // "YYYY-MM-DD HH:mm"
  battery: number; // volts
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

const SENSOR_TYPES = ["tilt", "rain", "geophone"] as const;

const NODES: SensorNode[] = [
  { id: "A1", name: "Node A1 — Crown",     lat: 30.3162, lng: 78.0248, types: ["tilt","rain"],     risk: "Watch",    last_seen: "2025-10-24 12:15", battery: 3.9 },
  { id: "A2", name: "Node A2 — Mid-slope", lat: 30.3151, lng: 78.0264, types: ["tilt","geophone"], risk: "Warning",  last_seen: "2025-10-24 12:14", battery: 3.7 },
  { id: "A3", name: "Node A3 — Toe",       lat: 30.3144, lng: 78.0278, types: ["tilt"],            risk: "Info",     last_seen: "2025-10-24 12:13", battery: 3.8 },
  { id: "RG1", name: "Rain Gauge 1",       lat: 30.3174, lng: 78.0269, types: ["rain"],            risk: "Info",     last_seen: "2025-10-24 12:15", battery: 3.8 },
  { id: "G1", name: "Geophone G1",         lat: 30.3157, lng: 78.0236, types: ["geophone"],        risk: "Watch",    last_seen: "2025-10-24 12:10", battery: 3.6 },
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
  {
    id: "Sector-3",
    name: "Tracked Area 3",
    risk: "Watch",
    coords: [
      { lat: 30.3149, lng: 78.0288 },
      { lat: 30.3154, lng: 78.0322 },
      { lat: 30.3133, lng: 78.0328 },
      { lat: 30.3129, lng: 78.0293 },
    ],
  },
];

// Heatmap gradient (left->right)
const HEAT_GRADIENT = [
  "rgba(0, 0, 0, 0)",
  "rgba(0, 255, 255, 1)",
  "rgba(0, 191, 255, 1)",
  "rgba(0, 127, 255, 1)",
  "rgba(0, 63, 255, 1)",
  "rgba(0, 255, 0, 1)",
  "rgba(127, 255, 0, 1)",
  "rgba(191, 255, 0, 1)",
  "rgba(255, 255, 0, 1)",
  "rgba(255, 191, 0, 1)",
  "rgba(255, 127, 0, 1)",
  "rgba(255, 63, 0, 1)",
  "rgba(255, 0, 0, 1)",
];

export default function MapView() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["visualization"],
  });

  const center = useMemo(() => ({ lat: 30.3158, lng: 78.026 }), []);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selected, setSelected] = useState<SensorNode | null>(null);

  // Node filters
  const [riskFilter, setRiskFilter] = useState<Record<Risk, boolean>>({
    Info: true,
    Watch: true,
    Warning: true,
    Evacuate: true,
  });
  const [typeFilter, setTypeFilter] = useState<
    Record<(typeof SENSOR_TYPES)[number], boolean>
  >({
    tilt: true,
    rain: true,
    geophone: true,
  });
  const [query, setQuery] = useState("");
  const [clusterOn, setClusterOn] = useState(true);

  // Area overlays + filters
  const [showPolygons, setShowPolygons] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatRadius, setHeatRadius] = useState(30);
  const [heatOpacity, setHeatOpacity] = useState(0.6);
  const [areaRiskFilter, setAreaRiskFilter] = useState<Record<Risk, boolean>>({
    Info: true,
    Watch: true,
    Warning: true,
    Evacuate: true,
  });

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NODES.filter((n) => {
      const stageOk = riskFilter[n.risk];
      const typeOk = n.types.some(
        (t) => typeFilter[t as (typeof SENSOR_TYPES)[number]]
      );
      const qOk =
        !q ||
        n.id.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q);
      return stageOk && typeOk && qOk;
    });
  }, [riskFilter, typeFilter, query]);

  const filteredAreas = useMemo(
    () => AREAS.filter((a) => areaRiskFilter[a.risk]),
    [areaRiskFilter]
  );

  const countsByRisk = useMemo(() => {
    return filteredNodes.reduce(
      (acc, n) => ({ ...acc, [n.risk]: (acc[n.risk] || 0) + 1 }),
      { Info: 0, Watch: 0, Warning: 0, Evacuate: 0 } as Record<Risk, number>
    );
  }, [filteredNodes]);

  const { activeCount, avgBattery } = useMemo(() => {
    const now = Date.now();
    const ACTIVE_MINUTES = 15;
    const parseLS = (s: string) => Date.parse(s.replace(" ", "T") + "Z");
    let active = 0;
    let sumBatt = 0;
    filteredNodes.forEach((n) => {
      const seen = parseLS(n.last_seen);
      if (!Number.isNaN(seen) && now - seen <= ACTIVE_MINUTES * 60 * 1000) {
        active += 1;
      }
      sumBatt += n.battery;
    });
    return {
      activeCount: active,
      avgBattery: filteredNodes.length
        ? sumBatt / filteredNodes.length
        : 0,
    };
  }, [filteredNodes]);

  const areaCountsByRisk = useMemo(() => {
    return filteredAreas.reduce(
      (acc, a) => ({ ...acc, [a.risk]: (acc[a.risk] || 0) + 1 }),
      { Info: 0, Watch: 0, Warning: 0, Evacuate: 0 } as Record<Risk, number>
    );
  }, [filteredAreas]);

  useEffect(() => {
    if (selected && !filteredNodes.find((n) => n.id === selected.id)) {
      setSelected(null);
    }
  }, [filteredNodes, selected]);

  const fitToData = useCallback(() => {
    if (!map) return;
    const bounds = new window.google.maps.LatLngBounds();
    (filteredNodes.length ? filteredNodes : NODES).forEach((n) =>
      bounds.extend({ lat: n.lat, lng: n.lng })
    );
    (filteredAreas.length ? filteredAreas : AREAS).forEach((a) =>
      a.coords.forEach((c) => bounds.extend(c))
    );
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
    }
  }, [map, filteredNodes, filteredAreas]);

  const onLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
    const bounds = new window.google.maps.LatLngBounds();
    NODES.forEach((n) => bounds.extend({ lat: n.lat, lng: n.lng }));
    AREAS.forEach((a) => a.coords.forEach((c) => bounds.extend(c)));
    if (!bounds.isEmpty()) {
      m.fitBounds(bounds);
    }
  }, []);

  if (!isLoaded) return <div style={{ padding: 20 }}>Loading map…</div>;

  const riskWeight: Record<Risk, number> = {
    Info: 0.2,
    Watch: 0.5,
    Warning: 0.75,
    Evacuate: 1,
  };
  const heatmapData: google.maps.visualization.WeightedLocation[] =
    filteredNodes.map((n) => ({
      location: new window.google.maps.LatLng(n.lat, n.lng),
      weight: riskWeight[n.risk],
    }));

  const markerIcon = (risk: Risk): google.maps.Symbol => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: RISK_COLORS[risk],
    fillOpacity: 0.95,
    strokeColor: "#ffffff",
    strokeWeight: 1.2,
  });

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={14}
        options={{
          mapTypeId: "terrain",
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: true,
        }}
        onLoad={onLoad}
      >
        {clusterOn ? (
          <MarkerClustererF>
            {(clusterer) => (
              <>
                {filteredNodes.map((n) => (
                  <Marker
                    key={n.id}
                    position={{ lat: n.lat, lng: n.lng }}
                    title={`${n.name} (${n.id})`}
                    icon={markerIcon(n.risk)}
                    onClick={() => setSelected(n)}
                    clusterer={clusterer}
                  />
                ))}
              </>
            )}
          </MarkerClustererF>
        ) : (
          filteredNodes.map((n) => (
            <Marker
              key={n.id}
              position={{ lat: n.lat, lng: n.lng }}
              title={`${n.name} (${n.id})`}
              icon={markerIcon(n.risk)}
              onClick={() => setSelected(n)}
            />
          ))
        )}

        {showPolygons &&
          filteredAreas.map((a) => (
            <Polygon
              key={a.id}
              path={a.coords}
              options={{
                strokeColor: RISK_COLORS[a.risk],
                strokeOpacity: 0.95,
                strokeWeight: 2,
                fillColor: RISK_COLORS[a.risk],
                fillOpacity: 0.18,
              }}
            />
          ))}

        {showHeatmap && heatmapData.length > 0 && (
          <HeatmapLayer
            data={heatmapData}
            options={{
              radius: heatRadius,
              opacity: heatOpacity,
              dissipating: true,
              gradient: HEAT_GRADIENT,
            }}
          />
        )}

        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelected(null)}
          >
            <div style={{ minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>{selected.name}</div>
              <div style={{ fontSize: 12, opacity: 0.8, margin: "2px 0" }}>
                {selected.id} • {(selected.types || []).join(", ")}
              </div>
              <div>
                <b>Risk:</b>{" "}
                <span style={{ color: RISK_COLORS[selected.risk] }}>
                  {selected.risk}
                </span>
              </div>
              <div>
                <b>Battery:</b> {selected.battery.toFixed(2)} V
              </div>
              <div>
                <b>Last seen:</b> {selected.last_seen}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

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
          minWidth: 300,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Site A — Ridge Hamlet</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tile color="#009E73" label="Info" value={countsByRisk.Info} />
          <Tile color="#E69F00" label="Watch" value={countsByRisk.Watch} />
          <Tile color="#D55E00" label="Warning" value={countsByRisk.Warning} />
          <Tile color="#9E0000" label="Evacuate" value={countsByRisk.Evacuate} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <MiniKPI label="Active nodes" value={String(activeCount)} />
          <MiniKPI label="Avg battery" value={`${avgBattery.toFixed(2)} V`} />
          <MiniKPI
            label="Showing"
            value={`${filteredNodes.length}/${NODES.length}`}
          />
        </div>
        <div style={{ marginTop: 10, fontWeight: 600 }}>Areas</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <MiniChip color="#009E73" label={`Info (${areaCountsByRisk.Info})`} />
          <MiniChip color="#E69F00" label={`Watch (${areaCountsByRisk.Watch})`} />
          <MiniChip
            color="#D55E00"
            label={`Warning (${areaCountsByRisk.Warning})`}
          />
          <MiniChip
            color="#9E0000"
            label={`Evacuate (${areaCountsByRisk.Evacuate})`}
          />
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, flex: 1 }}>Filters & Overlays</div>
          <button
            onClick={fitToData}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f8fafc",
              cursor: "pointer",
            }}
          >
            Fit to data
          </button>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Search name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              outline: "none",
            }}
          />
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Node risk</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {(["Info", "Watch", "Warning", "Evacuate"] as Risk[]).map((r) => (
            <label
              key={r}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
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
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Sensor type</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {SENSOR_TYPES.map((t) => (
            <label
              key={t}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
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
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={clusterOn}
              onChange={() => setClusterOn((prev) => !prev)}
            />
            Marker clustering
          </label>
          <button
            onClick={() => {
              setQuery("");
              setRiskFilter({
                Info: true,
                Watch: true,
                Warning: true,
                Evacuate: true,
              });
              setTypeFilter({ tilt: true, rain: true, geophone: true });
              setAreaRiskFilter({
                Info: true,
                Watch: true,
                Warning: true,
                Evacuate: true,
              });
              setShowPolygons(true);
              setShowHeatmap(false);
              setHeatRadius(30);
              setHeatOpacity(0.6);
            }}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f8fafc",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          Tracked areas
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showPolygons}
              onChange={() => setShowPolygons((prev) => !prev)}
            />
            Show polygons
          </label>
          <label style={{ display: "flex", alignments: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={() => setShowHeatmap((prev) => !prev)}
            />
            Show heatmap
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {(["Info", "Watch", "Warning", "Evacuate"] as Risk[]).map((r) => (
            <label
              key={r}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <input
                type="checkbox"
                checked={areaRiskFilter[r]}
                onChange={() =>
                  setAreaRiskFilter((prev) => ({ ...prev, [r]: !prev[r] }))
                }
              />
              <span style={{ color: RISK_COLORS[r] }}>{r}</span>
            </label>
          ))}
        </div>
        {showHeatmap && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Heatmap settings
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 13, width: 70 }}>Radius</label>
              <input
                type="range"
                min={10}
                max={60}
                step={2}
                value={heatRadius}
                onChange={(e) => setHeatRadius(Number.parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 36, textAlign: "right", fontSize: 13 }}>
                {heatRadius}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, width: 70 }}>Opacity</label>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={heatOpacity}
                onChange={(e) => setHeatOpacity(Number.parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 36, textAlign: "right", fontSize: 13 }}>
                {heatOpacity.toFixed(2)}
              </span>
            </div>
          </div>
        )}
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
          minWidth: 160,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Legend</div>
        <LegendItem color="#009E73" text="Info" />
        <LegendItem color="#E69F00" text="Watch" />
        <LegendItem color="#D55E00" text="Warning" />
        <LegendItem color="#9E0000" text="Evacuate" />
        {showHeatmap && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Heatmap</div>
            <div
              style={{
                height: 12,
                borderRadius: 6,
                background: `linear-gradient(90deg, ${HEAT_GRADIENT.join(", ")})`,
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

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: "1 1 110px",
        borderRadius: 8,
        padding: "6px 10px",
        background: "#f3f4f6",
        color: "#111827",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {label} <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function MiniChip({ color, label }: { color: string; label: string }) {
  return (
    <div
      style={{
        borderRadius: 999,
        padding: "4px 10px",
        background: "#f8fafc",
        color: "#111827",
        border: "1px solid #e5e7eb",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          background: color,
          borderRadius: 2,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}

function LegendItem({ color, text }: { color: string; text: string }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}
    >
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
