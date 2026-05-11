"use client";

import { useMemo, useRef, useState } from "react";
import type { DailyPoint } from "@/lib/types";

type DatedCounts = { onset: number; narrative: number; firstSeen: number; undated: number };

type Props = {
  daily: DailyPoint[];
  cumulative: DailyPoint[];
  datedCounts?: DatedCounts;
  className?: string;
};

// Tiny in-house chart — daily bars + cumulative line. Hovering snaps to the
// nearest day and shows a tooltip with both daily-new and running-total.
export default function TrendChart({ daily, cumulative, datedCounts, className }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { days, dailyPoints, cumPoints, geom } = useMemo(() => {
    const allDays = Array.from(
      new Set([...daily.map(p => p.day), ...cumulative.map(p => p.day)])
    ).sort();
    if (!allDays.length) {
      return { days: [], dailyPoints: [], cumPoints: [], geom: null };
    }
    const days = enumerateDays(allDays[0], todayUTC());
    const dailyByDay = new Map(daily.map(p => [p.day, p.count]));
    const cumulativeByDay = new Map(cumulative.map(p => [p.day, p.count]));

    let lastCum = 0;
    const cumPoints = days.map(d => {
      const v = cumulativeByDay.get(d);
      if (v != null) lastCum = v;
      return { day: d, count: lastCum };
    });
    const dailyPoints = days.map(d => ({ day: d, count: dailyByDay.get(d) ?? 0 }));

    const W = 280;
    const H = 88;
    const pad = { left: 8, right: 8, top: 8, bottom: 18 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;
    const maxDaily = Math.max(1, ...dailyPoints.map(p => p.count));
    const maxCum = Math.max(1, ...cumPoints.map(p => p.count));

    const xFor = (i: number) =>
      pad.left + (days.length === 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
    const yDaily = (n: number) => H - pad.bottom - (n / maxDaily) * innerH;
    const yCum = (n: number) => H - pad.bottom - (n / maxCum) * innerH;
    const barW = days.length > 1 ? Math.max(2, innerW / days.length - 2) : 12;

    return {
      days,
      dailyPoints,
      cumPoints,
      geom: { W, H, pad, innerW, innerH, xFor, yDaily, yCum, barW },
    };
  }, [daily, cumulative]);

  if (!geom || !days.length) {
    return (
      <div className={"px-3 py-4 text-center text-xs text-zinc-500 " + (className ?? "")}>
        Trend data will appear once cases are dated.
      </div>
    );
  }

  const { W, H, pad, xFor, yCum, yDaily, barW } = geom;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Map client X → SVG userspace X (viewBox is 0..W).
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    // Find nearest day index.
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < days.length; i++) {
      const d = Math.abs(xFor(i) - svgX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  const linePath = cumPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yCum(p.count).toFixed(1)}`)
    .join(" ");
  const totalCases = cumPoints[cumPoints.length - 1]?.count ?? 0;
  const firstLabel = formatShort(days[0]);
  const lastLabel = formatShort(days[days.length - 1]);

  const hover = hoverIdx != null ? {
    day: days[hoverIdx],
    daily: dailyPoints[hoverIdx].count,
    cumulative: cumPoints[hoverIdx].count,
    x: xFor(hoverIdx),
  } : null;

  return (
    <div className={"relative px-3 py-2 " + (className ?? "")}>
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Reported events by date</span>
        <span className="font-semibold text-zinc-700">{totalCases} dated</span>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="mt-1 h-22 w-full cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Daily bars */}
          {dailyPoints.map((p, i) => {
            if (p.count === 0) return null;
            const x = xFor(i) - barW / 2;
            const y = yDaily(p.count);
            return (
              <rect
                key={`bar-${p.day}`}
                x={x}
                y={y}
                width={barW}
                height={H - pad.bottom - y}
                fill={hoverIdx === i ? "#475569" : "#cbd5e1"}
                rx={1}
              />
            );
          })}
          {/* Cumulative line */}
          <path d={linePath} stroke="#18181b" strokeWidth={1.5} fill="none" />
          {/* End-dot */}
          <circle
            cx={xFor(cumPoints.length - 1)}
            cy={yCum(cumPoints[cumPoints.length - 1].count)}
            r={2.5}
            fill="#18181b"
          />
          {/* Hover guide */}
          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={pad.top}
                y2={H - pad.bottom}
                stroke="#71717a"
                strokeWidth={0.5}
                strokeDasharray="2 2"
              />
              <circle cx={hover.x} cy={yCum(hover.cumulative)} r={3} fill="#18181b" />
            </>
          )}
          {/* X-axis */}
          <text x={pad.left} y={H - 4} fontSize="9" fill="#71717a">{firstLabel}</text>
          <text x={W - pad.right} y={H - 4} fontSize="9" fill="#71717a" textAnchor="end">{lastLabel}</text>
        </svg>
        {/* HTML tooltip positioned above the hover point */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-[10px] leading-tight text-white shadow-lg"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: "-4px",
            }}
          >
            <div className="font-semibold">{formatLong(hover.day)}</div>
            <div className="mt-0.5 flex gap-2 text-zinc-300">
              <span><span className="text-zinc-500">new</span> <b className="text-white">{hover.daily}</b></span>
              <span><span className="text-zinc-500">total</span> <b className="text-white">{hover.cumulative}</b></span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span><span className="inline-block h-1.5 w-3 rounded-sm bg-slate-300 align-middle" /> daily new</span>
        <span><span className="inline-block h-px w-3 bg-zinc-900 align-middle" /> cumulative</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-zinc-400">
        {datedCounts ? (
          <>
            Dates reported by source: <b>{datedCounts.onset}</b> illness onsets,{" "}
            <b>{datedCounts.narrative}</b> cruise event dates from narratives.
            {datedCounts.undated > 0 && <> {datedCounts.undated} undated.</>}
          </>
        ) : (
          <>Dates from the maintainer&apos;s line-list. Updates hourly.</>
        )}
      </p>
    </div>
  );
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  let d = new Date(start + "T00:00:00Z");
  const stop = new Date(end + "T00:00:00Z");
  for (let i = 0; i < 90 && d <= stop; i++) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatLong(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
