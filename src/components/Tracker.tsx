"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DataPayload, HondiusCase, HondiusStatus, ViewMode } from "@/lib/types";
import { partitionGdeltCountries } from "@/lib/dedupe";
import { CONTINENT_ORDER, continentFor, type Continent } from "@/lib/continents";

const MapView = dynamic(() => import("./Map"), { ssr: false });
const TrendChart = dynamic(() => import("./TrendChart"), { ssr: false });

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

export default function Tracker({ data }: Props) {
  const [mode, setMode] = useState<ViewMode>("outbreak");
  const [focusedCaseId, setFocusedCaseId] = useState<number | null>(null);
  const [continentFilter, setContinentFilter] = useState<Continent | "All">("All");

  const filtered = useMemo<DataPayload>(() => {
    if (mode === "outbreak") {
      const argentinaAndes = data.sources.argentina
        ? { ...data.sources.argentina, rows: data.sources.argentina.rows.filter(r => r.isAndesRegion) }
        : data.sources.argentina;
      return {
        ...data,
        sources: {
          cdc: { ...data.sources.cdc, rows: [] },
          who: { ...data.sources.who, rows: data.sources.who.rows.filter(r => r.species === "andes") },
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

  const ar = data.sources.argentina;
  const h = data.sources.hondius;
  const stateCount = data.sources.cdc.rows.length;
  const totalUSCases = data.sources.cdc.rows.reduce((a, r) => a + r.total, 0);

  // GDELT signal headline — pulled from the partition helper.
  const { displayed: gdeltDisplayed } = partitionGdeltCountries(data);
  const gdeltArticles = gdeltDisplayed.reduce((a, c) => a + c.count, 0);

  // Case list: continents present, with counts.
  const continentCounts = useMemo(() => {
    if (!h) return new Map<Continent, number>();
    const counts = new Map<Continent, number>();
    for (const c of h.cases) {
      const cont = continentFor(c.location);
      counts.set(cont, (counts.get(cont) ?? 0) + 1);
    }
    return counts;
  }, [h]);

  const visibleCases = useMemo(() => {
    if (!h) return [];
    const filtered = continentFilter === "All"
      ? h.cases
      : h.cases.filter(c => continentFor(c.location) === continentFilter);
    return sortLatestFirst(filtered);
  }, [h, continentFilter]);

  return (
    <>
      {/* Big headline KPI bar. Numbers are oversized so the outbreak status is
          legible at a glance even on a mobile screen. */}
      {mode === "outbreak" && h && (
        <section className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              MV Hondius cluster · Andes virus
            </div>
            <div className="grid grid-cols-4 gap-3 sm:gap-6">
              <KpiCell label="Deceased" value={h.counts.deceased} color="#ffffff" emphasis />
              <KpiCell label="Confirmed" value={h.counts.confirmed} color="#fca5a5" />
              <KpiCell label="Suspected" value={h.counts.suspected} color="#fbbf24" />
              <KpiCell label="Monitoring" value={h.counts.monitoring} color="#d4d4d8" />
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-zinc-200 bg-white px-6 py-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
          <div role="tablist" className="inline-flex rounded-lg bg-zinc-100 p-1 text-sm">
            <button
              role="tab"
              aria-selected={mode === "outbreak"}
              onClick={() => setMode("outbreak")}
              className={
                "px-3 py-1 rounded-md font-medium transition-colors " +
                (mode === "outbreak" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")
              }
            >
              Active outbreak
            </button>
            <button
              role="tab"
              aria-selected={mode === "endemic"}
              onClick={() => setMode("endemic")}
              className={
                "px-3 py-1 rounded-md font-medium transition-colors " +
                (mode === "endemic" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")
              }
            >
              Endemic surveillance
            </button>
          </div>

          {mode === "outbreak" ? (
            <p className="text-xs text-zinc-600">
              {ar && <>Endemic Andes is multiples larger than this cluster: <b>{ar.andesCases} cases YTD</b> in Argentine Patagonia (BEN #{ar.bulletinIssue}). </>}
              {gdeltArticles > 0 && <>{gdeltArticles} news signals across {gdeltDisplayed.length} other countries. </>}
              Click any marker for the source.
            </p>
          ) : (
            <p className="text-xs text-zinc-600">
              <b>{totalUSCases.toLocaleString()}</b> US cases ({stateCount} states, last 3yr) · Argentina non-Sur provinces.
            </p>
          )}
        </div>
      </section>

      <main className="relative flex flex-1 overflow-hidden">
        <div className="flex-1">
          <MapView data={filtered} mode={mode} focusedCaseId={focusedCaseId} />
        </div>
        {mode === "outbreak" && h && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-white">
            <div className="border-b border-zinc-200">
              <TrendChart
                daily={h.dailySeries ?? []}
                cumulative={h.cumulativeSeries ?? []}
                datedCounts={h.datedCounts}
              />
            </div>
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-3 py-2">
              <div className="mb-1.5 flex items-baseline justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-700">Cases</div>
                <div className="text-[10px] text-zinc-500">latest first</div>
              </div>
              <div className="flex flex-wrap gap-1">
                <FilterPill
                  label="All"
                  count={h.cases.length}
                  active={continentFilter === "All"}
                  onClick={() => setContinentFilter("All")}
                />
                {CONTINENT_ORDER.filter(c => (continentCounts.get(c) ?? 0) > 0).map(c => (
                  <FilterPill
                    key={c}
                    label={c}
                    count={continentCounts.get(c) ?? 0}
                    active={continentFilter === c}
                    onClick={() => setContinentFilter(c)}
                  />
                ))}
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {visibleCases.map(c => (
                <li
                  key={`${c.caseId}-${c.location}`}
                  onClick={() => setFocusedCaseId(c.caseId)}
                  className={
                    "cursor-pointer border-b border-zinc-100 px-3 py-2 text-xs hover:bg-zinc-50 " +
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
                    {c.onset && (
                      <span className="ml-auto text-[10px] text-zinc-400">{c.onset.slice(0, 10)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-zinc-700">{c.details}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {c.location || "Location unknown"}
                    {c.sourceUrl && (
                      <>
                        {" "}·{" "}
                        <a href={c.sourceUrl} onClick={e => e.stopPropagation()} className="underline" target="_blank" rel="noopener">source</a>
                      </>
                    )}
                  </div>
                </li>
              ))}
              {visibleCases.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-zinc-500">No cases in this region.</li>
              )}
            </ul>
          </aside>
        )}
      </main>
    </>
  );
}

function KpiCell({
  label, value, color, emphasis,
}: { label: string; value: number; color: string; emphasis?: boolean }) {
  return (
    <div>
      <div className={"text-[11px] font-semibold uppercase tracking-widest " + (emphasis ? "text-zinc-200" : "text-zinc-400")}>{label}</div>
      <div
        className="font-bold tabular-nums leading-none text-5xl sm:text-6xl"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function FilterPill({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
        (active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")
      }
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );
}

// Latest first: by onset desc when known, then by caseId desc (maintainer
// assigns IDs as cases come in, so higher ID ≈ more recent).
function sortLatestFirst(cases: HondiusCase[]): HondiusCase[] {
  return [...cases].sort((a, b) => {
    const onsetA = a.onset ? new Date(a.onset).getTime() : 0;
    const onsetB = b.onset ? new Date(b.onset).getTime() : 0;
    if (onsetA !== onsetB) return onsetB - onsetA;
    return (b.caseId ?? 0) - (a.caseId ?? 0);
  });
}
