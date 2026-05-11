#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchArgentinaBEN } from "./sources/argentina-ben.mjs";
import { fetchArcgisCases } from "./sources/arcgis-cases.mjs";
import { fetchGDELT } from "./sources/gdelt.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "data.json");

const UA = "hantavirus-tracker/0.1 (+https://github.com/serenakeyitan/hantavirus-tracker)";

const HANTAVIRUS_LABELS = [
  "Hantavirus pulmonary syndrome",
  "Hantavirus infection, non-hantavirus pulmonary syndrome",
];

const STATE_CENTROIDS = {
  ALABAMA: [32.806671, -86.79113], ALASKA: [61.370716, -152.404419],
  ARIZONA: [33.729759, -111.431221], ARKANSAS: [34.969704, -92.373123],
  CALIFORNIA: [36.116203, -119.681564], COLORADO: [39.059811, -105.311104],
  CONNECTICUT: [41.597782, -72.755371], DELAWARE: [39.318523, -75.507141],
  "DISTRICT OF COLUMBIA": [38.897438, -77.026817], FLORIDA: [27.766279, -81.686783],
  GEORGIA: [33.040619, -83.643074], HAWAII: [21.094318, -157.498337],
  IDAHO: [44.240459, -114.478828], ILLINOIS: [40.349457, -88.986137],
  INDIANA: [39.849426, -86.258278], IOWA: [42.011539, -93.210526],
  KANSAS: [38.5266, -96.726486], KENTUCKY: [37.66814, -84.670067],
  LOUISIANA: [31.169546, -91.867805], MAINE: [44.693947, -69.381927],
  MARYLAND: [39.063946, -76.802101], MASSACHUSETTS: [42.230171, -71.530106],
  MICHIGAN: [43.326618, -84.536095], MINNESOTA: [45.694454, -93.900192],
  MISSISSIPPI: [32.741646, -89.678696], MISSOURI: [38.456085, -92.288368],
  MONTANA: [46.921925, -110.454353], NEBRASKA: [41.12537, -98.268082],
  NEVADA: [38.313515, -117.055374], "NEW HAMPSHIRE": [43.452492, -71.563896],
  "NEW JERSEY": [40.298904, -74.521011], "NEW MEXICO": [34.840515, -106.248482],
  "NEW YORK": [42.165726, -74.948051], "NORTH CAROLINA": [35.630066, -79.806419],
  "NORTH DAKOTA": [47.528912, -99.784012], OHIO: [40.388783, -82.764915],
  OKLAHOMA: [35.565342, -96.928917], OREGON: [44.572021, -122.070938],
  PENNSYLVANIA: [40.590752, -77.209755], "RHODE ISLAND": [41.680893, -71.51178],
  "SOUTH CAROLINA": [33.856892, -80.945007], "SOUTH DAKOTA": [44.299782, -99.438828],
  TENNESSEE: [35.747845, -86.692345], TEXAS: [31.054487, -97.563461],
  UTAH: [40.150032, -111.862434], VERMONT: [44.045876, -72.710686],
  VIRGINIA: [37.769337, -78.169968], WASHINGTON: [47.400902, -121.490494],
  "WEST VIRGINIA": [38.491226, -80.954453], WISCONSIN: [44.268543, -89.616508],
  WYOMING: [42.755966, -107.30249],
};

// Country centroids for WHO outbreak geocoding. Limited to countries that appear
// in WHO DON or have endemic hantavirus reservoirs (Americas + East Asia + Europe).
const COUNTRIES = {
  Argentina: [-38.4161, -63.6167], Bolivia: [-16.2902, -63.5887], Brazil: [-14.235, -51.9253],
  Chile: [-35.6751, -71.543], Colombia: [4.5709, -74.2973], "Costa Rica": [9.7489, -83.7534],
  Ecuador: [-1.8312, -78.1834], Paraguay: [-23.4425, -58.4438], Peru: [-9.19, -75.0152],
  Uruguay: [-32.5228, -55.7658], Venezuela: [6.4238, -66.5897], Mexico: [23.6345, -102.5528],
  Panama: [8.538, -80.7821], "United States": [37.0902, -95.7129], Canada: [56.1304, -106.3468],
  China: [35.8617, 104.1954], "South Korea": [35.9078, 127.7669], "North Korea": [40.3399, 127.5101],
  Japan: [36.2048, 138.2529], Russia: [61.524, 105.3188], Finland: [61.9241, 25.7482],
  Sweden: [60.1282, 18.6435], Norway: [60.472, 8.4689], Germany: [51.1657, 10.4515],
  France: [46.2276, 2.2137], Belgium: [50.5039, 4.4699], Netherlands: [52.1326, 5.2913],
  Switzerland: [46.8182, 8.2275], Austria: [47.5162, 14.5501], Spain: [40.4637, -3.7492],
  Portugal: [39.3999, -8.2245], Italy: [41.8719, 12.5674], Greece: [39.0742, 21.8243],
  "United Kingdom": [55.3781, -3.436], Ireland: [53.1424, -7.6921], Slovenia: [46.1512, 14.9955],
  Croatia: [45.1, 15.2], Czechia: [49.8175, 15.473], Slovakia: [48.669, 19.699],
  Hungary: [47.1625, 19.5033], Poland: [51.9194, 19.1451], Romania: [45.9432, 24.9668],
  Bulgaria: [42.7339, 25.4858], Serbia: [44.0165, 21.0059], "Bosnia and Herzegovina": [43.9159, 17.6791],
  "South Africa": [-30.5595, 22.9375], "Cabo Verde": [16.0021, -24.0132],
};
const COUNTRY_ALIASES = { "the Netherlands": "Netherlands", USA: "United States", US: "United States",
  UK: "United Kingdom", "United States of America": "United States", "Russian Federation": "Russia",
  "Republic of Korea": "South Korea", "Cape Verde": "Cabo Verde" };

