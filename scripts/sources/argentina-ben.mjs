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

  // Two-strategy parser:
  //
  // STRATEGY 1 (BEN 800-806 layout): all 7 (N, rate) pairs on a single line.
  //
  // STRATEGY 2 (BEN 807+ layout): narrow rate cells wrap vertically, e.g.
  //
  //                                          0,0          0,0
  //   Buenos Aires     27       0,15   16           14           ... 43    0,23
  //                                           9            8
  //
  // We only need the LATEST season's (N, rate) pair — that's the last two
  // numbers on the row's main line in both layouts. Extract those directly
  // instead of trying to reconstruct every wrapped column.
  //
  // We still need to validate the row genuinely belongs to the table (a
  // jurisdiction we recognise), and we still skip the regional aggregator
  // rows (Centro/NEA/NOA/Sur) which appear in both layouts.

  const rows = [];
  // Match: leading whitespace + jurisdiction name (letters, spaces, accents)
  //        + at least 3 numbers (sanity check the row has numeric content)
  //        + ending with `N rate` where rate has a decimal point or comma.
  // Province name lookup. BEN PDFs sometimes drop accents on province names
  // (BEN 807: "Entre Rios", "Neuquen", "Tucuman") so we list both spellings.
  // Map each variant to its canonical centroid key.
  const NAME_VARIANTS = {
    "Entre Ríos": "Entre Ríos", "Entre Rios": "Entre Ríos",
    "Río Negro": "Rio Negro",  "Rio Negro":  "Rio Negro",
    Neuquén: "Neuquén", Neuquen: "Neuquén",
    Tucumán: "Tucumán", Tucuman: "Tucumán",
  };
  const KNOWN_NAMES = new Set([
    ...Object.keys(PROVINCES),
    ...Object.keys(NAME_VARIANTS),
    "Centro", "NEA", "NOA", "Sur",
    "Total País", "Total Pais",
  ]);

  // Two acceptable end-of-row shapes:
  //   shape A:  "... <N> <rate>"  (last cell unwrapped)
  //   shape B:  "... <N>"          (rate wrapped to the line below)
  // We try A first (it has the rate inline so we don't have to look at the
  // wrap line), then fall back to B and harvest the rate from the next line.
  const rowRxFull = /^\s*([A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ. ]+?)\s+(\d+(?:[.,]\d+)?)\s+.*?(\d+)\s+(\d+[.,]\d+)\s*$/;
  const rowRxBareN = /^\s*([A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ. ]+?)\s+(\d+(?:[.,]\d+)?)\s+.*?\s(\d+)\s*$/;
  const total = { name: "Total País" };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = line.match(rowRxFull);
    let name, latestN, latestRate;
    if (m) {
      name = m[1].trim();
      latestN = Number(m[3]);
      latestRate = Number(m[4].replace(",", "."));
    } else {
      m = line.match(rowRxBareN);
      if (!m) continue;
      name = m[1].trim();
      if (!KNOWN_NAMES.has(name)) continue;
      latestN = Number(m[3]);
      // Rate wrapped vertically to the line below. Without column-position
      // awareness we can't safely tell which of the wrapped fragments belongs
      // to the latest-season column vs earlier columns. Report null rate.
      // The map sizes circles by case count, not rate, so this is acceptable.
      latestRate = null;
    }
    if (!KNOWN_NAMES.has(name)) continue;
    // latestN must be valid; latestRate can be null when wrapped.
    if (!Number.isFinite(latestN)) continue;

    // We only need the latest season for display, but compute a seasons array
    // for shape compatibility with the rest of the pipeline.
    const seasons = [{ n: latestN, rate: latestRate }];

    if (name === "Total País" || name === "Total Pais") {
      total.name = "Total País";
      total.seasons = seasons;
      continue;
    }
    if (name === "Centro" || name === "NEA" || name === "NOA" || name === "Sur") continue;
    // Normalise province name variants to the centroid key.
    const finalName = NAME_VARIANTS[name] || name;
    rows.push({ jurisdiction: finalName, seasons });
  }
  // Latest season is the LAST element of seasons[].
  const latestSeasonLabel = "2025-2026";
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
        const rate = p.ratePer100k != null ? p.ratePer100k.toFixed(2) : "—";
        console.log(`  ${p.jurisdiction.padEnd(20)} region=${p.region.padEnd(6)} cases=${p.cases}  rate=${rate}  andes=${p.isAndesRegion}`);
      }
    })
    .catch(e => { console.error(e); process.exit(1); });
}
