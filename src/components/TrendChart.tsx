"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DailyPoint } from "@/lib/types";

type DatedCounts = { onset: number; narrative: number; firstSeen: number; undated: number };

type Props = {
  daily: DailyPoint[];
  cumulative: DailyPoint[];
  datedCounts?: DatedCounts;
  className?: string;
};

export default function TrendChart({ daily, cumulative, datedCounts, className }: Props) {
  const [expanded, setExpanded] = useState(false);

  // ESC closes modal
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <ChartSurface
        daily={daily}
        cumulative={cumulative}
        datedCounts={datedCounts}
        className={className}
        variant="compact"
        onExpand={() => setExpanded(true)}
      />
      {expanded && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-lg bg-white p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setExpanded(false)}
              className="absolute right-3 top-3 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            <ChartSurface
              daily={daily}
              cumulative={cumulative}
              datedCounts={datedCounts}
              variant="expanded"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

type Variant = "compact" | "expanded";

type SurfaceProps = {
  daily: DailyPoint[];
  cumulative: DailyPoint[];
  datedCounts?: DatedCounts;
  className?: string;
  variant: Variant;
  onExpand?: () => void;
};

function ChartSurface({ daily, cumulative, datedCounts, className, variant, onExpand }: SurfaceProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { days, dailyPoints, cumPoints, geom } = useMemo(() => {
    const allDays = Array.from(
      new Set([...daily.map(p => p.day), ...cumulative.map(p => p.day)])
    ).sort();
    if (!allDays.length) return { days: [], dailyPoints: [], cumPoints: [], geom: null };

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

    const isCompact = variant === "compact";
    const W = isCompact ? 280 : 1000;
    const H = isCompact ? 90 : 360;
    const pad = isCompact
      ? { left: 8, right: 8, top: 8, bottom: 18 }
      : { left: 44, right: 16, top: 16, bottom: 32 };
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
      geom: { W, H, pad, innerW, innerH, maxDaily, maxCum, xFor, yDaily, yCum, barW },
    };
  }, [daily, cumulative, variant]);

  if (!geom || !days.length) {
    return (
      <div className={"px-3 py-4 text-center text-xs text-zinc-500 " + (className ?? "")}>
        Trend data will appear once cases are dated.
      </div>
    );
  }

  const { W, H, pad, xFor, yCum, yDaily, barW, maxCum } = geom;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    // Map client X → SVG userspace X. The wrapper has the same aspect as the
    // viewBox because the SVG has w-full + preserveAspectRatio default.
    const relX = (e.clientX - rect.left) / rect.width;
    const svgX = relX * W;
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

  const hover = hoverIdx != null ? {
    day: days[hoverIdx],
    daily: dailyPoints[hoverIdx].count,
    cumulative: cumPoints[hoverIdx].count,
    xPct: (xFor(hoverIdx) / W) * 100,
    yCumPct: (yCum(cumPoints[hoverIdx].count) / H) * 100,
  } : null;

  // Y-axis ticks for the expanded view.
  const yTicks = variant === "expanded" ? buildYTicks(maxCum) : [];

  // X-axis tick stride for expanded — show ~10 labels max.
  const xLabelStride = variant === "expanded"
    ? Math.max(1, Math.ceil(days.length / 10))
    : 0;

  const isCompact = variant === "compact";
  const heightClass = isCompact ? "h-[90px]" : "h-[360px]";
  const wrapperPadding = isCompact ? "px-3 py-2" : "";

  return (
    <div className={(isCompact ? wrapperPadding : "") + " " + (className ?? "")}>
      {/* Title row */}
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span className={isCompact ? "" : "text-xs"}>Reported events by date</span>
        <div className="flex items-center gap-3">
          <span className={"font-semibold " + (isCompact ? "text-zinc-700" : "text-zinc-900 text-base normal-case tracking-normal")}>
            {totalCases} dated
          </span>
          {isCompact && onExpand && (
            <button
              onClick={e => { e.stopPropagation(); onExpand(); }}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Expand chart"
              title="Expand"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M2 5V2h3M10 7v3H7M2 7v3h3M10 5V2H7" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Chart surface — hover handler on the wrapper so it covers the full
          visible area, not just the SVG (which can have intrinsic-size quirks). */}
      <div
        ref={wrapperRef}
        className={"relative mt-1 w-full cursor-crosshair " + heightClass}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        onClick={() => isCompact && onExpand?.()}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          {/* Y-axis gridlines + labels (expanded only) */}
          {yTicks.map(t => {
            const y = yCum(t);
            return (
              <g key={`yt-${t}`}>
                <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={pad.left - 6} y={y + 3} fontSize="11" fill="#71717a" textAnchor="end">{t}</text>
              </g>
            );
          })}

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
          <path d={linePath} stroke="#18181b" strokeWidth={variant === "compact" ? 1.5 : 2} fill="none" />

          {/* End-dot */}
          <circle
            cx={xFor(cumPoints.length - 1)}
            cy={yCum(cumPoints[cumPoints.length - 1].count)}
            r={variant === "compact" ? 2.5 : 4}
            fill="#18181b"
          />

          {/* Hover guide */}
          {hover && (
            <>
              <line
                x1={xFor(hoverIdx!)}
                x2={xFor(hoverIdx!)}
                y1={pad.top}
                y2={H - pad.bottom}
                stroke="#71717a"
                strokeWidth={0.7}
                strokeDasharray="3 3"
              />
              <circle cx={xFor(hoverIdx!)} cy={yCum(hover.cumulative)} r={variant === "compact" ? 3 : 5} fill="#18181b" />
            </>
          )}

          {/* X-axis labels — compact shows first+last only, expanded shows ~10 evenly spaced */}
          {isCompact ? (
            <>
              <text x={pad.left} y={H - 4} fontSize="9" fill="#71717a">{formatShort(days[0])}</text>
              <text x={W - pad.right} y={H - 4} fontSize="9" fill="#71717a" textAnchor="end">{formatShort(days[days.length - 1])}</text>
            </>
          ) : (
            days.map((d, i) => {
              if (i % xLabelStride !== 0 && i !== days.length - 1) return null;
              return (
                <text
                  key={`xl-${d}`}
                  x={xFor(i)}
                  y={H - 10}
                  fontSize="11"
                  fill="#71717a"
                  textAnchor="middle"
                >
                  {formatShort(d)}
                </text>
              );
            })
          )}
        </svg>

        {/* Hover tooltip — positioned in HTML space so we can place it
            inside the wrapper without SVG clipping issues. */}
        {hover && (
          <div
            className={
              "pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-zinc-900 text-white shadow-lg " +
              (isCompact ? "px-2 py-1 text-[10px] leading-tight" : "px-3 py-2 text-xs leading-tight")
            }
            style={{
              left: `${hover.xPct}%`,
              // Anchor above the cumulative line dot. Clamp to 0 so it
              // doesn't escape the top of the wrapper.
              top: `max(0px, calc(${hover.yCumPct}% - ${isCompact ? 36 : 48}px))`,
            }}
          >
            <div className="font-semibold whitespace-nowrap">{formatLong(hover.day)}</div>
            <div className="mt-0.5 flex gap-2 text-zinc-300">
              <span><span className="text-zinc-500">new</span> <b className="text-white">{hover.daily}</b></span>
              <span><span className="text-zinc-500">total</span> <b className="text-white">{hover.cumulative}</b></span>
            </div>
          </div>
        )}
      </div>

      {/* Legend + caption */}
      <div className={"mt-1 flex items-center justify-between text-[10px] text-zinc-500 " + (isCompact ? "" : "text-xs")}>
        <span><span className="inline-block h-1.5 w-3 rounded-sm bg-slate-300 align-middle" /> daily new</span>
        <span><span className="inline-block h-px w-3 bg-zinc-900 align-middle" /> cumulative</span>
      </div>
      <p className={"mt-1 leading-snug text-zinc-400 " + (isCompact ? "text-[10px]" : "text-xs")}>
        {datedCounts ? (
          <>
            Dates reported by source: <b>{datedCounts.onset}</b> illness onsets,{" "}
            <b>{datedCounts.narrative}</b> cruise event dates from narratives.
            {datedCounts.undated > 0 && <> {datedCounts.undated} undated.</>}
            {!isCompact && (
              <>
                {" "}Most dates above April 25 reflect cruise-cohort exposure (when passengers were on the ship), not personal illness onset.
              </>
            )}
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

function buildYTicks(max: number): number[] {
  // Nice round step at ~5 ticks.
  const target = 5;
  const rawStep = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10].map(m => m * mag);
  const step = candidates.find(c => max / c <= target + 1) ?? candidates[candidates.length - 1];
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round(max));
  return ticks;
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