function extractCountries(text) {
  const found = new Set();
  const haystack = ` ${text} `;
  for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
    if (new RegExp(`[\\s,(]${alias}[\\s,.)]`, "i").test(haystack)) found.add(canonical);
  }
  for (const name of Object.keys(COUNTRIES)) {
    if (new RegExp(`[\\s,(]${name}[\\s,.)]`, "i").test(haystack)) found.add(name);
  }
  return Array.from(found);
}

const REGION_NAMES = new Set([
  "US RESIDENTS", "NEW ENGLAND", "MID. ATLANTIC", "E.N. CENTRAL", "W.N. CENTRAL",
  "S. ATLANTIC", "E.S. CENTRAL", "W.S. CENTRAL", "MOUNTAIN", "PACIFIC",
  "TERRITORIES", "NON-US RESIDENTS",
]);

async function fetchCDC() {
  const labelClause = HANTAVIRUS_LABELS.map(l => `label='${l.replace(/'/g, "''")}'`).join(" OR ");
  const currentYear = new Date().getFullYear();
  const url = new URL("https://data.cdc.gov/resource/x9gk-5huc.json");
  url.searchParams.set("$where", `(${labelClause}) AND year>='${currentYear - 3}'`);
  url.searchParams.set("$limit", "50000");
  url.searchParams.set("$order", "year DESC, week DESC");

  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) throw new Error(`CDC ${res.status}`);
  const rows = await res.json();

  const byState = new Map();
  for (const row of rows) {
    const state = (row.states || row.location1 || row.location2 || "").trim();
    if (!state || REGION_NAMES.has(state)) continue;
    const centroid = STATE_CENTROIDS[state];
    if (!centroid) continue;
    const count = Number(row.m1 ?? row.m2 ?? 0);
    if (!Number.isFinite(count)) continue;
    const key = state;
    const prev = byState.get(key) ?? { state, lat: centroid[0], lng: centroid[1], total: 0, byYear: {} };
    prev.total += count;
    prev.byYear[row.year] = (prev.byYear[row.year] ?? 0) + count;
    byState.set(key, prev);
  }
  return Array.from(byState.values()).filter(s => s.total > 0);
}

