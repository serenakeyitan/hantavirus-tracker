"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DataPayload, HondiusCase, HondiusStatus, ViewMode } from "@/lib/types";

const Map = dynamic(() => import("./Map"), { ssr: false });

type Props = { data: DataPayload };

const STATUS_COLORS: Record<HondiusStatus, string> = {
  DECEASED: "#000000",
  CONFIRMED: "#dc2626",
  SUSPECTED: "#f59e0b",
  MONITORING: "#6b7280",
};
const STATUS_LABEL: Record<HondiusStatus, string> = {
  DECEASED: "Deceased",
  CONFIRMED: "Confirmed",
  SUSPECTED: "Suspected",
  MONITORING: "Monitoring",
};
const STATUS_ORDER: HondiusStatus[] = ["DECEASED", "CONFIRMED", "SUSPECTED", "MONITORING"];

export default function Tracker({ data }: Props) {
  const [mode, setMode] = useState<ViewMode>("outbreak");
  const [focusedCaseId, setFocusedCaseId] = useState<number | null>(null);

  const filtered = useMemo<DataPayload>(() => {
    if (mode === "outbreak") {
      const argentinaAndes = data.sources.argentina
        ? { ...data.sources.argentina, rows: data.sources.argentina.rows.filter(r => r.isAndesRegion) }
        : data.sources.argentina;
      return {
        ...data,
        sources: {
          cdc: { ...data.sources.cdc, rows: [] },
          who: {
            ...data.sources.who,
            rows: data.sources.who.rows.filter(r => r.species === "andes"),
          },
          argentina: argentinaAndes,
          hondius: data.sources.hondius,
          gdelt: data.sources.gdelt,
        },
      };
    }
    const argentinaEndemic = data.sources.argentina
      ? { ...data.sources.argentina, rows: data.sources.argentina.rows.filter(r => !r.isAndesRegion) }
      : data.sources.argentina;
    return {
      ...data,
      sources: {
        cdc: data.sources.cdc,
        who: { ...data.sources.who, rows: [] },
        argentina: argentinaEndemic,
        hondius: null,
        gdelt: null,
      },
    };
  }, [data, mode]);

  const outbreakPosts = data.sources.who.rows.filter(r => r.species === "andes");
  const stateCount = data.sources.cdc.rows.length;
  const totalUSCases = data.sources.cdc.rows.reduce((a, r) => a + r.total, 0);
  const ar = data.sources.argentina;
  const h = data.sources.hondius;
  const g = data.sources.gdelt;
  const arProvincesInView = filtered.sources.argentina?.rows.length ?? 0;
  const arCasesInView = filtered.sources.argentina?.rows.reduce((a, r) => a + r.cases, 0) ?? 0;

  return (
    <>
      {/* Headline KPI bar (outbreak mode only). Lifted from the ArcGIS dashboard pattern. */}
      {mode === "outbreak" && h && (
        <section className="border-b border-zinc-200 bg-zinc-900 px-6 py-3 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400">MV Hondius cluster &middot; Andes virus</div>
              <div className="text-sm text-zinc-300">Live line-list of individual cases</div>
            </div>
            <div className="flex gap-6">
              <KpiCell label="Deceased" value={h.counts.deceased} color="#ffffff" />
              <KpiCell label="Confirmed" value={h.counts.confirmed} color="#fca5a5" />
              <KpiCell label="Suspected" value={h.counts.suspected} color="#fbbf24" />
              <KpiCell label="Monitoring" value={h.counts.monitoring} color="#a1a1aa" />
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
          <div role="tablist" className="inline-flex rounded-lg bg-zinc-100 p-1 text-sm">
            <button
              role="tab"
              aria-selected={mode === "outbreak"}
              onClick={() => setMode("outbreak")}
              className={
                "px-3 py-1.5 rounded-md font-medium transition-colors " +
                (mode === "outbreak"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900")
              }
            >
              Active outbreak <span className="text-xs text-zinc-500">(Andes virus)</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === "endemic"}
              onClick={() => setMode("endemic")}
              className={
                "px-3 py-1.5 rounded-md font-medium transition-colors " +
                (mode === "endemic"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900")
              }
            >
              Endemic surveillance <span className="text-xs text-zinc-500">(US + AR)</span>
            </button>
          </div>

          {mode === "outbreak" ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700">
              <span>
                <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-blue-700 align-middle" />{" "}
                <b>{outbreakPosts.length}</b> WHO posts
              </span>
              {ar && (
                <span>
                  <span className="inline-block h-3 w-3 rounded-full bg-purple-600 align-middle" />{" "}
                  <b>{arCasesInView}</b> Argentina Andes-region cases ({arProvincesInView} provinces, BEN {ar.bulletinIssue})
                </span>
              )}
              {h && (
                <span>
                  <span className="inline-block h-3 w-3 rounded-full bg-red-600 align-middle" />{" "}
                  <b>{h.cases.length}</b> cruise-cluster cases
                </span>
              )}
              {g && (
                <span>
                  <span className="inline-block h-3 w-3 rounded-full bg-teal-500 align-middle" />{" "}
                  <b>{g.totalArticles}</b> news signals across <b>{g.countries.length}</b> countries (last {g.timespan})
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700">
              <span>
                <span className="inline-block h-3 w-3 rounded-full bg-red-600 align-middle" />{" "}
                <b>{totalUSCases.toLocaleString()}</b> US cases ({stateCount} states, 3yr)
              </span>
              {ar && (
                <span>
                  <span className="inline-block h-3 w-3 rounded-full bg-purple-600 align-middle" />{" "}
                  <b>{arCasesInView}</b> Argentina non-Andes cases ({arProvincesInView} provinces)
                </span>
              )}
            </div>
          )}
        </div>

        {mode === "outbreak" && (
          <div className="mx-auto mt-3 max-w-6xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <b>Markers are signals, not certainty.</b> Confirmed cases tested positive; suspected cases are symptomatic or
            connected to the cluster; monitoring means under observation without symptoms. Locations are last known and
            may not be precise &mdash; click any pin for the primary source.
            {ar && (
              <>
                {" "}Argentina&apos;s Patagonia (Sur) region has <b>{ar.andesCases} confirmed Andes-region cases YTD</b> in
                season {ar.seasonLabel} per BEN #{ar.bulletinIssue} &mdash; endemic activity is multiples larger than
                the cruise cluster.
              </>
            )}
          </div>
        )}
      </section>

      <main className="relative flex flex-1 overflow-hidden">
        <div className="flex-1">
          <Map data={filtered} mode={mode} focusedCaseId={focusedCaseId} />
        </div>
        {mode === "outbreak" && h && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white">
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-2 text-xs">
              <div className="font-semibold uppercase tracking-wider text-zinc-700">Cases</div>
              <div className="text-zinc-500">
                Line-list maintained by{" "}
                <a href={h.url} className="underline" target="_blank" rel="noopener">K. Panozzo, Univ. of Toledo</a>
              </div>
            </div>
            <ul>
              {sortCases(h.cases).map(c => (
                <li
                  key={`${c.caseId}-${c.location}`}
                  onClick={() => setFocusedCaseId(c.caseId)}
                  className={
                    "cursor-pointer border-b border-zinc-100 px-4 py-2 text-xs hover:bg-zinc-50 " +
                    (focusedCaseId === c.caseId ? "bg-zinc-100" : "")
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[c.status] }}
                    />
                    <span className="font-semibold text-zinc-900">Case #{c.caseId ?? "?"}</span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">{STATUS_LABEL[c.status]}</span>
                  </div>
                  <div className="mt-0.5 text-zinc-700">{c.details}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {c.location || "Location unknown"}
                    {c.sourceUrl && (
                      <>
                        {" "}&middot;{" "}
                        <a href={c.sourceUrl} onClick={e => e.stopPropagation()} className="underline" target="_blank" rel="noopener">source</a>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </main>
    </>
  );
}

function KpiCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-400">{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function sortCases(cases: HondiusCase[]): HondiusCase[] {
  const orderIdx = (s: HondiusStatus) => STATUS_ORDER.indexOf(s);
  return [...cases].sort((a, b) => {
    const diff = orderIdx(a.status) - orderIdx(b.status);
    if (diff !== 0) return diff;
    return (b.caseId ?? 0) - (a.caseId ?? 0);
  });
}
