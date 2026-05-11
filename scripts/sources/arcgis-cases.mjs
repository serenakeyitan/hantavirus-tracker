// ArcGIS Feature Server — individual line-list of cases for the MV Hondius
// Andes-virus cluster, maintained by K. Panozzo, University of Toledo.
//
// This is the highest-resolution data source we have for the cruise outbreak:
// each case is its own row with status (CONFIRMED/SUSPECTED/DECEASED/MONITORING),
// last-known location (city-level lat/lng), a primary-source URL, and free-text
// narrative. The Feature Server is public, no auth, no apparent rate limit.
//
// Time-series tracking: the source doesn't expose a "logged at" timestamp per
// case, and only ~7% of cases have a real `onset` field. To get usable daily-
// new-cases data, this module also maintains public/case-history.json — a
// {caseId: firstSeenISO} map that records the first cron run that observed
// each caseId. This gives us "appeared-in-line-list-on-date-X" precision,
// which is honestly weaker than onset but is the real best-effort.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = resolve(__dirname, "..", "..", "public", "case-history.json");

const UA = "hantavirus-tracker/0.1 (+https://github.com/serenakeyitan/hantavirus-tracker)";
const FEATURE_URL =
  "https://services1.arcgis.com/wb4Og4gH5mvzQAIV/arcgis/rest/services/Tracking_Hantavirus_2026/FeatureServer/1/query";

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveHistory(history) {
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

// Parse the first "Month Day" pattern from a case's narrative. Matches both
// "April 24th" and "April 24". Defaults the year to the current year — the
// MV Hondius cluster is 2026, so this is correct for now; revisit if we
// extend to older outbreaks.
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const DATE_RX = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

function parseDateFromText(text) {
  if (!text) return null;
  const m = text.match(DATE_RX);
  if (!m) return null;
  const monthIdx = MONTHS[m[1].toLowerCase()];
  if (monthIdx == null) return null;
  const day = Number(m[2]);
  if (!day || day < 1 || day > 31) return null;
  const year = new Date().getUTCFullYear();
  const yyyy = String(year);
  const mm = String(monthIdx + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchArcgisCases() {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    outFields: "*",
    outSR: "4326",
    resultRecordCount: "500",
  });
  const url = `${FEATURE_URL}?${params}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`ArcGIS ${res.status}`);
  const json = await res.json();

  const cases = (json.features ?? [])
    .map(feat => {
      const p = feat.properties ?? {};
      const g = feat.geometry?.coordinates;
      if (!g || g.length < 2) return null;
      const [lng, lat] = g;
      const status = String(p.STATUS ?? "").toUpperCase();
      // Normalize the four canonical statuses; anything else gets folded into MONITORING.
      const normStatus =
        status === "CONFIRMED" || status === "DECEASED" || status === "SUSPECTED" || status === "MONITORING"
          ? status
          : "MONITORING";
      return {
        caseId: p.CASE_ ?? p.OBJECTID ?? null,
        status: normStatus,
        details: (p.DETAILS ?? "").trim(),
        location: (p.LASTLOCATION ?? "").trim(),
        sourceUrl: (p.SOURCE ?? "").trim() || null,
        exposureGroup: (p.Exposure_Group ?? "").trim() || null,
        onset: p.ONSET ? new Date(p.ONSET).toISOString() : null,
        lat,
        lng,
      };
    })
    .filter(Boolean);

  const counts = {
    confirmed: cases.filter(c => c.status === "CONFIRMED").length,
    deceased: cases.filter(c => c.status === "DECEASED").length,
    suspected: cases.filter(c => c.status === "SUSPECTED").length,
    monitoring: cases.filter(c => c.status === "MONITORING").length,
  };

  // Update first-seen history. Each cron run records the date for any caseId
  // not previously seen. Used as a fallback when no source date is available.
  const now = new Date().toISOString();
  const history = loadHistory();
  let newSeen = 0;
  for (const c of cases) {
    if (c.caseId == null) continue;
    const key = String(c.caseId);
    if (!history[key]) {
      history[key] = now;
      newSeen += 1;
    }
  }
  saveHistory(history);

  // For each case, pick the most authoritative reported date:
  //   1. onset (illness onset, ~7% of cases)
  //   2. Date parsed from the details narrative (~85% — usually the cruise
  //      disembark/event date, not illness onset, but it's a real source-
  //      reported date)
  //   3. firstSeenAt (when our cron first observed the caseId, last resort)
  // reportedDateSource tracks which one was used so the UI can be honest.
  for (const c of cases) {
    c.firstSeenAt = c.caseId != null ? history[String(c.caseId)] ?? null : null;
    const parsed = parseDateFromText(c.details);
    if (c.onset) {
      c.reportedDate = c.onset.slice(0, 10);
      c.reportedDateSource = "onset";
    } else if (parsed) {
      c.reportedDate = parsed;
      c.reportedDateSource = "narrative";
    } else if (c.firstSeenAt) {
      c.reportedDate = c.firstSeenAt.slice(0, 10);
      c.reportedDateSource = "first-seen";
    } else {
      c.reportedDate = null;
      c.reportedDateSource = null;
    }
  }

  // Daily series: bucket cases by their reportedDate (best available source date).
  const dailyMap = new Map();
  for (const c of cases) {
    if (!c.reportedDate) continue;
    dailyMap.set(c.reportedDate, (dailyMap.get(c.reportedDate) ?? 0) + 1);
  }
  const dailySeries = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
  // Cumulative running total.
  let cum = 0;
  const cumulativeSeries = dailySeries.map(({ day, count }) => {
    cum += count;
    return { day, count: cum };
  });
  // Provenance summary for the UI caption.
  const datedCounts = {
    onset: cases.filter(c => c.reportedDateSource === "onset").length,
    narrative: cases.filter(c => c.reportedDateSource === "narrative").length,
    firstSeen: cases.filter(c => c.reportedDateSource === "first-seen").length,
    undated: cases.filter(c => !c.reportedDate).length,
  };

  return {
    name: "MV Hondius case line-list (K. Panozzo, University of Toledo)",
    sourceUrl: "https://www.arcgis.com/apps/dashboards/5c68442d2afc42d7ba2696e4cd393729",
    featureServerUrl: FEATURE_URL,
    fetchedAt: new Date().toISOString(),
    newCasesThisRun: newSeen,
    counts,
    cases,
    dailySeries,         // [{day: "2026-05-11", count: 4}, ...]
    cumulativeSeries,    // [{day: "2026-05-11", count: 4}, ...] running total
    datedCounts,         // {onset, narrative, firstSeen, undated} for caption
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchArcgisCases()
    .then(d => {
      console.log("Counts:", d.counts);
      console.log("Cases (first 10):");
      for (const c of d.cases.slice(0, 10)) {
        console.log(`  #${c.caseId} ${c.status.padEnd(10)} ${c.location.padEnd(20)} ${c.details.slice(0, 60)}`);
      }
    })
    .catch(e => { console.error(e); process.exit(1); });
}
