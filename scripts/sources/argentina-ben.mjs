// Argentina BEN (Boletín Epidemiológico Nacional) — weekly PDF surveillance bulletin.
// Section VII covers Hantavirosis with a province × season table of confirmed cases.
// Source-of-truth for ~60-70% of global Andes virus surveillance.
//
// Strategy:
//   1. Scrape the year's index page to find the latest ben_NNN PDF URL
//      (filenames are inconsistent: ben-806-se-16-vf.pdf, ben_805_se_15_2842026.pdf, etc.)
//   2. Download with redirects
//   3. Convert to layout-preserving text via system `pdftotext`
//   4. Locate "Tabla 1. Hantavirosis: Casos confirmados" and parse the most recent season column

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA = "hantavirus-tracker/0.1 (+https://github.com/serenakeyitan/hantavirus-tracker)";

// Argentina province centroids. Only the provinces that appear in BEN's Hantavirosis
// table are included; "Sur" jurisdictions (Chubut, Neuquén, Río Negro) are where
// Andes virus is the prevalent genotype per BEN's genotype surveillance section.
const PROVINCES = {
  "Buenos Aires":    { lat: -36.6769, lng: -60.5588, region: "Centro" },
  "Entre Ríos":      { lat: -32.0589, lng: -59.2014, region: "Centro" },
  "Santa Fe":        { lat: -30.7069, lng: -60.9494, region: "Centro" },
  Chaco:             { lat: -26.7,    lng: -60.7,    region: "NEA" },
  Formosa:           { lat: -25.0,    lng: -59.5,    region: "NEA" },
  Misiones:          { lat: -27.0,    lng: -54.5,    region: "NEA" },
  Jujuy:             { lat: -23.3,    lng: -65.7,    region: "NOA" },
  Salta:             { lat: -24.7859, lng: -65.4117, region: "NOA" },
  Tucumán:           { lat: -26.8,    lng: -65.5,    region: "NOA" },
  Chubut:            { lat: -43.3,    lng: -68.7,    region: "Sur" },  // Andes virus
  Neuquén:           { lat: -38.95,   lng: -69.9,    region: "Sur" },  // Andes virus
  "Rio Negro":       { lat: -40.5,    lng: -67.0,    region: "Sur" },  // Andes virus
};
const ANDES_REGIONS = new Set(["Sur"]);

const YEAR_INDEX = "https://www.argentina.gob.ar/salud/boletin-epidemiologico-nacional/boletines-";

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function findLatestPdfUrl(year) {
  const html = await fetchText(`${YEAR_INDEX}${year}`);
  // Hrefs may look like: "blank:#https://...ben_806_se_16_vf.pdf" or "blank:#/sites/..."
  const matches = [
    ...html.matchAll(/href="(?:blank:#)?(?<url>(?:https:\/\/www\.argentina\.gob\.ar)?\/sites\/default\/files\/[^"]*ben[_-](\d{3})[^"]*\.pdf)"/gi),
  ];
  if (!matches.length) return null;
  // Pick by issue number (BEN ###); use the highest.
  let best = null;
  for (const m of matches) {
    const issue = Number(m[2]);
    const rawUrl = m.groups.url;
    const url = rawUrl.startsWith("http") ? rawUrl : `https://www.argentina.gob.ar${rawUrl}`;
    if (!best || issue > best.issue) best = { issue, url };
  }
  return best;
}

function runPdftotext(pdfPath, txtPath) {
  const res = spawnSync("pdftotext", ["-layout", pdfPath, txtPath], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`pdftotext failed: ${res.stderr || res.stdout}`);
}