async function fetchWHO() {
  // OData params with $ must not be URL-encoded; URLSearchParams escapes them, so build manually.
  // WHO caps $top at 100. Page across the most recent 300 items.
  const PAGE = 100;
  const PAGES = 3;
  const items = [];
  for (let i = 0; i < PAGES; i++) {
    const url = `https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$top=${PAGE}&$skip=${i * PAGE}&$orderby=PublicationDateAndTime+desc`;
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
    if (!res.ok) throw new Error(`WHO ${res.status} on page ${i}`);
    const json = await res.json();
    const batch = json.value ?? [];
    items.push(...batch);
    if (batch.length < PAGE) break;
  }

  const stripTags = s => (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return items
    .filter(item => {
      const rx = /hantavirus|sin nombre virus|andes virus|seoul virus|puumala/i;
      const title = item.Title ?? "";
      const lede = stripTags(item.Summary || item.Overview).slice(0, 300);
      return rx.test(title) || rx.test(lede);
    })
    .map(item => {
      const fullText = stripTags(`${item.Title ?? ""} ${item.Overview ?? ""} ${item.Response ?? ""} ${item.Summary ?? ""} ${item.Assessment ?? ""}`);
      const countries = extractCountries(fullText).map(name => ({
        name, lat: COUNTRIES[name][0], lng: COUNTRIES[name][1],
      }));
      // Andes virus is the only hantavirus with documented person-to-person
      // transmission — flag it separately so the UI can highlight outbreaks.
      const isAndes = /andes virus|\bANDV\b/i.test(fullText);
      const species = isAndes ? "andes"
        : /sin nombre/i.test(fullText) ? "sin-nombre"
        : /seoul virus/i.test(fullText) ? "seoul"
        : /puumala/i.test(fullText) ? "puumala"
        : "other";
      return {
        id: item.Id,
        title: stripTags(item.Title),
        summary: stripTags(item.Summary || item.Overview).slice(0, 400),
        publishedAt: item.PublicationDate,
        url: `https://www.who.int/emergencies/disease-outbreak-news/item/${item.UrlName}`,
        species,
        countries,
      };
    });
}

async function main() {
  console.log("Fetching CDC NNDSS...");
  const cdc = await fetchCDC().catch(err => {
    console.error("CDC fetch failed:", err.message);
    return [];
  });
  console.log(`  -> ${cdc.length} states with cases`);

  console.log("Fetching WHO DON...");
  const who = await fetchWHO().catch(err => {
    console.error("WHO fetch failed:", err.message);
    return [];
  });
  console.log(`  -> ${who.length} hantavirus-relevant outbreak posts`);

  console.log("Fetching Argentina BEN...");
  const argentina = await fetchArgentinaBEN().catch(err => {
    console.error("Argentina BEN fetch failed:", err.message);
    return null;
  });
  if (argentina) {
    console.log(`  -> bulletin ${argentina.bulletinIssue}: ${argentina.provinces.length} provinces, ${argentina.totalCases} total cases, ${argentina.andesCases} Andes-region cases`);
  }

  console.log("Fetching MV Hondius case line-list (ArcGIS)...");
  const hondius = await fetchArcgisCases().catch(err => {
    console.error("ArcGIS fetch failed:", err.message);
    return null;
  });
  if (hondius) {
    const c = hondius.counts;
    console.log(`  -> ${hondius.cases.length} cases: confirmed=${c.confirmed} deceased=${c.deceased} suspected=${c.suspected} monitoring=${c.monitoring}`);
  }

  console.log("Fetching GDELT global news signals...");
  const gdelt = await fetchGDELT().catch(err => {
    console.error("GDELT fetch failed:", err.message);
    return null;
  });
  if (gdelt) {
    console.log(`  -> ${gdelt.totalArticles} articles across ${gdelt.countries.length} source countries, ${Object.keys(gdelt.languages).length} languages`);
  }

  // Sources we attempted but cannot integrate (no machine-readable surface).
  // Recorded so the UI can show users what coverage we don't have.
  const blockedSources = [
    { name: "Chile MINSAL / DEIS", reason: "Data is published only via Power BI iframes and SAS Visual Analytics dashboards; no CSV/JSON export.", url: "https://deis.minsal.cl/" },
    { name: "PAHO PLISA", reason: "PAHO publishes regional hantavirus surveillance only through interactive dashboards; no public dataset API.", url: "https://www.paho.org/data/" },
    { name: "ProMED-mail archive", reason: "After ProMED's 2025 redesign the post archive is paywalled; the public API only exposes the corporate blog.", url: "https://promedmail.org/" },
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      cdc: { name: "CDC NNDSS Weekly", url: "https://data.cdc.gov/resource/x9gk-5huc", tier: "confirmed", rows: cdc },
      who: { name: "WHO Disease Outbreak News", url: "https://www.who.int/emergencies/disease-outbreak-news", tier: "confirmed", rows: who },
      argentina: argentina && {
        name: argentina.name,
        url: argentina.sourceUrl,
        bulletinIssue: argentina.bulletinIssue,
        tier: "confirmed",
        seasonLabel: argentina.seasonLabel,
        totalCases: argentina.totalCases,
        andesCases: argentina.andesCases,
        rows: argentina.provinces,
      },
      hondius: hondius && {
        name: hondius.name,
        url: hondius.sourceUrl,
        tier: "reported",
        counts: hondius.counts,
        cases: hondius.cases,
        dailySeries: hondius.dailySeries,
        cumulativeSeries: hondius.cumulativeSeries,
      },
      gdelt: gdelt && {
        name: gdelt.name,
        url: gdelt.sourceUrl,
        tier: "reported",
        timespan: gdelt.timespan,
        totalArticles: gdelt.totalArticles,
        languages: gdelt.languages,
        countries: gdelt.countries,
      },
    },
    blockedSources,
  };

  // Sanity check: warn if GDELT and WHO overlap. The UI suppresses these
  // duplicates via src/lib/dedupe.ts, but seeing the overlap in the build log
  // catches data-quality changes (e.g. if WHO adds a country and we never
  // notice GDELT is now redundant for it).
  if (gdelt && who.length) {
    const whoCountries = new Set(who.flatMap(p => p.countries.map(c => c.name)));
    const overlaps = gdelt.countries.filter(c => whoCountries.has(c.country));
    if (overlaps.length) {
      console.log(
        `  -> dedupe note: ${overlaps.length} GDELT countries also in WHO (UI hides these): ` +
        overlaps.map(c => `${c.country}(${c.count})`).join(", ")
      );
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
