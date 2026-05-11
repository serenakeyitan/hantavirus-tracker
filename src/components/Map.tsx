"use client";

import { useEffect, useRef } from "react";
import type { DataPayload } from "@/lib/types";

type Props = { data: DataPayload };

export default function Map({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current || !containerRef.current) return;
    initRef.current = true;

    let cleanup: (() => void) | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      const map = L.map(containerRef.current!, {
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
          .addTo(map);
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
            .addTo(map);
        }
      }

      cleanup = () => map.remove();
    })();

    return () => cleanup?.();
  }, [data]);

  return <div ref={containerRef} className="h-full w-full" />;
}
