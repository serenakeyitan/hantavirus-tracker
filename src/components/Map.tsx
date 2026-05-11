"use client";

import { useEffect, useRef, useState } from "react";
import type { DataPayload, HondiusStatus, ViewMode } from "@/lib/types";

type Props = { data: DataPayload; mode: ViewMode; focusedCaseId?: number | null };

const STATUS_FILL: Record<HondiusStatus, string> = {
  DECEASED: "#0f172a",
  CONFIRMED: "#dc2626",
  SUSPECTED: "#f59e0b",
  MONITORING: "#9ca3af",
};
const STATUS_STROKE: Record<HondiusStatus, string> = {
  DECEASED: "#000000",
  CONFIRMED: "#991b1b",
  SUSPECTED: "#b45309",
  MONITORING: "#6b7280",
};

export default function Map({ data, mode, focusedCaseId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const caseMarkersRef = useRef<Record<number, import("leaflet").CircleMarker>>({});
  const [ready, setReady] = useState(false);

  // Init map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [20, 0],
        zoom: 2,
        worldCopyJump: true,
        minZoom: 2,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
  }, []);

  // Re-render markers + recenter on data/mode change. Waits for `ready` so
  // the refs are populated before we try to add layers.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      layer.clearLayers();

      const cdcRows = data.sources.cdc.rows;
      const maxCdc = Math.max(1, ...cdcRows.map(r => r.total));
      for (const row of cdcRows) {
        const radius = 6 + 22 * Math.sqrt(row.total / maxCdc);
        const years = Object.entries(row.byYear)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([y, n]) => `<div>${y}: <b>${n}</b></div>`)
          .join("");
        L.circleMarker([row.lat, row.lng], {
          radius,
          color: "#b91c1c",
          weight: 1.5,
          fillColor: "#dc2626",
          fillOpacity: 0.55,
        })
          .bindPopup(
            `<div style="font:13px/1.4 system-ui">
              <div style="font-weight:600;margin-bottom:4px">${row.state}</div>
              <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Confirmed cases &mdash; CDC NNDSS</div>
              <div>Total reported: <b>${row.total}</b></div>
              ${years}
            </div>`
          )
          .addTo(layer);
      }

      // Argentina BEN: purple markers, size scales with cases-per-province for the current season.
      const argRows = data.sources.argentina?.rows ?? [];
      const maxAr = Math.max(1, ...argRows.map(r => r.cases));
      for (const prov of argRows) {
        const radius = 6 + 16 * Math.sqrt(prov.cases / maxAr);
        const speciesNote = prov.isAndesRegion
          ? "Andes virus prevalent in this region (per BEN genotype surveillance)"
          : "Sin Nombre / other hantavirus genotypes";
        L.circleMarker([prov.lat, prov.lng], {
          radius,
          color: prov.isAndesRegion ? "#7c3aed" : "#a78bfa",
          weight: 1.5,
          fillColor: "#a855f7",
          fillOpacity: 0.55,
        })
          .bindPopup(
            `<div style="font:13px/1.4 system-ui">
              <div style="font-weight:600;margin-bottom:4px">${prov.jurisdiction} <span style="color:#666;font-weight:normal">(${prov.region})</span></div>
              <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Argentina BEN &middot; season ${prov.seasonLabel}</div>
              <div>Confirmed cases: <b>${prov.cases}</b></div>
              <div>Rate: ${prov.ratePer100k.toFixed(2)} / 100k</div>
              <div style="margin-top:6px;color:#666;font-size:11px">${speciesNote}</div>
            </div>`
          )
          .addTo(layer);
      }

      // MV Hondius cruise-cluster line-list (ArcGIS Feature Server).
      // Each case gets its own marker, sized by severity and colored by status.
      const caseMarkers: Record<number, import("leaflet").CircleMarker> = {};
      const hondius = data.sources.hondius;
      const hondiusCases = hondius?.cases ?? [];
      const severityOrder: HondiusStatus[] = ["MONITORING", "SUSPECTED", "CONFIRMED", "DECEASED"];
      // Render in severity order so worse statuses appear on top.
      const ordered = [...hondiusCases].sort(
        (a, b) => severityOrder.indexOf(a.status) - severityOrder.indexOf(b.status)
      );
      for (const c of ordered) {
        const radius = c.status === "DECEASED" ? 9 : c.status === "CONFIRMED" ? 8 : c.status === "SUSPECTED" ? 7 : 5;
        const sourceLink = c.sourceUrl
          ? `<div style="margin-top:6px"><a href="${c.sourceUrl}" target="_blank" rel="noopener" style="color:#1d4ed8">Primary source &rarr;</a></div>`
          : "";
        const popupHtml = `<div style="font:13px/1.4 system-ui;max-width:280px">
          <div style="font-weight:600;margin-bottom:4px">Case #${c.caseId ?? "?"} &middot; <span style="color:${STATUS_STROKE[c.status]}">${c.status}</span></div>
          <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">MV Hondius cluster &middot; ${c.exposureGroup ?? "—"}</div>
          <div style="margin-bottom:4px">${c.details || "(no details)"}</div>
          <div style="font-size:11px;color:#666">Last location: ${c.location || "unknown"}</div>
          ${sourceLink}
        </div>`;
        const marker = L.circleMarker([c.lat, c.lng], {
          radius,
          color: STATUS_STROKE[c.status],
          weight: 1.5,
          fillColor: STATUS_FILL[c.status],
          fillOpacity: 0.85,
        }).bindPopup(popupHtml);
        marker.addTo(layer);
        if (c.caseId != null) caseMarkers[c.caseId] = marker;
      }
      caseMarkersRef.current = caseMarkers;

      const whoRows = data.sources.who.rows;
      for (const post of whoRows) {
        const date = post.publishedAt.slice(0, 10);
        const countryList = post.countries.map(c => c.name).join(", ") || "—";
        const popupHtml = `<div style="font:13px/1.4 system-ui;max-width:280px">
          <div style="font-weight:600;margin-bottom:4px">${post.title}</div>
          <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">WHO Disease Outbreak News &middot; ${date}</div>
          <div style="margin-bottom:6px">${post.summary}…</div>
          <div style="font-size:11px;color:#666;margin-bottom:6px">Mentions: ${countryList}</div>
          <a href="${post.url}" target="_blank" rel="noopener" style="color:#1d4ed8">Read full report &rarr;</a>
        </div>`;
        for (const country of post.countries) {
          L.circleMarker([country.lat, country.lng], {
            radius: 10,
            color: "#1d4ed8",
            weight: 2,
            dashArray: "3 3",
            fillColor: "#3b82f6",
            fillOpacity: 0.35,
          })
            .bindPopup(popupHtml)
            .addTo(layer);
        }
      }

      // Recenter for the active view. Fit the bounds of whatever markers exist;
      // fall back to a sensible default per mode if there are none.
      const points: [number, number][] = [
        ...cdcRows.map(r => [r.lat, r.lng] as [number, number]),
        ...argRows.map(r => [r.lat, r.lng] as [number, number]),
        ...whoRows.flatMap(p => p.countries.map(c => [c.lat, c.lng] as [number, number])),
        ...hondiusCases.map(c => [c.lat, c.lng] as [number, number]),
      ];
      if (points.length >= 2) {
        map.fitBounds(L.latLngBounds(points).pad(0.25), { animate: true });
      } else if (points.length === 1) {
        map.setView(points[0], mode === "outbreak" ? 3 : 5, { animate: true });
      } else {
        map.setView(mode === "outbreak" ? [10, -10] : [39, -98], mode === "outbreak" ? 2 : 4);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, data, mode]);

  // Pan + open popup when the case-list panel selects a case.
  useEffect(() => {
    if (!ready || focusedCaseId == null) return;
    const map = mapRef.current;
    if (!map) return;
    const marker = caseMarkersRef.current[focusedCaseId];
    if (!marker) return;
    const latLng = marker.getLatLng();
    map.setView([latLng.lat, latLng.lng], Math.max(map.getZoom(), 4), { animate: true });
    marker.openPopup();
  }, [ready, focusedCaseId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
