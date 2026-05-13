// PAHO Epidemiological Alert PDF parser.
//
// PAHO publishes hantavirus alerts at predictable URLs like:
//   /sites/default/files/YYYY-MM/YYYY-MM-DD-epidemiological-alert-hantavirus-engfinal_0.pdf
//
// Each alert has a "Summary of the situation" section with one paragraph per
// country ("In {Country}, between EW X and EW Y of {YYYY}, {N} cases of
// hantavirus pulmonary syndrome have been confirmed... {M} deaths"). We parse
// those paragraphs and emit per-country counts + sub-national breakdowns
// where present.
//
// Strategy:
//   1. Hit the PAHO documents-listing search for the most recent alert PDF.
//   2. pdftotext -layout, then per-country regex on the body.
//   3. Country centroid lookup for map placement.
//
// Caveat: PAHO publishes these alerts on its own cadence (not weekly). The
// most recent alert as of this writing is from Dec 2025. Numbers here reflect
// that snapshot, not real-time.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA = "hantavirus-tracker/0.1 (+https://github.com/serenakeyitan/hantavirus-tracker)";

// Country centroids for the PAHO countries. Subset of the WHO geocoder.
const COUNTRY_CENTROIDS = {
  Argentina: [-38.4, -63.6],
  Bolivia: [-16.29, -63.59],
  Brazil: [-14.24, -51.93],
  Chile: [-35.68, -71.54],
  Panama: [8.54, -80.78],
  Paraguay: [-23.44, -58.44],
  Uruguay: [-32.52, -55.77],
  Canada: [56.13, -106.35],
  "United States": [39.0, -98.0],
};

// Known PAHO alert PDF URLs. PAHO doesn't expose a clean listing API; new
// alerts get appended here as they're published. For now we pin to the
// Dec 2025 alert which is the most recent.
//
// Future: scrape https://www.paho.org/en/documents?type=alerts for newer.
const KNOWN_ALERTS = [
  {
    publishedDate: "2025-12-19",
    label: "Hantavirus Pulmonary Syndrome in Americas Region",
    url: "https://www.paho.org/sites/default/files/2025-12/2025-12-19-epidemiological-alert-hantavirus-engfinal_0.pdf",
  },
];

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function runPdftotext(pdfPath, txtPath) {
  const res = spawnSync("pdftotext", ["-layout", pdfPath, txtPath], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`pdftotext failed: ${res.stderr || res.stdout}`);
}

// Parse each "In {Country}, between EW X and EW Y of {YYYY}, {N} cases ..."
// paragraph from the alert text. Returns one entry per country mentioned.
function parseCountries(text) {
  const countries = [];
  // PAHO writes country names with parenthetical qualifiers we need to handle:
  //   "Bolivia (the Plurinational State of)"
  //   "the United States"
  //   "the United States of America"
  // We match a canonical name list and look for paragraphs starting with
  // "In <name>" (case-insensitive).
  const NAME_PATTERNS = [
    { paho: "Argentina", canonical: "Argentina" },
    { paho: "Bolivia", canonical: "Bolivia" },
    { paho: "Brazil", canonical: "Brazil" },
    { paho: "Chile", canonical: "Chile" },
    { paho: "Panama", canonical: "Panama" },
    { paho: "Paraguay", canonical: "Paraguay" },
    { paho: "Uruguay", canonical: "Uruguay" },
    { paho: "Canada", canonical: "Canada" },
    { paho: "the United States", canonical: "United States" },
  ];

  for (const { paho, canonical } of NAME_PATTERNS) {
    // Find paragraph: "In <name>, between EW X and EW Y of YYYY, N cases"
    // The N can be a number or a written word like "eight"; PAHO uses both.
    const escaped = paho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(
      `In ${escaped},\\s*between\\s+EW\\s*(\\d+)\\s*and\\s+EW\\s*(\\d+)\\s*of\\s*(\\d{4}),\\s*([a-z]+|\\d+)\\s+(?:confirmed\\s+)?cases?`,
      "i"
    );
    const m = text.match(rx);
    if (!m) continue;
    const startWeek = Number(m[1]);
    const endWeek = Number(m[2]);
    const year = Number(m[3]);
    const cases = parseCount(m[4]);
    if (cases == null) continue;

    // Find death count in the same paragraph. Look for "{N|word} deaths"
    // within ~800 chars of the country mention.
    const idx = text.search(rx);
    const slice = text.slice(idx, idx + 1200);
    const deathRx = /(\b[a-z]+|\b\d+)\s+deaths?\s+(?:have\s+been|are|were|to date|reported)/i;
    const dm = slice.match(deathRx);
    const deaths = dm ? parseCount(dm[1]) : null;

    const centroid = COUNTRY_CENTROIDS[canonical];
    if (!centroid) continue;
    countries.push({
      country: canonical,
      lat: centroid[0],
      lng: centroid[1],
      cases,
      deaths: deaths ?? null,
      epiWeekRange: `EW ${startWeek}-${endWeek} ${year}`,
      year,
    });
  }
  return countries;
}

// PAHO writes some counts as English words ("eight cases", "Six deaths").
function parseCount(token) {
  if (/^\d+$/.test(token)) return Number(token);
  const words = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20,
  };
  return words[token.toLowerCase()] ?? null;
}

export async function fetchPahoAlert() {
  // For now use the pinned latest. Later: scrape PAHO's alert listing for new ones.
  const alert = KNOWN_ALERTS[0];
  if (!alert) return null;

  const tmp = mkdirSync(join(tmpdir(), `paho-${Date.now()}`), { recursive: true });
  const pdfPath = join(tmp, "alert.pdf");
  const txtPath = join(tmp, "alert.txt");
  writeFileSync(pdfPath, await fetchBuffer(alert.url));
  runPdftotext(pdfPath, txtPath);
  const text = readFileSync(txtPath, "utf8");

  const countries = parseCountries(text);
  const totalCases = countries.reduce((a, c) => a + c.cases, 0);
  const totalDeaths = countries.reduce((a, c) => a + (c.deaths ?? 0), 0);

  return {
    name: "PAHO Epidemiological Alert",
    sourceUrl: alert.url,
    alertDate: alert.publishedDate,
    alertLabel: alert.label,
    fetchedAt: new Date().toISOString(),
    totalCases,
    totalDeaths,
    countries,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchPahoAlert()
    .then(d => {
      console.log(`Alert: ${d.alertLabel} (${d.alertDate})`);
      console.log(`  Total: ${d.totalCases} cases, ${d.totalDeaths} deaths`);
      console.log("Countries:");
      for (const c of d.countries.sort((a, b) => b.cases - a.cases)) {
        console.log(`  ${c.country.padEnd(20)} cases=${String(c.cases).padStart(3)} deaths=${c.deaths ?? "?"}  range=${c.epiWeekRange}`);
      }
    })
    .catch(e => { console.error(e); process.exit(1); });
}