function parseHantavirosisTable(text) {
  // Find the table header (the "Tabla 1" labeled "Casos confirmados" — not the deaths table).
  const headerIdx = text.search(/Tabla 1\.\s*Hantavirosis:\s*Casos confirmados/i);
  if (headerIdx < 0) throw new Error("Tabla 1 not found");
  const tableSlice = text.slice(headerIdx, headerIdx + 5000);
  const lines = tableSlice.split(/\r?\n/);

  // Each province row layout (after pdftotext -layout):
  //   "  Buenos Aires    27   0.15   16     0.09    12   0.07   14   0.08   8    0.04   19   0.10   42    0.23"
  // Capture: name (left-justified), then 7 (N, rate) pairs in order: 2019-2020 ... 2025-2026.
  // The latest season's N is the SECOND-TO-LAST number.
  const rows = [];
  const rowRx = /^\s+([A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ. ]+?)\s+((?:-?\d+\s+-?\d+\.\d+\s*){5,8})\s*$/;
  const total = { name: "Total País" };
  for (const line of lines) {
    const m = line.match(rowRx);
    if (!m) continue;
    const name = m[1].trim();
    const numbers = m[2].trim().split(/\s+/).map(Number);
    // Expect 7 (N, rate) pairs = 14 numbers, but pad to handle variations.
    if (numbers.length < 14) continue;
    const seasons = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      seasons.push({ n: numbers[i], rate: numbers[i + 1] });
    }
    if (name === "Total País") {
      total.name = name;
      total.seasons = seasons;
      continue;
    }
    if (name === "Centro" || name === "NEA" || name === "NOA" || name === "Sur") continue;
    rows.push({ jurisdiction: name, seasons });
  }
  // Latest season is the LAST element of seasons[].
  const latestSeasonLabel = "2025-2026"; // The current BEN through SE 16, season-to-date.
  const provinces = rows
    .map(r => {
      const c = PROVINCES[r.jurisdiction];
      const latest = r.seasons[r.seasons.length - 1];
      if (!c || !latest) return null;
      return {
        jurisdiction: r.jurisdiction,
        region: c.region,
        lat: c.lat,
        lng: c.lng,
        cases: latest.n,
        ratePer100k: latest.rate,
        isAndesRegion: ANDES_REGIONS.has(c.region),
        seasonLabel: latestSeasonLabel,
      };
    })
    .filter(p => p && p.cases > 0);

  return { provinces, totalCases: total.seasons?.[total.seasons.length - 1]?.n ?? null };
}

export async function fetchArgentinaBEN() {
  const now = new Date();
  const yearsToTry = [now.getUTCFullYear(), now.getUTCFullYear() - 1];
  let pdfUrl = null;
  let issue = null;
  for (const y of yearsToTry) {
    const found = await findLatestPdfUrl(y);
    if (found) { pdfUrl = found.url; issue = found.issue; break; }
  }
  if (!pdfUrl) throw new Error("BEN year-index returned no PDFs");

  const tmp = mkdirSync(join(tmpdir(), `ben-${Date.now()}`), { recursive: true });
  const pdfPath = join(tmp, "ben.pdf");
  const txtPath = join(tmp, "ben.txt");
  writeFileSync(pdfPath, await fetchBuffer(pdfUrl));
  runPdftotext(pdfPath, txtPath);
  const text = readFileSync(txtPath, "utf8");

  const { provinces, totalCases } = parseHantavirosisTable(text);
  return {
    name: "Argentina BEN (Ministerio de Salud)",
    sourceUrl: pdfUrl,
    bulletinIssue: issue,
    fetchedAt: new Date().toISOString(),
    seasonLabel: "2025-2026 SE 27→",
    totalCases,
    andesCases: provinces.filter(p => p.isAndesRegion).reduce((a, p) => a + p.cases, 0),
    provinces,
  };
}

// Run as a script for quick verification.
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchArgentinaBEN()
    .then(d => {
      console.log("Bulletin:", d.bulletinIssue, "| URL:", d.sourceUrl);
      console.log("Total cases YTD:", d.totalCases, "| Andes-region cases:", d.andesCases);
      console.log("Provinces:");
      for (const p of d.provinces.sort((a, b) => b.cases - a.cases)) {
        console.log(`  ${p.jurisdiction.padEnd(20)} region=${p.region.padEnd(6)} cases=${p.cases}  rate=${p.ratePer100k.toFixed(2)}  andes=${p.isAndesRegion}`);
      }
    })
    .catch(e => { console.error(e); process.exit(1); });
}
