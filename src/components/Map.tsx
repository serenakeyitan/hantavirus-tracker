"use client";

import { useEffect, useRef, useState } from "react";
import type { DataPayload, ViewMode } from "@/lib/types";

type Props = { data: DataPayload; mode: ViewMode };

export default function Map({ data, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
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
        ...whoRows.flatMap(p => p.countries.map(c => [c.lat, c.lng] as [number, number])),
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

  return <div ref={containerRef} className="h-full w-full" />;
}
