"use client";

import type { DailyPoint } from "@/lib/types";

type Props = {
  daily: DailyPoint[];
  cumulative: DailyPoint[];
  className?: string;
};

// Tiny in-house chart — daily bars + cumulative line, no chart lib.
// The two series share the same X axis (days). Daily uses the left scale
// (bars), cumulative uses the right (line). Renders even with sparse data.
export default function TrendChart({ daily, cumulative, className }: Props) {
  if (!daily.length) {
    return (
      <div className={"px-3 py-4 text-center text-xs text-zinc-500 " + (className ?? "")}>
        Trend data starts when the tracker observes new cases on subsequent cron runs.
      </div>
    );
  }

  // Build a continuous day axis from min(daily) to today so gaps show up
  // as flat sections, not collapsed-out missing dates.
  const allDays = Array.from(new Set([...daily.map(p => p.day), ...cumulative.map(p => p.day)])).sort();
  const first = allDays[0];
  const last = todayUTC();
  const days = enumerateDays(first, last);

  const dailyByDay = new Map(daily.map(p => [p.day, p.count]));
  const cumulativeByDay = new Map(cumulative.map(p => [p.day, p.count]));

  // Fill cumulative forward (last known total carries through "no change" days).
  let lastCum = 0;
  const cumPoints = days.map(d => {
    const v = cumulativeByDay.get(d);
    if (v != null) lastCum = v;
    return { day: d, count: lastCum };
  });
  const dailyPoints = days.map(d => ({ day: d, count: dailyByDay.get(d) ?? 0 }));

  const W = 280;
  const H = 80;
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

  // Build cumulative line path.
  const linePath = cumPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yCum(p.count).toFixed(1)}`)
    .join(" ");

  const totalCases = cumPoints[cumPoints.length - 1]?.count ?? 0;
  const firstLabel = formatShort(days[0]);
  const lastLabel = formatShort(days[days.length - 1]);

  return (
    <div className={"px-3 py-2 " + (className ?? "")}>
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Cluster growth</span>
        <span className="font-semibold text-zinc-700">{totalCases} total</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-20 w-full">
        {/* Daily bars (slate) */}
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
              fill="#cbd5e1"
              rx={1}
            >
              <title>{`${p.day}: +${p.count} new`}</title>
            </rect>
          );
        })}
        {/* Cumulative line (zinc-900) */}
        <path d={linePath} stroke="#18181b" strokeWidth={1.5} fill="none" />
        {/* End-dot for cumulative */}
        {cumPoints.length > 0 && (() => {
          const last = cumPoints[cumPoints.length - 1];
          return (
            <circle
              cx={xFor(cumPoints.length - 1)}
              cy={yCum(last.count)}
              r={2.5}
              fill="#18181b"
            />
          );
        })()}
        {/* X-axis labels */}
        <text x={pad.left} y={H - 4} fontSize="9" fill="#71717a">{firstLabel}</text>
        <text x={W - pad.right} y={H - 4} fontSize="9" fill="#71717a" textAnchor="end">{lastLabel}</text>
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span><span className="inline-block h-1.5 w-3 rounded-sm bg-slate-300 align-middle" /> daily new</span>
        <span><span className="inline-block h-px w-3 bg-zinc-900 align-middle" /> cumulative</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-zinc-400">
        Counts reflect when cases were logged to the maintainer&apos;s line-list, not when illness started. Updates hourly.
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
  // Cap at ~90 days for sanity in case clock skew or seeded data goes weird.
  for (let i = 0; i < 90 && d <= stop; i++) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

function formatShort(iso: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = new Date(iso + "T00:00:00Z");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
