"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DataPayload, ViewMode } from "@/lib/types";

const Map = dynamic(() => import("./Map"), { ssr: false });

type Props = { data: DataPayload };

export default function Tracker({ data }: Props) {
  const [mode, setMode] = useState<ViewMode>("outbreak");

  const filtered = useMemo<DataPayload>(() => {
    if (mode === "outbreak") {
      return {
        ...data,
        sources: {
          cdc: { ...data.sources.cdc, rows: [] },
          who: {
            ...data.sources.who,
            rows: data.sources.who.rows.filter(r => r.species === "andes"),
          },
        },
      };
    }
    return {
      ...data,
      sources: {
        cdc: data.sources.cdc,
        who: { ...data.sources.who, rows: [] },
      },
    };
  }, [data, mode]);

  const outbreakPosts = data.sources.who.rows.filter(r => r.species === "andes");
  const stateCount = data.sources.cdc.rows.length;
  const totalUSCases = data.sources.cdc.rows.reduce((a, r) => a + r.total, 0);
  const countriesAffected = new Set(
    outbreakPosts.flatMap(p => p.countries.map(c => c.name))
  ).size;
  const latestOutbreak = outbreakPosts[0];

  return (
    <>
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
              Endemic surveillance <span className="text-xs text-zinc-500">(US, 3yr)</span>
            </button>
          </div>

          {mode === "outbreak" ? (
            <div className="text-sm text-zinc-700">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-blue-700 align-middle" />{" "}
              <b>{outbreakPosts.length}</b> WHO posts &middot; <b>{countriesAffected}</b> countries mentioned
              {latestOutbreak && (
                <span className="ml-2 text-zinc-500">
                  &middot; latest {latestOutbreak.publishedAt.slice(0, 10)}
                </span>
              )}
            </div>
          ) : (
            <div className="text-sm text-zinc-700">
              <span className="inline-block h-3 w-3 rounded-full bg-red-600 align-middle" />{" "}
              <b>{totalUSCases.toLocaleString()}</b> US cases across <b>{stateCount}</b> states
              <span className="ml-2 text-zinc-500">&middot; CDC NNDSS, last 3 years</span>
            </div>
          )}
        </div>

        {mode === "outbreak" && (
          <div className="mx-auto mt-3 max-w-6xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <b>Why this view matters:</b> Andes virus is the only hantavirus with documented
            person-to-person transmission. The cruise-ship cluster has affected passengers
            from multiple countries, which is why it&apos;s on WHO Disease Outbreak News.
            US endemic cases (Sin Nombre virus) do not transmit between humans.
          </div>
        )}
      </section>

      <main className="relative flex-1">
        <Map data={filtered} mode={mode} />
      </main>
    </>
  );
}
